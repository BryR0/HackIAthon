"""Validador determinista de citas y compuerta de abstención (reto §7, §8, T04, T06, T09).

Una afirmación se **descarta entera** si:
- su tipo no es hecho/declaración/inferencia/hipótesis;
- no tiene cita, cita evidencia no recuperada o un campo no citable;
- contiene una cifra que no aparece en los campos citados;
- cita un indicador anual sin mencionar el año (no confundir con dato de hoy);
- presenta una acusación como hecho (debe ser declaración atribuida).
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from senal.contradict import normalizar_numero
from senal.organize import normalizar_texto
from senal.retrieve import Evidencia, Resultado

TIPOS_AFIRMACION = frozenset({"hecho", "declaracion", "inferencia", "hipotesis"})
CAMPOS_CITABLES: Mapping[str, frozenset[str]] = {
    "noticia": frozenset(
        {"titulo", "descripcion", "medio", "fecha_publicacion", "fecha_deteccion"}
    ),
    "indicador": frozenset({"nombre", "pais", "pais_iso3", "anio", "valor", "unidad"}),
    "sismo": frozenset({"magnitude", "time", "place"}),
}
PALABRAS_ACUSACION = (
    "enriquecimiento", "corrupcion", "corrupto", "culpable", "delito", "fraude", "peculado",
    "lavado", "robo", "soborno", "asesino", "cometio", "malversacion", "estafa",
)  # fmt: skip
_NUMERO = re.compile(r"\d+(?:[.,]\d+)*")


@dataclass(frozen=True)
class CitaPropuesta:
    id_evidencia: str
    campo: str


@dataclass(frozen=True)
class AfirmacionPropuesta:
    texto: str
    tipo: str
    citas: tuple[CitaPropuesta, ...]


@dataclass(frozen=True)
class Descartada:
    afirmacion: AfirmacionPropuesta
    motivo: str


@dataclass(frozen=True)
class ResultadoCitas:
    aceptadas: tuple[AfirmacionPropuesta, ...]
    descartadas: tuple[Descartada, ...]


def _numeros(texto: str) -> list[tuple[float, int]]:
    """Cifras con su cantidad de decimales, para comparar con la precisión de la afirmación."""
    resultado: list[tuple[float, int]] = []
    for crudo in _NUMERO.findall(texto):
        valor = normalizar_numero(crudo)
        decimales = 0 if valor.is_integer() else len(crudo.replace(",", ".").split(".")[-1])
        resultado.append((valor, decimales))
    return resultado


def _cifras_respaldadas(texto: str, fuentes: Sequence[str]) -> bool:
    disponibles = [v for f in fuentes for v, _ in _numeros(f)]
    return all(
        any(round(f, decimales) == valor for f in disponibles)
        for valor, decimales in _numeros(texto)
    )


def _es_acusacion(texto: str) -> bool:
    relleno = f" {normalizar_texto(texto)} "
    return any(f" {p}" in relleno for p in PALABRAS_ACUSACION)


def _motivo_descarte(
    afirmacion: AfirmacionPropuesta, evidencias: Mapping[str, Evidencia]
) -> str | None:
    if afirmacion.tipo not in TIPOS_AFIRMACION:
        return "tipo_invalido"
    if not afirmacion.citas:
        return "sin_cita"
    citadas: list[tuple[Evidencia, str]] = []
    for cita in afirmacion.citas:
        evidencia = evidencias.get(cita.id_evidencia)
        if evidencia is None:
            return "evidencia_no_recuperada"
        if cita.campo not in CAMPOS_CITABLES.get(evidencia.tipo, frozenset()):
            return "campo_no_citable"
        citadas.append((evidencia, cita.campo))

    if not _cifras_respaldadas(afirmacion.texto, [e.campos.get(c, "") for e, c in citadas]):
        return "cifra_sin_respaldo"
    for evidencia, _ in citadas:
        anio = evidencia.campos.get("anio")
        if evidencia.tipo == "indicador" and anio and anio not in afirmacion.texto:
            return "indicador_sin_anio"
    if afirmacion.tipo == "hecho" and _es_acusacion(afirmacion.texto):
        return "acusacion_como_hecho"
    return None


def validar_afirmaciones(
    afirmaciones: Sequence[AfirmacionPropuesta], evidencias: Sequence[Evidencia]
) -> ResultadoCitas:
    """Valida contra las evidencias **recuperadas** para esta consulta, no contra todo el corpus."""
    por_id = {e.id: e for e in evidencias}
    aceptadas: list[AfirmacionPropuesta] = []
    descartadas: list[Descartada] = []
    for afirmacion in afirmaciones:
        motivo = _motivo_descarte(afirmacion, por_id)
        if motivo is None:
            aceptadas.append(afirmacion)
        else:
            descartadas.append(Descartada(afirmacion, motivo))
    return ResultadoCitas(tuple(aceptadas), tuple(descartadas))


def debe_abstenerse(
    resultados: Sequence[Resultado], *, umbral_bm25: float, umbral_coseno: float | None = None
) -> bool:
    """Compuerta previa al LLM: sin evidencia suficientemente cercana, no se genera nada."""
    if not resultados:
        return True
    mejor_bm25 = max(r.bm25 for r in resultados)
    cosenos = [r.coseno for r in resultados if r.coseno is not None]
    if cosenos and umbral_coseno is not None and max(cosenos) >= umbral_coseno:
        return False
    return mejor_bm25 < umbral_bm25
