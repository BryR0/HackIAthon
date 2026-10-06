"""Construye data/processed/ desde data/raw/. Uso: uv run python scripts/build_snapshot.py."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from senal.snapshot import construir_snapshot

RAIZ = Path(__file__).resolve().parents[1]


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    salida = RAIZ / "data" / "processed"
    manifest = construir_snapshot(RAIZ / "data" / "raw", salida)
    reporte = json.loads((salida / "reporte_calidad.json").read_text(encoding="utf-8"))
    logging.info("Corte: %s", manifest["fecha_corte_utc"])
    logging.info("Conteos: %s", manifest["conteos"])
    logging.info("Solicitudes fallidas: %d", len(manifest["solicitudes_fallidas"]))
    logging.info("Calidad: %s", json.dumps(reporte, ensure_ascii=False))


if __name__ == "__main__":
    main()
