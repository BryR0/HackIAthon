"""Aplicación web: bandeja → ficha → borrador → revisión, y consultas en español.

Funciona sin internet (T10): snapshot local, modelo de embeddings en caché y,
si no hay LLM, plantilla extractiva rotulada. Sin CDN: CSS propio, sin JS externo.
Arranque: ``uv run uvicorn senal.web.app:crear_app_desde_entorno --factory``.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import secrets
import threading
from collections import OrderedDict
from collections.abc import Awaitable, Callable
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

from senal.embed import cargar_codificador
from senal.generate import ResultadoRespuesta, responder
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
    csrf: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    borradores: dict[str, ResultadoRespuesta] = field(default_factory=dict)
    consultas: OrderedDict[str, ResultadoRespuesta] = field(default_factory=OrderedDict)
    # Una generación a la vez: protege la cuota del LLM y el orden de escritura.
    candado: threading.Lock = field(default_factory=threading.Lock)
    temas: dict[str, Tema] = field(init=False)

    def __post_init__(self) -> None:
        self.temas = {t.id_evento: t for t in self.bandeja.temas}

    def consultar(self, pregunta: str) -> ResultadoRespuesta:
        """Respuesta cacheada por consulta (acotada): un GET repetido no vuelve a llamar al LLM."""
        with self.candado:
            if pregunta in self.consultas:
                self.consultas.move_to_end(pregunta)
                return self.consultas[pregunta]
            resultado = responder(pregunta, self.buscador, self.proveedor)
            self.consultas[pregunta] = resultado
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


def _cargar_estado(config: Config) -> Estado:
    snapshot = cargar_snapshot(config.procesado)
    codificador = cargar_codificador() if config.usar_modelo else None
    vectores = (
        vectores_noticias(snapshot, codificador, config.procesado / "embeddings.npz")
        if codificador
        else None
    )
    bandeja = construir_bandeja(snapshot, codificador, vectores)
    buscador = Buscador(evidencias_de(snapshot), codificador)
    proveedor = cargar_proveedor() if config.usar_llm else None
    reporte = json.loads((config.procesado / "reporte_calidad.json").read_text("utf-8"))
    log.info("Bandeja lista: %d temas, modo %s", len(bandeja.temas), bandeja.modo_ia)
    registro = RegistroRevisiones(config.revisiones)
    return Estado(config, bandeja, buscador, proveedor, registro, snapshot.manifest, reporte)


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


def crear_app(config: Config) -> FastAPI:
    estado = _cargar_estado(config)
    app = FastAPI(title="Señal TVN", docs_url=None, redoc_url=None)
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

    def contexto(**extra: Any) -> dict[str, Any]:
        return {
            "bandeja": estado.bandeja,
            "llm": estado.nombre_llm,
            "modo_busqueda": estado.buscador.modo,
            "csrf": estado.csrf,
            "temas_catalogo": TEMAS,
            "pesos": PESOS,
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

    def render_tema(request: Request, tema: Tema) -> HTMLResponse:
        return plantillas.TemplateResponse(
            request,
            "tema.html",
            contexto(
                seccion="bandeja",
                tema=tema,
                resultado=estado.borradores.get(tema.id_evento),
                historial=estado.registro.historial(tema.id_evento),
                estado_revision=estado.registro.estado_actual(tema.id_evento),
                estados=ESTADOS,
            ),
        )

    @app.get("/", response_class=HTMLResponse)
    def bandeja(
        request: Request, tema: str = "", banda: str = "", evidencia: str = "", pagina: int = 1
    ) -> HTMLResponse:
        filtrados = _filtrar(estado.bandeja.temas, tema, banda, evidencia)
        pagina = max(1, pagina)
        visibles = filtrados[(pagina - 1) * POR_PAGINA : pagina * POR_PAGINA]
        return plantillas.TemplateResponse(
            request,
            "bandeja.html",
            contexto(
                seccion="bandeja",
                visibles=visibles,
                total=len(filtrados),
                pagina=pagina,
                por_pagina=POR_PAGINA,
                filtros={"tema": tema, "banda": banda, "evidencia": evidencia},
                revisiones=estado.registro.ultimos(),
            ),
        )

    @app.get("/tema/{id_evento}", response_class=HTMLResponse)
    def ficha(request: Request, id_evento: str) -> HTMLResponse:
        return render_tema(request, tema_o_404(id_evento))

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
        return render_tema(request, tema)

    @app.post("/tema/{id_evento}/revision")
    def revision(
        id_evento: str,
        csrf: Annotated[str, Form(max_length=MAX_TOKEN)],
        estado_nuevo: Annotated[str, Form(alias="estado", max_length=40)],
        revisor: Annotated[str, Form(max_length=120)],
        nota: Annotated[str, Form(max_length=1000)] = "",
    ) -> RedirectResponse:
        verificar_csrf(csrf)
        tema = tema_o_404(id_evento)
        decision = Revision(
            id_evento, estado_nuevo, revisor, nota, datetime.now(UTC), tema.ids_noticias
        )
        try:
            registrada = estado.registro.registrar(decision)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        anexar_jsonl(
            config.fichas, ficha_contrato(tema, estado.borradores.get(id_evento), registrada)
        )
        return RedirectResponse(f"/tema/{id_evento}", status_code=303)

    @app.get("/consulta", response_class=HTMLResponse)
    def consulta(request: Request, q: str = "") -> HTMLResponse:
        pregunta = q.strip()[:MAX_CONSULTA]
        resultado = estado.consultar(pregunta) if pregunta else None
        return plantillas.TemplateResponse(
            request, "consulta.html", contexto(seccion="consulta", q=pregunta, resultado=resultado)
        )

    @app.get("/calidad", response_class=HTMLResponse)
    def calidad(request: Request) -> HTMLResponse:
        return plantillas.TemplateResponse(
            request,
            "calidad.html",
            contexto(seccion="calidad", manifest=estado.manifest, reporte=estado.reporte),
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
