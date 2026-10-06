"""Etapa 7 · Revisar: decisión humana trazable (reto §3, §8).

Aprobar un borrador **no** es publicar: no existe ninguna acción de publicación.
Cada cambio de estado queda en ``reviews.jsonl`` con revisor y fecha UTC.
``ficha_contrato`` produce la fila de ``fichas.jsonl`` del contrato (§7) para Notion.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from senal.generate import ResultadoRespuesta
from senal.ingest import parsear_fecha
from senal.pipeline import Tema

log = logging.getLogger(__name__)
_CANDADO = threading.Lock()

ESTADOS = ("nuevo", "en_revision", "requiere_evidencia", "aprobado_como_borrador", "descartado")
MAX_NOTA = 1000


@dataclass(frozen=True)
class Revision:
    id_caso: str
    estado: str
    revisor: str
    nota: str
    fecha_utc: datetime
    # IDs de las noticias del caso al decidir: el ID del evento puede cambiar si el
    # snapshot o los umbrales cambian; así la decisión sigue siendo trazable.
    ids_fuente: tuple[str, ...] = ()


class RegistroRevisiones:
    def __init__(self, ruta: Path) -> None:
        self._ruta = ruta

    def _leer(self) -> list[Revision]:
        if not self._ruta.exists():
            return []
        revisiones: list[Revision] = []
        for numero, linea in enumerate(self._ruta.read_text(encoding="utf-8").splitlines(), 1):
            if not linea.strip():
                continue
            try:
                datos = json.loads(linea)
                datos["fecha_utc"] = parsear_fecha(datos["fecha_utc"])
                datos["ids_fuente"] = tuple(datos.get("ids_fuente", ()))
                revisiones.append(Revision(**datos))
            except (ValueError, KeyError, TypeError):
                log.warning("Línea %d de %s ilegible; se omite", numero, self._ruta.name)
        return revisiones

    def registrar(self, revision: Revision) -> Revision:
        if revision.estado not in ESTADOS:
            raise ValueError(f"estado no permitido: {revision.estado!r}")
        if not revision.revisor.strip():
            raise ValueError("revisor obligatorio: toda decisión tiene una persona responsable")
        limpia = Revision(
            revision.id_caso,
            revision.estado,
            revision.revisor.strip()[:120],
            revision.nota.strip()[:MAX_NOTA],
            revision.fecha_utc,
            revision.ids_fuente,
        )
        fila = asdict(limpia) | {"fecha_utc": limpia.fecha_utc.isoformat()}
        anexar_jsonl(self._ruta, fila)
        return limpia

    def historial(self, id_caso: str) -> list[Revision]:
        return [r for r in self._leer() if r.id_caso == id_caso]

    def estado_actual(self, id_caso: str) -> str:
        historial = self.historial(id_caso)
        return historial[-1].estado if historial else "nuevo"

    def ultimos(self) -> dict[str, Revision]:
        return {r.id_caso: r for r in self._leer()}


def anexar_jsonl(ruta: Path, fila: dict[str, Any]) -> None:
    """Anexa una línea JSON de forma serializada y durable (lock + fsync)."""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with _CANDADO, ruta.open("a", encoding="utf-8") as archivo:
        archivo.write(json.dumps(fila, ensure_ascii=False) + "\n")
        archivo.flush()
        os.fsync(archivo.fileno())


def ficha_contrato(
    tema: Tema, resultado: ResultadoRespuesta | None, revision: Revision | None
) -> dict[str, Any]:
    """Fila de ``fichas.jsonl`` con los campos mínimos del contrato del reto (§7)."""
    afirmaciones = resultado.aceptadas if resultado else ()
    borrador = (
        resultado.paquete.model_dump(by_alias=True) if resultado and resultado.paquete else None
    )
    return {
        "id_caso": tema.id_evento,
        "modalidad": "tvn_editorial",
        "ids_fuente": list(tema.ids_noticias),
        "afirmaciones": [{"texto": a.texto, "tipo": a.tipo} for a in afirmaciones],
        "citas": [
            [{"id_evidencia": c.id_evidencia, "campo": c.campo} for c in a.citas]
            for a in afirmaciones
        ],
        "puntaje": tema.puntaje.total,
        "componentes": tema.puntaje.desglose(),
        "version_reglas": tema.puntaje.version,
        "estado_evidencia": tema.estado_evidencia,
        "borrador": borrador,
        "estado_revision": revision.estado if revision else "nuevo",
        "revisor": revision.revisor if revision else None,
        "publicado": False,
    }
