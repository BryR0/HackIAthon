"""Interfaz web: flujo completo sin red ni modelo (T10) sobre el snapshot real."""

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from senal.score import RULES_VERSION
from senal.web.app import Config, crear_app

PROCESADO = Path(__file__).resolve().parents[2] / "data" / "processed"


@pytest.fixture(scope="module")
def cliente(tmp_path_factory: pytest.TempPathFactory) -> TestClient:
    revisiones = tmp_path_factory.mktemp("rev") / "reviews.jsonl"
    config = Config(procesado=PROCESADO, revisiones=revisiones, usar_modelo=False, usar_llm=False)
    return TestClient(crear_app(config))


def _token(html: str) -> str:
    coincidencia = re.search(r'name="csrf" value="([^"]+)"', html)
    assert coincidencia
    return coincidencia.group(1)


def _primer_tema(cliente: TestClient) -> str:
    html = cliente.get("/").text
    coincidencia = re.search(r'href="/tema/([^"]+)"', html)
    assert coincidencia
    return coincidencia.group(1)


def test_bandeja_muestra_ranking_version_de_reglas_y_modo(cliente: TestClient) -> None:
    respuesta = cliente.get("/")

    assert respuesta.status_code == 200
    assert RULES_VERSION in respuesta.text
    assert "baseline:palabras_clave" in respuesta.text
    assert "Hora de Panamá" in respuesta.text


def test_ficha_expone_componentes_fuentes_y_accion(cliente: TestClient) -> None:
    respuesta = cliente.get(f"/tema/{_primer_tema(cliente)}")

    assert respuesta.status_code == 200
    for texto in ("Qué se reporta", "Quién lo reporta", "Qué está respaldado", "Qué falta"):
        assert texto in respuesta.text
    assert "30 × R" in respuesta.text
    assert "no habilita publicación" in respuesta.text


def test_borrador_extractivo_con_citas(cliente: TestClient) -> None:
    id_tema = _primer_tema(cliente)
    token = _token(cliente.get(f"/tema/{id_tema}").text)

    respuesta = cliente.post(f"/tema/{id_tema}/borrador", data={"csrf": token})

    assert respuesta.status_code == 200
    assert "Basado únicamente en titular/metadatos." in respuesta.text
    assert "extractivo" in respuesta.text


def test_revision_humana_queda_registrada(cliente: TestClient) -> None:
    id_tema = _primer_tema(cliente)
    token = _token(cliente.get(f"/tema/{id_tema}").text)

    respuesta = cliente.post(
        f"/tema/{id_tema}/revision",
        data={"csrf": token, "estado": "requiere_evidencia", "revisor": "Ana", "nota": "falta ACP"},
        follow_redirects=True,
    )

    assert respuesta.status_code == 200
    assert "requiere_evidencia" in respuesta.text
    assert "Ana" in respuesta.text


def test_post_sin_token_csrf_se_rechaza(cliente: TestClient) -> None:
    respuesta = cliente.post(f"/tema/{_primer_tema(cliente)}/borrador", data={"csrf": "x"})

    assert respuesta.status_code == 403


def test_consulta_sin_evidencia_se_abstiene(cliente: TestClient) -> None:
    respuesta = cliente.get("/consulta", params={"q": "precio del bitcoin en Japón"})

    assert respuesta.status_code == 200
    assert "Abstención" in respuesta.text


def test_tema_inexistente_da_404(cliente: TestClient) -> None:
    assert cliente.get("/tema/E-no-existe").status_code == 404


def test_calidad_muestra_manifest_y_desviaciones(cliente: TestClient) -> None:
    respuesta = cliente.get("/calidad")

    assert respuesta.status_code == 200
    assert "D6" in respuesta.text
    assert "SHA-256" in respuesta.text
