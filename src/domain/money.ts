/**
 * Aritmetica de dinero. Solo enteros.
 *
 * Esta es la via del motor de produccion. El oraculo de scripts/oracle.py usa
 * Decimal con ROUND_HALF_UP, a proposito distinta: si ambas coinciden en los
 * casos dorados el acuerdo es evidencia, no coincidencia de implementacion.
 */

import type { AmountMinor, BasisPoints } from './types'

export const BASIS_POINTS_SCALE = 10_000

/** Mitad de la escala. Sumarla antes de truncar equivale a redondear half-up. */
const HALF_SCALE = BASIS_POINTS_SCALE / 2

/**
 * Aplica un porcentaje en puntos basicos con redondeo comercial half-up.
 *
 * `Math.floor((a * bp + 5000) / 10000)` redondea hacia arriba en el empate
 * exacto `.5`, que es lo que exige docs/domain.md seccion 4.
 *
 * Solo acepta enteros no negativos: un monto negativo o fraccionario indica un
 * defecto de datos y debe fallar ruidosamente, no propagarse como NaN.
 */
export function applyBasisPoints(amountMinor: AmountMinor, basisPoints: BasisPoints): AmountMinor {
  assertNonNegativeInteger(amountMinor, 'amountMinor')
  assertNonNegativeInteger(basisPoints, 'basisPoints')
  if (basisPoints > BASIS_POINTS_SCALE) {
    throw new RangeError(`basisPoints ${basisPoints} supera ${BASIS_POINTS_SCALE}`)
  }
  return Math.floor((amountMinor * basisPoints + HALF_SCALE) / BASIS_POINTS_SCALE)
}

/** Un copago nunca supera el precio de la consulta. */
export function capAtReference(copayMinor: AmountMinor, referenceMinor: AmountMinor): AmountMinor {
  assertNonNegativeInteger(copayMinor, 'copayMinor')
  assertNonNegativeInteger(referenceMinor, 'referenceMinor')
  return Math.min(copayMinor, referenceMinor)
}

export function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${label} debe ser un entero, llego ${JSON.stringify(value)}`)
  }
  if (value < 0) {
    throw new RangeError(`${label} no puede ser negativo (${value})`)
  }
}

/** Formatea para la interfaz. Nunca se usa para calcular. */
export function formatMinor(amountMinor: AmountMinor, currency: string, locale = 'es-EC'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amountMinor / 100)
}
