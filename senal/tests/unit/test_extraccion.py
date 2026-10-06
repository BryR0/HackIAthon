"""Extracción: tramos de fechas y reintentos ante límite de tasa, sin red real."""

from datetime import UTC, datetime

import httpx

from senal.extraccion import obtener_con_reintentos, tramos


def test_tramos_cubren_la_ventana_sin_solapes_ni_huecos() -> None:
    desde = datetime(2026, 7, 1, tzinfo=UTC)
    hasta = datetime(2026, 7, 31, tzinfo=UTC)

    resultado = tramos(desde, hasta, dias=15)

    assert resultado[0][0] == desde
    assert resultado[-1][1] == hasta
    assert all(a[1] == b[0] for a, b in zip(resultado, resultado[1:], strict=False))
    assert len(resultado) == 2


def test_reintenta_ante_429_y_devuelve_la_respuesta_exitosa() -> None:
    respuestas = iter([httpx.Response(429, text="Please limit"), httpx.Response(200, text="ok")])
    cliente = httpx.Client(transport=httpx.MockTransport(lambda _req: next(respuestas)))
    esperas: list[float] = []

    respuesta = obtener_con_reintentos(
        cliente, "https://ejemplo.test", {}, intentos=3, espera_base=1.0, dormir=esperas.append
    )

    assert respuesta.status_code == 200
    assert esperas == [1.0]


def test_tras_agotar_intentos_devuelve_la_ultima_respuesta_sin_lanzar() -> None:
    cliente = httpx.Client(transport=httpx.MockTransport(lambda _req: httpx.Response(429)))
    esperas: list[float] = []

    respuesta = obtener_con_reintentos(
        cliente, "https://ejemplo.test", {}, intentos=3, espera_base=2.0, dormir=esperas.append
    )

    assert respuesta.status_code == 429
    assert esperas == [2.0, 4.0]
