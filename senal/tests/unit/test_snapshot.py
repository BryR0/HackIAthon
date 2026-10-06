"""Construcción del snapshot procesado: determinismo, cuadrícula, exclusiones y manifest."""

import csv
import json
from pathlib import Path

from senal.snapshot import construir_snapshot

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><language>es</language>
<item><title>Titular reciente</title>
<description>Extracto que no se redistribuye</description>
<link>https://www.tvn-2.com/nacionales/reciente_1_1.html</link>
<pubDate>Mon, 05 Oct 2026 10:00:00 +0000</pubDate></item>
<item><title>Titular viejo recirculado</title>
<link>https://www.tvn-2.com/nacionales/viejo_1_2.html</link>
<pubDate>Fri, 20 Sep 2024 18:19:27 +0000</pubDate></item>
</channel></rss>"""

GDELT = {
    "articles": [
        {
            "url": "https://www.tvn-2.com/nacionales/reciente_1_1.html/",
            "title": "Titular reciente",
            "seendate": "20261005T120000Z",
            "domain": "tvn-2.com",
            "language": "Spanish",
        },
        {
            "url": "https://www.sina.com.cn/panama",
            "title": "巴拿马运河",
            "seendate": "20261002T080000Z",
            "domain": "sina.com.cn",
            "language": "Chinese",
        },
        {
            "url": "https://www.prensa.com/canal/sintetico",
            "title": "Canal sintético",
            "seendate": "20261001T080000Z",
            "domain": "prensa.com",
            "language": "Spanish",
        },
    ]
}

WORLDBANK = [
    {"page": 1, "pages": 1, "total": 1},
    [
        {
            "indicator": {"id": "FP.CPI.TOTL.ZG", "value": "Inflation, consumer prices (annual %)"},
            "countryiso3code": "PAN",
            "date": "2024",
            "value": 0.7,
            "unit": "",
        }
    ],
]

USGS = {
    "features": [
        {
            "id": "us6000test",
            "properties": {
                "mag": 4.1,
                "place": "Sintético",
                "time": 1735513210566,
                "updated": 1741473552040,
                "url": "https://e.test/us6000test",
                "status": "reviewed",
            },
            "geometry": {"coordinates": [-80.0, 8.0, 10.0]},
        }
    ]
}


def _solicitud(fuente: str, archivo: str | None, estado: int) -> dict[str, object]:
    return {
        "fuente": fuente,
        "archivo": archivo,
        "estado": estado,
        "url": "https://x",
        "params": {},
    }


def _crear_raw(raw: Path) -> None:
    raw.mkdir()
    (raw / "tvn_rss.xml").write_text(RSS, encoding="utf-8")
    (raw / "gdelt_economia_20260901.json").write_text(json.dumps(GDELT), encoding="utf-8")
    (raw / "worldbank_FP.CPI.TOTL.ZG.json").write_text(json.dumps(WORLDBANK), encoding="utf-8")
    (raw / "usgs_2024.geojson").write_text(json.dumps(USGS), encoding="utf-8")
    registro = {
        "version": "panama-senales-evidencias-v1",
        "fecha_corte_utc": "2026-10-06T00:00:00+00:00",
        "solicitudes": [
            _solicitud("tvn_rss", "tvn_rss.xml", 200),
            _solicitud("gdelt:economia", "gdelt_economia_20260901.json", 200),
            _solicitud("worldbank:FP.CPI.TOTL.ZG", "worldbank_FP.CPI.TOTL.ZG.json", 200),
            _solicitud("worldbank:SP.POP.TOTL", None, 429),
            _solicitud("usgs", "usgs_2024.geojson", 200),
        ],
    }
    (raw / "extraccion.json").write_text(json.dumps(registro), encoding="utf-8")


def _leer_csv(ruta: Path) -> list[dict[str, str]]:
    with ruta.open(encoding="utf-8", newline="") as archivo:
        return list(csv.DictReader(archivo))


def test_snapshot_es_determinista_entre_corridas(tmp_path: Path) -> None:
    _crear_raw(tmp_path / "raw")

    primero = construir_snapshot(tmp_path / "raw", tmp_path / "a")
    segundo = construir_snapshot(tmp_path / "raw", tmp_path / "b")

    assert primero["archivos"] == segundo["archivos"]


def test_noticias_deduplicadas_entre_fuentes_y_viejas_excluidas(tmp_path: Path) -> None:
    _crear_raw(tmp_path / "raw")

    construir_snapshot(tmp_path / "raw", tmp_path / "out")

    noticias = _leer_csv(tmp_path / "out" / "noticias.csv")
    assert sorted(n["titulo"] for n in noticias) == ["Canal sintético", "Titular reciente"]
    reciente = next(n for n in noticias if n["titulo"] == "Titular reciente")
    assert reciente["origen"] == "tvn_rss"
    assert reciente["descripcion"] == ""
    assert reciente["alcance_texto"] == "titular_metadatos"
    assert reciente["fecha_publicacion"] == "2026-10-05T10:00:00+00:00"
    gdelt = next(n for n in noticias if n["origen"].startswith("gdelt"))
    assert gdelt["fecha_publicacion"] == ""
    assert gdelt["fecha_deteccion"] == "2026-10-01T08:00:00+00:00"

    motivos = sorted(e["motivo"] for e in _leer_csv(tmp_path / "out" / "excluidos.csv"))
    assert motivos == ["fuera_de_ventana", "idioma_no_soportado", "url_duplicada"]


def test_indicadores_cubren_la_cuadricula_completa_con_nulos(tmp_path: Path) -> None:
    _crear_raw(tmp_path / "raw")

    construir_snapshot(tmp_path / "raw", tmp_path / "out")

    filas = _leer_csv(tmp_path / "out" / "indicadores.csv")
    assert len(filas) == 540  # 6 países × 6 indicadores × 15 años; el reto dice 1.350 por error
    con_valor = [f for f in filas if f["valor"] != ""]
    assert len(con_valor) == 1
    assert con_valor[0]["unidad"] == "annual %"


def test_manifest_registra_conteos_hashes_fallos_y_desviacion(tmp_path: Path) -> None:
    _crear_raw(tmp_path / "raw")

    manifest = construir_snapshot(tmp_path / "raw", tmp_path / "out")

    assert manifest["fecha_corte_utc"] == "2026-10-06T00:00:00+00:00"
    assert manifest["conteos"]["noticias.csv"] == 2
    assert manifest["conteos"]["eventos.geojson"] == 1
    assert set(manifest["archivos"]) >= {"noticias.csv", "indicadores.csv", "eventos.geojson"}
    assert all(len(h) == 64 for h in manifest["archivos"].values())
    assert manifest["solicitudes_fallidas"] == [{"fuente": "worldbank:SP.POP.TOTL", "estado": 429}]
    assert any("D6" in d for d in manifest["desviaciones"])
    guardado = json.loads((tmp_path / "out" / "manifest.json").read_text(encoding="utf-8"))
    assert guardado == manifest


def test_reporte_de_calidad_cuenta_validas_y_excluidas_por_motivo(tmp_path: Path) -> None:
    _crear_raw(tmp_path / "raw")

    construir_snapshot(tmp_path / "raw", tmp_path / "out")

    reporte = json.loads((tmp_path / "out" / "reporte_calidad.json").read_text(encoding="utf-8"))
    assert reporte["noticias"]["validas"] == 2
    assert reporte["noticias"]["excluidas_por_motivo"] == {
        "fuera_de_ventana": 1,
        "idioma_no_soportado": 1,
        "url_duplicada": 1,
    }
    assert reporte["noticias"]["por_origen"] == {"gdelt_doc:economia": 1, "tvn_rss": 1}
    assert reporte["indicadores"]["nulos"] == 539
