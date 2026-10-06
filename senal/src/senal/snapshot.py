"""raw/ → processed/ (Paso 1): validar, deduplicar, completar y sellar con SHA-256.

Determinista: mismo raw produce los mismos bytes. La fecha de corte sale de
``extraccion.json``, nunca del reloj. Los nulos se escriben como celda vacía en
CSV y ``null`` en JSON (``diccionario.md``).
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from collections import Counter
from collections.abc import Iterable, Sequence
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from senal import catalogo
from senal.fuentes import parsear_gdelt, parsear_rss_tvn, parsear_usgs, parsear_worldbank
from senal.ingest import (
    Exclusion,
    Indicador,
    Noticia,
    Ventana,
    completar_cuadricula,
    parsear_fecha,
    validar_indicadores,
    validar_noticias,
)

COLUMNAS_NOTICIAS = (
    "id_noticia",
    "titulo",
    "url",
    "medio",
    "idioma",
    "fecha_publicacion",
    "fecha_deteccion",
    "fecha_extraccion",
    "tema",
    "origen",
    "alcance_texto",
    "descripcion",
)
COLUMNAS_INDICADORES = (
    "pais_iso3",
    "indicador_id",
    "anio",
    "valor",
    "unidad",
    "fuente_url",
    "fecha_extraccion",
    "licencia",
)
COLUMNAS_EXCLUIDOS = ("tipo", "motivo", "campo", "referencia", "fila")
TRANSFORMACIONES = (
    "Fechas a UTC ISO 8601; seendate de GDELT solo como fecha_deteccion",
    "URL normalizada (host en minúsculas, sin parámetros utm/fbclid, sin barra final)",
    "Deduplicación por URL normalizada; prioridad TVN RSS sobre GDELT",
    "Exclusión de noticias fuera de la ventana de extracción",
    "Cuadrícula país × indicador × año completada con valor nulo",
    "Unidad del Banco Mundial derivada del nombre del indicador cuando 'unit' viene vacío",
)


def _iso(momento: datetime | None) -> str:
    return "" if momento is None else momento.isoformat()


def _celda(valor: object) -> str:
    return "" if valor is None else str(valor)


def _csv(columnas: Sequence[str], filas: Iterable[Sequence[object]]) -> bytes:
    buffer = io.StringIO()
    escritor = csv.writer(buffer, lineterminator="\n")
    escritor.writerow(columnas)
    escritor.writerows([_celda(v) for v in fila] for fila in filas)
    return buffer.getvalue().encode("utf-8")


def _json(dato: object) -> bytes:
    return (json.dumps(dato, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _cargar_registro(raw: Path) -> dict[str, Any]:
    registro: dict[str, Any] = json.loads((raw / "extraccion.json").read_text(encoding="utf-8"))
    return registro


def _exitosas(registro: dict[str, Any], prefijo: str) -> list[dict[str, Any]]:
    return sorted(
        (
            s
            for s in registro["solicitudes"]
            if s["fuente"].startswith(prefijo) and s["estado"] == 200 and s["archivo"]
        ),
        key=lambda s: str(s["archivo"]),
    )


def _filas_noticias(raw: Path, registro: dict[str, Any], corte: datetime) -> list[dict[str, Any]]:
    filas: list[dict[str, Any]] = []
    for solicitud in _exitosas(registro, "tvn_rss"):
        filas.extend(parsear_rss_tvn((raw / solicitud["archivo"]).read_text("utf-8"), corte))
    for solicitud in _exitosas(registro, "gdelt"):
        consulta = solicitud["fuente"].split(":", 1)[1]
        texto = (raw / solicitud["archivo"]).read_text("utf-8")
        filas.extend(parsear_gdelt(texto, corte, consulta))
    return filas


def _filas_indicadores(raw: Path, registro: dict[str, Any], corte: datetime) -> list[Any]:
    filas: list[Any] = []
    for solicitud in _exitosas(registro, "worldbank"):
        texto = (raw / solicitud["archivo"]).read_text("utf-8")
        filas.extend(parsear_worldbank(texto, corte, solicitud["url"]))
    return filas


def _eventos(raw: Path, registro: dict[str, Any]) -> list[dict[str, Any]]:
    eventos: list[dict[str, Any]] = []
    for solicitud in _exitosas(registro, "usgs"):
        eventos.extend(parsear_usgs((raw / solicitud["archivo"]).read_text("utf-8")))
    return sorted(eventos, key=lambda e: str(e["id"]))


def _geojson(eventos: Sequence[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": e["id"],
                "geometry": {
                    "type": "Point",
                    "coordinates": [e["longitude"], e["latitude"], e["depth"]],
                },
                "properties": e,
            }
            for e in eventos
        ],
    }


def _fila_noticia(n: Noticia) -> tuple[object, ...]:
    return (
        n.id_noticia,
        n.titulo,
        n.url,
        n.medio,
        n.idioma,
        _iso(n.fecha_publicacion),
        _iso(n.fecha_deteccion),
        _iso(n.fecha_extraccion),
        n.tema,
        n.origen,
        n.alcance_texto,
        n.descripcion,
    )


def _fila_indicador(i: Indicador) -> tuple[object, ...]:
    return (
        i.pais_iso3,
        i.indicador_id,
        i.anio,
        i.valor,
        i.unidad,
        i.fuente_url,
        _iso(i.fecha_extraccion),
        i.licencia,
    )


def _fila_exclusion(tipo: str, e: Exclusion) -> tuple[object, ...]:
    referencia = e.fila.get("url") or e.fila.get("indicador_id") or ""
    return (tipo, e.motivo, e.campo, referencia, json.dumps(dict(e.fila), ensure_ascii=False))


def _reporte(
    noticias: Sequence[Noticia],
    excluidas: Sequence[Exclusion],
    indicadores: Sequence[Indicador],
    eventos: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "noticias": {
            "validas": len(noticias),
            "excluidas_por_motivo": dict(sorted(Counter(e.motivo for e in excluidas).items())),
            "por_origen": dict(sorted(Counter(n.origen for n in noticias).items())),
            "por_medio": dict(sorted(Counter(n.medio for n in noticias).items())),
            "sin_fecha_publicacion": sum(n.fecha_publicacion is None for n in noticias),
            "de_tvn": sum(n.medio == "tvn-2.com" for n in noticias),
        },
        "indicadores": {
            "filas": len(indicadores),
            "nulos": sum(i.valor is None for i in indicadores),
        },
        "eventos": {"total": len(eventos)},
    }


def construir_snapshot(raw: Path, salida: Path) -> dict[str, Any]:
    """Construye ``processed/`` desde ``raw/`` y devuelve el manifest escrito."""
    registro = _cargar_registro(raw)
    corte = parsear_fecha(registro["fecha_corte_utc"])
    ventana = Ventana(
        corte - timedelta(days=catalogo.VENTANA_NOTICIAS_DIAS), corte + timedelta(seconds=1)
    )

    noticias_res = validar_noticias(_filas_noticias(raw, registro, corte), ventana)
    noticias = sorted(noticias_res.validas, key=lambda n: n.id_noticia)
    indicadores_res = validar_indicadores(_filas_indicadores(raw, registro, corte))
    indicadores = completar_cuadricula(
        indicadores_res.validas,
        paises=catalogo.PAISES,
        indicadores=tuple(catalogo.INDICADORES),
        anios=catalogo.ANIOS,
        unidades={i.indicador_id: i.unidad for i in indicadores_res.validas if i.unidad},
        fecha_extraccion=corte,
    )
    eventos = _eventos(raw, registro)
    excluidos = [_fila_exclusion("noticia", e) for e in noticias_res.excluidos] + [
        _fila_exclusion("indicador", e) for e in indicadores_res.excluidos
    ]

    contenidos = {
        "noticias.csv": _csv(COLUMNAS_NOTICIAS, map(_fila_noticia, noticias)),
        "indicadores.csv": _csv(COLUMNAS_INDICADORES, map(_fila_indicador, indicadores)),
        "eventos.geojson": _json(_geojson(eventos)),
        "excluidos.csv": _csv(COLUMNAS_EXCLUIDOS, excluidos),
        "reporte_calidad.json": _json(
            _reporte(noticias, noticias_res.excluidos, indicadores, eventos)
        ),
    }
    salida.mkdir(parents=True, exist_ok=True)
    for nombre, contenido in contenidos.items():
        (salida / nombre).write_bytes(contenido)

    manifest: dict[str, Any] = {
        "version": registro["version"],
        "fecha_corte_utc": corte.isoformat(),
        "ventana_noticias": [ventana.desde.isoformat(), corte.isoformat()],
        "consultas": [
            {k: s.get(k) for k in ("fuente", "url", "params", "estado", "sha256")}
            for s in registro["solicitudes"]
        ],
        "solicitudes_fallidas": [
            {"fuente": s["fuente"], "estado": s["estado"]}
            for s in registro["solicitudes"]
            if s["estado"] != 200
        ],
        "conteos": {
            "noticias.csv": len(noticias),
            "indicadores.csv": len(indicadores),
            "eventos.geojson": len(eventos),
            "excluidos.csv": len(excluidos),
        },
        "archivos": {n: hashlib.sha256(c).hexdigest() for n, c in sorted(contenidos.items())},
        "licencias": [
            {"ref": f.ref, "fuente": f.nombre, "url": f.url, "condiciones": f.condiciones}
            for f in catalogo.FUENTES
        ],
        "transformaciones": list(TRANSFORMACIONES),
        "desviaciones": [
            "D6 (ADR 0002): noticias de los últimos "
            f"{catalogo.VENTANA_NOTICIAS_DIAS} días antes del corte, no [2024-01-01, 2025-10-01); "
            "ninguna fuente pública de noticias alcanza 2024 desde 2026-10."
        ],
    }
    (salida / "manifest.json").write_bytes(_json(manifest))
    return manifest
