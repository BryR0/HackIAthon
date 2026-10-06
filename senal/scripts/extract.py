"""Descarga las fuentes públicas a data/raw/. Uso: scripts/extract.py [--sin-gdelt]."""

from __future__ import annotations

import argparse
import logging
from collections import Counter
from pathlib import Path

from senal.extraccion import extraer_todo

RAIZ = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sin-gdelt", action="store_true", help="omite GDELT (límite de tasa)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    registro = extraer_todo(RAIZ / "data" / "raw", incluir_gdelt=not args.sin_gdelt)
    solicitudes = registro["solicitudes"]
    assert isinstance(solicitudes, list)
    estados = Counter((s["fuente"].split(":")[0], s["estado"]) for s in solicitudes)
    for (fuente, estado), total in sorted(estados.items(), key=str):
        logging.info("%-10s estado=%s solicitudes=%d", fuente, estado, total)


if __name__ == "__main__":
    main()
