/** Vigencia por fecha calendario. Sin hora ni zona: comparacion lexicografica. */

import type { IsoDay } from './types'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export interface Effective {
  readonly effectiveFrom: IsoDay
  readonly effectiveTo: IsoDay | null
}

export function assertIsoDay(value: unknown, label: string): asserts value is IsoDay {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) {
    throw new TypeError(`${label} debe ser YYYY-MM-DD, llego ${JSON.stringify(value)}`)
  }
}

/**
 * Vigencia inclusiva en ambos extremos. `effectiveTo: null` = abierta.
 *
 * El formato `YYYY-MM-DD` ordena igual como texto que como fecha, asi que la
 * comparacion directa evita construir Date y con ella los errores de zona.
 */
export function isEffectiveOn(row: Effective, asOf: IsoDay): boolean {
  if (asOf < row.effectiveFrom) return false
  return row.effectiveTo === null || asOf <= row.effectiveTo
}
