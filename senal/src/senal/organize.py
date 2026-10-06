"""Etapa 2 · Organizar: clasificación temática y agrupación de eventos.

- Baseline (§8 del reto): reglas de palabras clave.
- IA: prototipos por tema sobre embeddings multilingües, con abstención por
  umbral y margen: si no hay tema claro se devuelve ``SIN_TEMA``; no se fuerza.
- Agrupación: union-find sobre similitud coseno dentro de una ventana temporal,
  para que tres copias del mismo hecho cuenten como un evento (T02).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

import numpy as np

from senal.embed import Codificador, Matriz

SIN_TEMA = "sin_tema"

TEMAS = {
    "economia": "Economía",
    "logistica_canal": "Logística / Canal",
    "turismo": "Turismo",
    "servicios_publicos": "Servicios públicos",
    "eventos_naturales": "Eventos naturales",
    "regulacion": "Regulación",
}

PALABRAS_CLAVE: Mapping[str, tuple[str, ...]] = {
    "economia": (
        "economia", "inflacion", "pib", "empleo", "desempleo", "precios", "salario",
        "deuda", "fiscal", "impuesto", "mef", "inversion", "economy", "inflation",
    ),
    "logistica_canal": (
        "canal", "transito", "transitos", "buque", "buques", "puerto", "puertos",
        "naviera", "contenedor", "logistica", "esclusa", "calado", "shipping",
    ),
    "turismo": (
        "turismo", "turista", "turistas", "hotel", "hoteles", "visitantes", "aerolinea",
        "vuelos", "crucero", "atp", "tourism", "tourist",
    ),
    "servicios_publicos": (
        "agua", "idaan", "electricidad", "energia", "apagon", "css", "salud", "hospital",
        "transporte", "metro", "basura", "educacion", "meduca", "acueducto",
    ),
    "eventos_naturales": (
        "sismo", "terremoto", "temblor", "inundacion", "inundaciones", "lluvia", "lluvias",
        "sequia", "tormenta", "deslizamiento", "sinaproc", "earthquake", "flood",
    ),
    "regulacion": (
        "ley", "decreto", "regulacion", "resolucion", "asamblea", "reglamento", "norma",
        "superintendencia", "gaceta", "proyecto de ley", "regulation",
    ),
}  # fmt: skip

PROTOTIPOS: Mapping[str, tuple[str, ...]] = {
    "economia": (
        "Economía de Panamá: inflación, crecimiento del PIB, empleo, precios y finanzas públicas",
        "Panama economy: inflation, GDP growth, jobs and public debt",
    ),
    "logistica_canal": (
        "Canal de Panamá: tránsitos de buques, calado, puertos, navieras y comercio marítimo",
        "Panama Canal shipping transits, ports and maritime logistics",
    ),
    "turismo": (
        "Turismo en Panamá: llegada de visitantes, hoteles, vuelos y cruceros",
        "Tourism in Panama: visitors, hotels, airlines and cruises",
    ),
    "servicios_publicos": (
        "Servicios públicos en Panamá: agua potable, electricidad, salud, CSS y transporte",
        "Public services in Panama: water supply, electricity, healthcare and transit",
    ),
    "eventos_naturales": (
        "Eventos naturales en Panamá: sismos, lluvias, inundaciones, sequía y deslizamientos",
        "Natural events in Panama: earthquakes, floods, drought and storms",
    ),
    "regulacion": (
        "Regulación en Panamá: leyes, decretos, resoluciones de la Asamblea y superintendencias",
        "Regulation in Panama: new laws, decrees and regulatory resolutions",
    ),
}

# Valores iniciales; se calibran con evals/eval_organize.py sobre el set etiquetado.
UMBRAL_TEMA = 0.80
MARGEN_TEMA = 0.01


@dataclass(frozen=True)
class Documento:
    id: str
    texto: str
    fecha: datetime


@dataclass(frozen=True)
class Clasificacion:
    tema: str
    puntaje: float
    margen: float
    metodo: str


def normalizar_texto(texto: str) -> str:
    """Minúsculas sin acentos ni signos, para reglas léxicas."""
    sin_acentos = unicodedata.normalize("NFKD", texto)
    sin_acentos = "".join(c for c in sin_acentos if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", " ", sin_acentos.lower())


def clasificar_por_palabras(texto: str) -> str:
    """Baseline: tema con más coincidencias de palabras clave; empate o cero → ``SIN_TEMA``."""
    tokens = f" {' '.join(normalizar_texto(texto).split())} "
    conteos = {
        tema: sum(f" {palabra} " in tokens for palabra in palabras)
        for tema, palabras in PALABRAS_CLAVE.items()
    }
    mejor = max(conteos.values())
    ganadores = [tema for tema, n in conteos.items() if n == mejor]
    return ganadores[0] if mejor > 0 and len(ganadores) == 1 else SIN_TEMA


class ClasificadorPrototipos:
    """Centroide normalizado por tema; argmax coseno con abstención por umbral y margen."""

    def __init__(
        self,
        codificador: Codificador,
        prototipos: Mapping[str, Sequence[str]] = PROTOTIPOS,
        *,
        umbral: float = UMBRAL_TEMA,
        margen: float = MARGEN_TEMA,
    ) -> None:
        self._codificador = codificador
        self._temas = tuple(prototipos)
        self._umbral = umbral
        self._margen = margen
        centroides = [
            codificador.codificar(list(textos), "passage").mean(axis=0)
            for textos in prototipos.values()
        ]
        matriz = np.vstack(centroides)
        self._centroides = matriz / np.linalg.norm(matriz, axis=1, keepdims=True)

    @property
    def metodo(self) -> str:
        return f"prototipos:{self._codificador.modelo}"

    def clasificar_vectores(self, vectores: Matriz) -> list[Clasificacion]:
        similitudes = vectores @ self._centroides.T
        resultado: list[Clasificacion] = []
        for fila in similitudes:
            orden = np.argsort(fila)[::-1]
            mejor = float(fila[orden[0]])
            segundo = float(fila[orden[1]]) if len(orden) > 1 else 0.0
            margen = mejor - segundo
            tema = self._temas[int(orden[0])]
            if mejor < self._umbral or margen < self._margen:
                tema = SIN_TEMA
            resultado.append(Clasificacion(tema, mejor, margen, self.metodo))
        return resultado

    def clasificar(self, textos: Sequence[str]) -> list[Clasificacion]:
        return self.clasificar_vectores(self._codificador.codificar(textos, "passage"))


class _UnionFind:
    def __init__(self, n: int) -> None:
        self._padre = list(range(n))

    def raiz(self, i: int) -> int:
        while self._padre[i] != i:
            self._padre[i] = self._padre[self._padre[i]]
            i = self._padre[i]
        return i

    def unir(self, a: int, b: int) -> None:
        ra, rb = self.raiz(a), self.raiz(b)
        if ra != rb:
            self._padre[max(ra, rb)] = min(ra, rb)


def agrupar_eventos(
    documentos: Sequence[Documento], vectores: Matriz, *, umbral: float, ventana_dias: float
) -> tuple[tuple[str, ...], ...]:
    """Clusters de IDs ordenados; se unen documentos similares y cercanos en el tiempo."""
    n = len(documentos)
    conjuntos = _UnionFind(n)
    similitudes = vectores @ vectores.T
    segundos_ventana = ventana_dias * 86_400
    for i in range(n):
        for j in range(i + 1, n):
            separacion = abs((documentos[i].fecha - documentos[j].fecha).total_seconds())
            if similitudes[i, j] >= umbral and separacion <= segundos_ventana:
                conjuntos.unir(i, j)

    grupos: dict[int, list[str]] = {}
    for i, documento in enumerate(documentos):
        grupos.setdefault(conjuntos.raiz(i), []).append(documento.id)
    return tuple(sorted(tuple(sorted(ids)) for ids in grupos.values()))
