"""Etapa 7 · Revisar: estados humanos del reto §8 y fichas del contrato §7."""

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from senal.review import ESTADOS, RegistroRevisiones, Revision

AHORA = datetime(2026, 10, 6, 15, 0, tzinfo=UTC)


def test_estados_son_exactamente_los_del_reto() -> None:
    assert ESTADOS == (
        "nuevo",
        "en_revision",
        "requiere_evidencia",
        "aprobado_como_borrador",
        "descartado",
    )


def test_estado_inicial_es_nuevo_y_el_ultimo_registro_manda(tmp_path: Path) -> None:
    registro = RegistroRevisiones(tmp_path / "reviews.jsonl")

    assert registro.estado_actual("E-1") == "nuevo"
    registro.registrar(Revision("E-1", "en_revision", "Ana Editora", "", AHORA))
    registro.registrar(Revision("E-1", "aprobado_como_borrador", "Ana Editora", "ok", AHORA))

    assert registro.estado_actual("E-1") == "aprobado_como_borrador"
    assert [r.estado for r in registro.historial("E-1")] == [
        "en_revision",
        "aprobado_como_borrador",
    ]


def test_registro_persiste_en_jsonl_y_sobrevive_a_reinicio(tmp_path: Path) -> None:
    ruta = tmp_path / "reviews.jsonl"
    RegistroRevisiones(ruta).registrar(Revision("E-2", "descartado", "Luis", "duplicado", AHORA))

    linea = json.loads(ruta.read_text(encoding="utf-8").splitlines()[0])

    assert linea["revisor"] == "Luis"
    assert RegistroRevisiones(ruta).estado_actual("E-2") == "descartado"


def test_estado_invalido_o_revisor_vacio_se_rechazan(tmp_path: Path) -> None:
    registro = RegistroRevisiones(tmp_path / "reviews.jsonl")

    with pytest.raises(ValueError, match="estado"):
        registro.registrar(Revision("E-1", "publicado", "Ana", "", AHORA))
    with pytest.raises(ValueError, match="revisor"):
        registro.registrar(Revision("E-1", "en_revision", "  ", "", AHORA))
