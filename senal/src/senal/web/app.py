"""Aplicación web: bandeja → ficha → borrador → revisión, y consultas en español.

Una sola app para las dos modalidades (ADR 0003): ``?modalidad=banca`` cambia la
salida (boletín de entorno con series SBP) sin cambiar bandeja, puntaje ni motor.

Funciona sin internet (T10): snapshot local, modelo de embeddings en caché y,
si no hay LLM, plantilla extractiva rotulada. Sin CDN: CSS propio, sin JS externo.
Arranque: ``uv run uvicorn senal.web.app:crear_app_desde_entorno --factory``.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import secrets
import threading
from collections import OrderedDict
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.trustedhost import TrustedHostMiddleware

from senal.banca import (
    MODALIDADES,
    SECTORES_POR_TEMA,
    VERSION_BANCA,
    enlazar_sbp,
    es_tema_bancario,
    normalizar_modalidad,
)
from senal.boletin import (
    agrupar_afirmaciones,
    formato_banca,
    ids_consulta_banca,
    tema_de_consulta,
)
from senal.catalogo import AVISO_SBP
from senal.embed import cargar_codificador
from senal.generate import ResultadoRespuesta, responder
from senal.ingest import SerieSBP
from senal.llm import ProveedorLLM, cargar_proveedor
from senal.organize import TEMAS
from senal.pipeline import (
    Bandeja,
    Tema,
    cargar_snapshot,
    construir_bandeja,
    evidencias_de,
    vectores_noticias,
)
from senal.retrieve import Buscador
from senal.review import ESTADOS, RegistroRevisiones, Revision, anexar_jsonl, ficha_contrato
from senal.sbp import SECTORES
from senal.score import PESOS

log = logging.getLogger(__name__)

RAIZ = Path(__file__).resolve().parents[3]
DIRECTORIO = Path(__file__).resolve().parent
HORA_PANAMA = timezone(timedelta(hours=-5), "America/Panama")
POR_PAGINA = 40
MAX_CONSULTA = 300
MAX_TOKEN = 100
CABECERAS_SEGURIDAD = {
    "Content-Security-Policy": (
        "default-src 'self'; style-src 'self'; img-src 'self' data:; form-action 'self'; "
        "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cache-Control": "no-store",
}
MAX_CONSULTAS_EN_CACHE = 128


@dataclass(frozen=True)
class Config:
    procesado: Path = RAIZ / "data" / "processed"
    revisiones: Path = RAIZ / "data" / "reviews.jsonl"
    usar_modelo: bool = True
    usar_llm: bool = True
    # Solo nombres locales: bloquea DNS rebinding contra el servidor de la demo.
    hosts_permitidos: tuple[str, ...] = ("127.0.0.1", "localhost")

    @property
    def fichas(self) -> Path:
        return self.revisiones.with_name("fichas.jsonl")

    @classmethod
    def desde_entorno(cls) -> Config:
        return cls(
            procesado=Path(os.environ.get("SENAL_PROCESADO", RAIZ / "data" / "processed")),
            revisiones=Path(os.environ.get("SENAL_REVISIONES", RAIZ / "data" / "reviews.jsonl")),
            usar_modelo=os.environ.get("SENAL_SIN_MODELO", "") != "1",
            usar_llm=os.environ.get("SENAL_LLM", "") != "ninguno",
        )


@dataclass
class Estado:
    config: Config
    bandeja: Bandeja
    buscador: Buscador
    proveedor: ProveedorLLM | None
    registro: RegistroRevisiones
    manifest: dict[str, Any]
    reporte: dict[str, Any]
    # Modalidad bancaria: mismo corpus + series SBP (vectores editoriales reutilizados).
    buscador_banca: Buscador
    series_sbp: tuple[SerieSBP, ...] = ()
    csrf: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    borradores: dict[str, ResultadoRespuesta] = field(default_factory=dict)
    boletines: dict[str, ResultadoRespuesta] = field(default_factory=dict)
    consultas: OrderedDict[tuple[str, str], ResultadoRespuesta] = field(
        default_factory=OrderedDict
    )
    # Una generación a la vez: protege la cuota del LLM y el orden de escritura.
    candado: threading.Lock = field(default_factory=threading.Lock)
    temas: dict[str, Tema] = field(init=False)

    def __post_init__(self) -> None:
        self.temas = {t.id_evento: t for t in self.bandeja.temas}

    def consultar(self, pregunta: str, modalidad: str = "editorial") -> ResultadoRespuesta:
        """Respuesta cacheada por consulta (acotada): un GET repetido no vuelve a llamar al LLM."""
        clave = (modalidad, pregunta)
        with self.candado:
            if clave in self.consultas:
                self.consultas.move_to_end(clave)
                return self.consultas[clave]
            if modalidad == "banca":
                resultado = responder(
                    pregunta,
                    self.buscador_banca,
                    self.proveedor,
                    ids_obligatorios=ids_consulta_banca(
                        pregunta, self.bandeja.temas, self.series_sbp
                    ),
                    formato=formato_banca(tema_de_consulta(pregunta)),
                )
            else:
                resultado = responder(pregunta, self.buscador, self.proveedor)
            self.consultas[clave] = resultado
            if len(self.consultas) > MAX_CONSULTAS_EN_CACHE:
                self.consultas.popitem(last=False)
            return resultado

    @property
    def nombre_llm(self) -> str:
        if self.proveedor is None:
            return "plantilla extractiva (sin LLM)"
        return f"{self.proveedor.nombre}:{self.proveedor.modelo}"


def _hora_panama(momento: datetime | str | None) -> str:
    if not momento:
        return "—"
    if isinstance(momento, str):
        momento = datetime.fromisoformat(momento)
    return momento.astimezone(HORA_PANAMA).strftime("%d/%m/%Y %H:%M")


def _progreso(mensaje: str) -> None:
    print(f"[server_start] {mensaje}", flush=True)


def _cargar_estado(config: Config) -> Estado:
    _progreso("[Carga 1/5] Leyendo snapshot de datos procesados...")
    snapshot = cargar_snapshot(config.procesado)
    _progreso("[Carga 2/5] Cargando modelo de embeddings (por favor espere)...")
    codificador = cargar_codificador() if config.usar_modelo else None
    _progreso("[Carga 3/5] Agrupando señales por evento y calculando ranking...")
    vectores = (
        vectores_noticias(snapshot, codificador, config.procesado / "embeddings.npz")
        if codificador
        else None
    )
    bandeja = construir_bandeja(snapshot, codificador, vectores)
    _progreso("[Carga 4/5] Indexando motor de búsqueda y evidencias oficiales...")
    buscador = Buscador(evidencias_de(snapshot), codificador)
    series = [e for e in evidencias_de(snapshot, incluir_sbp=True) if e.tipo == "serie_sbp"]
    buscador_banca = buscador.con_evidencias(series)
    _progreso("[Carga 5/5] Conectando proveedor de redacción y registro...")
    proveedor = cargar_proveedor() if config.usar_llm else None
    reporte = json.loads((config.procesado / "reporte_calidad.json").read_text("utf-8"))
    log.info("Bandeja lista: %d temas, modo %s", len(bandeja.temas), bandeja.modo_ia)
    _progreso(f"¡Listo! Bandeja cargada con {len(bandeja.temas)} temas. Servidor listo.")
    registro = RegistroRevisiones(config.revisiones)
    return Estado(
        config,
        bandeja,
        buscador,
        proveedor,
        registro,
        snapshot.manifest,
        reporte,
        buscador_banca,
        snapshot.series_sbp,
    )


def _filtrar(temas: tuple[Tema, ...], tema: str, banda: str, evidencia: str) -> list[Tema]:
    return [
        t
        for t in temas
        if (not tema or t.tema == tema)
        and (not banda or t.puntaje.banda == banda)
        and (not evidencia or t.estado_evidencia == evidencia)
    ]


def _ids_evidencia(tema: Tema) -> list[str]:
    return [
        *tema.ids_noticias,
        *(e.id_evidencia for e in tema.enlaces_indicadores),
        *(e.id_evidencia for e in tema.enlaces_sismos),
    ]


def _nombres_sectores(tema: str) -> list[str]:
    """Sectores SBP del mapa ``banca-1.0.0`` para mostrar como hipótesis en la bandeja."""
    return [SECTORES[s][0] for s in SECTORES_POR_TEMA.get(tema, ())]


def imprimir_banner_listo(puerto: int | str = 8765) -> None:
    """Imprime un recuadro claro con la URL para usuarios finales sin experiencia tecnica."""
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return
    url_1 = f"http://127.0.0.1:{puerto}/"
    url_2 = f"http://localhost:{puerto}/"
    ancho_interior = 74
    borde = "  +" + "-" * ancho_interior + "+"

    def fila(contenido: str = "") -> str:
        return "  |  " + contenido.ljust(ancho_interior - 4) + "  |"

    lineas = [
        "",
        "=" * (ancho_interior + 4),
        borde,
        fila(),
        fila("[OK] !SISTEMA EDITORIAL LISTO Y EN FUNCIONAMIENTO!"),
        fila(),
        fila("Por favor, abre tu navegador web e ingresa a cualquiera de estas URLs:"),
        fila(),
        fila(f">>  {url_1}"),
        fila(f">>  {url_2}"),
        fila(),
        fila("-" * (ancho_interior - 4)),
        fila("Por que creamos una version web?"),
        fila("Esta interfaz fue pensada para editores y periodistas de TVN Media:"),
        fila("no necesitas conocimientos tecnicos ni usar la consola de comandos."),
        fila("Todo se opera de forma 100% visual, rapida e intuitiva:"),
        fila(),
        fila("* BANDEJA DE TEMAS: 1,614 eventos agrupados y priorizados con IA"),
        fila("* CONSULTA IA: Respuestas fundamentadas en fuentes oficiales auditadas"),
        fila("* DATOS Y CALIDAD: Metricas de precision y trazabilidad SHA-256"),
        fila(),
        fila("(Para detener el servidor en cualquier momento, presiona Ctrl + C)"),
        fila(),
        borde,
        "=" * (ancho_interior + 4),
        "",
    ]
    print("\n".join(lineas), flush=True)


def crear_app(config: Config) -> FastAPI:
    estado = _cargar_estado(config)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async def _anuncio() -> None:
            await asyncio.sleep(0.3)
            puerto = os.environ.get("SENAL_PUERTO", "8765")
            imprimir_banner_listo(puerto)

        tarea = asyncio.create_task(_anuncio())
        try:
            yield
        finally:
            tarea.cancel()

    app = FastAPI(title="Señal TVN", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(config.hosts_permitidos))
    app.mount("/static", StaticFiles(directory=DIRECTORIO / "static"), name="static")
    plantillas = Jinja2Templates(directory=DIRECTORIO / "templates")
    plantillas.env.filters["hora"] = _hora_panama

    @app.middleware("http")
    async def cabeceras(
        request: Request, siguiente: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        respuesta = await siguiente(request)
        respuesta.headers.update(CABECERAS_SEGURIDAD)
        return respuesta

    def contexto(modalidad: str = "editorial", **extra: Any) -> dict[str, Any]:
        banca = modalidad == "banca"
        return {
            "bandeja": estado.bandeja,
            "llm": estado.nombre_llm,
            "modo_busqueda": estado.buscador.modo,
            "csrf": estado.csrf,
            "temas_catalogo": TEMAS,
            "pesos": PESOS,
            "modalidad": modalidad,
            # Sufijos para conservar la modalidad en enlaces: "?" al inicio, "&" después.
            "qm": "?modalidad=banca" if banca else "",
            "am": "&modalidad=banca" if banca else "",
            "aviso_sbp": AVISO_SBP,
            "version_banca": VERSION_BANCA,
            "sectores_de": _nombres_sectores,
            **extra,
        }

    def verificar_csrf(token: str) -> None:
        if not hmac.compare_digest(token, estado.csrf):
            raise HTTPException(status_code=403, detail="Token de formulario inválido")

    def tema_o_404(id_evento: str) -> Tema:
        tema = estado.temas.get(id_evento)
        if tema is None:
            raise HTTPException(status_code=404, detail="Tema no encontrado")
        return tema

    def resultado_de(id_evento: str, modalidad: str) -> ResultadoRespuesta | None:
        guardados = estado.boletines if modalidad == "banca" else estado.borradores
        return guardados.get(id_evento)

    def render_tema(request: Request, tema: Tema, modalidad: str) -> HTMLResponse:
        resultado = resultado_de(tema.id_evento, modalidad)
        observaciones, hipotesis = (
            agrupar_afirmaciones(resultado.aceptadas) if resultado else ([], [])
        )
        return plantillas.TemplateResponse(
            request,
            "tema.html",
            contexto(
                modalidad,
                seccion="bandeja",
                tema=tema,
                resultado=resultado,
                observaciones=observaciones,
                hipotesis=hipotesis,
                enlaces_sbp=enlazar_sbp(tema.tema, estado.series_sbp),
                historial=estado.registro.historial(tema.id_evento, modalidad),
                estado_revision=estado.registro.estado_actual(tema.id_evento, modalidad),
                estados=ESTADOS,
            ),
        )

    @app.get("/", response_class=HTMLResponse)
    def bandeja(
        request: Request,
        tema: str = "",
        banda: str = "",
        evidencia: str = "",
        pagina: int = 1,
        modalidad: str = "",
    ) -> HTMLResponse:
        modalidad = normalizar_modalidad(modalidad)
        filtrados = _filtrar(estado.bandeja.temas, tema, banda, evidencia)
        if modalidad == "banca":
            # Banca: solo temas con sectores mapeados; el orden y el puntaje no cambian.
            filtrados = [t for t in filtrados if es_tema_bancario(t.tema)]
        pagina = max(1, pagina)
        visibles = filtrados[(pagina - 1) * POR_PAGINA : pagina * POR_PAGINA]
        return plantillas.TemplateResponse(
            request,
            "bandeja.html",
            contexto(
                modalidad,
                seccion="bandeja",
                visibles=visibles,
                total=len(filtrados),
                pagina=pagina,
                por_pagina=POR_PAGINA,
                filtros={"tema": tema, "banda": banda, "evidencia": evidencia},
                revisiones=estado.registro.ultimos(modalidad),
            ),
        )

    @app.get("/tema/{id_evento}", response_class=HTMLResponse)
    def ficha(request: Request, id_evento: str, modalidad: str = "") -> HTMLResponse:
        return render_tema(request, tema_o_404(id_evento), normalizar_modalidad(modalidad))

    @app.post("/tema/{id_evento}/borrador", response_class=HTMLResponse)
    def borrador(
        request: Request, id_evento: str, csrf: Annotated[str, Form(max_length=MAX_TOKEN)]
    ) -> HTMLResponse:
        verificar_csrf(csrf)
        tema = tema_o_404(id_evento)
        with estado.candado:
            estado.borradores[id_evento] = responder(
                tema.titulo,
                estado.buscador,
                estado.proveedor,
                ids_obligatorios=_ids_evidencia(tema),
            )
        return render_tema(request, tema, "editorial")

    @app.post("/tema/{id_evento}/boletin", response_class=HTMLResponse)
    def boletin(
        request: Request, id_evento: str, csrf: Annotated[str, Form(max_length=MAX_TOKEN)]
    ) -> HTMLResponse:
        verificar_csrf(csrf)
        tema = tema_o_404(id_evento)
        enlaces = enlazar_sbp(tema.tema, estado.series_sbp)
        with estado.candado:
            estado.boletines[id_evento] = responder(
                tema.titulo,
                estado.buscador_banca,
                estado.proveedor,
                ids_obligatorios=[*_ids_evidencia(tema), *(e.id_evidencia for e in enlaces)],
                formato=formato_banca(tema.tema if es_tema_bancario(tema.tema) else None),
            )
        return render_tema(request, tema, "banca")

    @app.post("/tema/{id_evento}/revision")
    def revision(
        id_evento: str,
        csrf: Annotated[str, Form(max_length=MAX_TOKEN)],
        estado_nuevo: Annotated[str, Form(alias="estado", max_length=40)],
        revisor: Annotated[str, Form(max_length=120)],
        nota: Annotated[str, Form(max_length=1000)] = "",
        modalidad: Annotated[str, Form(max_length=20)] = "editorial",
    ) -> RedirectResponse:
        verificar_csrf(csrf)
        tema = tema_o_404(id_evento)
        if modalidad not in MODALIDADES:
            raise HTTPException(status_code=422, detail="Modalidad no permitida")
        decision = Revision(
            id_evento,
            estado_nuevo,
            revisor,
            nota,
            datetime.now(UTC),
            tema.ids_noticias,
            modalidad,
        )
        try:
            registrada = estado.registro.registrar(decision)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        anexar_jsonl(
            config.fichas, ficha_contrato(tema, resultado_de(id_evento, modalidad), registrada)
        )
        sufijo = "?modalidad=banca" if modalidad == "banca" else ""
        return RedirectResponse(f"/tema/{id_evento}{sufijo}", status_code=303)

    @app.get("/consulta", response_class=HTMLResponse)
    def consulta(request: Request, q: str = "", modalidad: str = "") -> HTMLResponse:
        modalidad = normalizar_modalidad(modalidad)
        pregunta = q.strip()[:MAX_CONSULTA]
        resultado = estado.consultar(pregunta, modalidad) if pregunta else None
        observaciones, hipotesis = (
            agrupar_afirmaciones(resultado.aceptadas) if resultado else ([], [])
        )
        return plantillas.TemplateResponse(
            request,
            "consulta.html",
            contexto(
                modalidad,
                seccion="consulta",
                q=pregunta,
                resultado=resultado,
                observaciones=observaciones,
                hipotesis=hipotesis,
            ),
        )

    @app.get("/calidad", response_class=HTMLResponse)
    def calidad(request: Request, modalidad: str = "") -> HTMLResponse:
        return plantillas.TemplateResponse(
            request,
            "calidad.html",
            contexto(
                normalizar_modalidad(modalidad),
                seccion="calidad",
                manifest=estado.manifest,
                reporte=estado.reporte,
            ),
        )

    @app.get("/salud")
    def salud() -> JSONResponse:
        return JSONResponse(
            {
                "temas": len(estado.bandeja.temas),
                "modo_ia": estado.bandeja.modo_ia,
                "busqueda": estado.buscador.modo,
                "llm": estado.nombre_llm,
                "corte_utc": estado.bandeja.corte.isoformat(),
                "version_reglas": estado.bandeja.version_reglas,
            }
        )

    return app


def crear_app_desde_entorno() -> FastAPI:
    load_dotenv(RAIZ / ".env")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    return crear_app(Config.desde_entorno())
