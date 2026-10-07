"""Descarga las fuentes públicas a data/raw/.

Uso: scripts/extract.py [--sin-gdelt] [--sin-sbp | --solo-sbp]
"""

from __future__ import annotations

import argparse
import logging
from collections import Counter
from pathlib import Path

from senal.extraccion import agregar_sbp, extraer_todo

RAIZ = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sin-gdelt", action="store_true", help="omite GDELT (límite de tasa)")
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--sin-sbp", action="store_true", help="omite la fuente D (SBP)")
    grupo.add_argument(
        "--solo-sbp",
        action="store_true",
        help="agrega solo la fuente D a un extraccion.json existente; no toca las noticias",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    raw = RAIZ / "data" / "raw"
    registro = (
        agregar_sbp(raw)
        if args.solo_sbp
        else extraer_todo(raw, incluir_gdelt=not args.sin_gdelt, incluir_sbp=not args.sin_sbp)
    )
    solicitudes = registro["solicitudes"]
    assert isinstance(solicitudes, list)
    estados = Counter((s["fuente"].split(":")[0], s["estado"]) for s in solicitudes)
    for (fuente, estado), total in sorted(estados.items(), key=str):
        logging.info("%-10s estado=%s solicitudes=%d", fuente, estado, total)


if __name__ == "__main__":
    main()
