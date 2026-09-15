/**
 * Casos dorados: motor TS contra el oraculo Python.
 *
 * Las expectativas de tests/fixtures/golden-cases.json las calculo
 * scripts/oracle.py con Decimal + ROUND_HALF_UP. El motor usa aritmetica
 * entera. Son dos implementaciones independientes a proposito: coincidir en
 * los 18 casos es evidencia, no tautologia.
 */

import { describe, expect, it } from 'vitest'

import golden from '../fixtures/golden-cases.json'
import { estimate } from '../../src/domain/estimate'
import { applyBasisPoints, capAtReference } from '../../src/domain/money'
import type { EstimateResult } from '../../src/domain/types'

interface GoldenCase {
  id: string
  kind: string
  description: string
  input: { patientDemoId: string; serviceId: string; asOf: string }
  expected: Record<string, unknown>
}

const estimateCases = (golden.cases as GoldenCase[]).filter((c) => c.kind === 'estimate')

describe('casos dorados de estimacion', () => {
  it('el fixture cubre el minimo que exige el Blueprint', () => {
    expect(estimateCases.length).toBeGreaterThanOrEqual(16)
  })

  it.each(estimateCases.map((c) => [c.id, c] as const))(
    '%s coincide con el oraculo independiente',
    (_id, testCase) => {
      const actual = estimate(testCase.input)
      expect(actual).toStrictEqual(testCase.expected)
    },
  )
})

describe('invariantes financieros sobre todos los casos', () => {
  const estimated = estimateCases
    .map((c) => estimate(c.input))
    .filter((r): r is Extract<EstimateResult, { status: 'estimated' }> => r.status === 'estimated')

  it('hay casos estimados que verificar', () => {
    expect(estimated.length).toBeGreaterThan(0)
  })

  it('cubierto mas copago siempre reconstruye la referencia', () => {
    for (const result of estimated) {
      expect(result.coveredAmountMinor + result.patientCopayMinor).toBe(result.referenceCostMinor)
    }
  })

  it('ningun copago supera el precio de la consulta', () => {
    for (const result of estimated) {
      expect(result.patientCopayMinor).toBeLessThanOrEqual(result.referenceCostMinor)
    }
  })

  it('todos los montos son enteros no negativos, nunca NaN', () => {
    for (const result of estimated) {
      for (const amount of [
        result.referenceCostMinor,
        result.coveredAmountMinor,
        result.patientCopayMinor,
      ]) {
        expect(Number.isInteger(amount)).toBe(true)
        expect(amount).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('el hospital recomendado es el de copago mas bajo de la lista', () => {
    for (const result of estimated) {
      const cheapest = Math.min(...result.alternatives.map((a) => a.patientCopayMinor))
      expect(result.patientCopayMinor).toBe(cheapest)
      expect(result.alternatives[0]?.hospitalId).toBe(result.recommendedHospitalId)
    }
  })

  it('las alternativas vienen ordenadas por el desempate documentado', () => {
    for (const result of estimated) {
      for (let i = 1; i < result.alternatives.length; i += 1) {
        const previous = result.alternatives[i - 1]!
        const current = result.alternatives[i]!
        const ordered =
          previous.patientCopayMinor < current.patientCopayMinor ||
          (previous.patientCopayMinor === current.patientCopayMinor &&
            (previous.referenceCostMinor < current.referenceCostMinor ||
              (previous.referenceCostMinor === current.referenceCostMinor &&
                previous.hospitalId < current.hospitalId)))
        expect(ordered).toBe(true)
      }
    }
  })

  it('un mismo calculo repetido da el mismo resultado', () => {
    for (const testCase of estimateCases) {
      expect(estimate(testCase.input)).toStrictEqual(estimate(testCase.input))
    }
  })
})

describe('redondeo half-up', () => {
  it('redondea hacia arriba en el empate exacto .5', () => {
    // 6505 * 70 % = 4553.5 exacto. Es el caso GC-01 del dataset.
    expect(applyBasisPoints(6505, 7000)).toBe(4554)
  })

  it('no altera un producto que ya es entero', () => {
    expect(applyBasisPoints(8500, 7000)).toBe(5950)
    expect(applyBasisPoints(7000, 7000)).toBe(4900)
  })

  it('redondea hacia abajo por debajo de .5', () => {
    // 3333 * 70 % = 2333.1
    expect(applyBasisPoints(3333, 7000)).toBe(2333)
  })

  it('trata los extremos 0 % y 100 % sin casos especiales', () => {
    expect(applyBasisPoints(4000, 0)).toBe(0)
    expect(applyBasisPoints(4000, 10_000)).toBe(4000)
  })

  it('rechaza entradas que no son enteros no negativos', () => {
    expect(() => applyBasisPoints(100.5, 7000)).toThrow(TypeError)
    expect(() => applyBasisPoints(-100, 7000)).toThrow(RangeError)
    expect(() => applyBasisPoints(100, 12_000)).toThrow(RangeError)
    expect(() => applyBasisPoints(Number.NaN, 7000)).toThrow(TypeError)
  })
})

describe('limite del copago fijo', () => {
  it('nunca deja pagar mas que el precio', () => {
    expect(capAtReference(9900, 8000)).toBe(8000)
  })

  it('respeta el copago cuando es menor que el precio', () => {
    expect(capAtReference(2500, 8000)).toBe(2500)
  })
})
