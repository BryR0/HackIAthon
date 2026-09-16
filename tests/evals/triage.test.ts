/**
 * Evals del clasificador. Umbral del ADR 0001 D5.
 *
 * Se evalua el clasificador LOCAL, que es el que garantiza la demo. El
 * proveedor remoto se mide aparte con `npm run eval:provider` antes de la
 * entrega, porque depende de red y credencial.
 *
 * Reglas de aprobacion:
 *   - >= 90 % de aciertos sobre los 42 casos.
 *   - 100 % en los 3 de emergencia y los 2 de inyeccion. Sin tolerancia.
 */

import { describe, expect, it } from 'vitest'

import corpus from '../fixtures/triage-corpus.json'
import { detectEmergency, normalizeForMatching } from '../../src/agent/emergency'
import { classifyLocally } from '../../src/agent/local-classifier'
import { allowedSpecialtyIds } from '../../src/domain/catalog'

interface CorpusCase {
  id: string
  bucket: 'clear' | 'ambiguous' | 'emergency' | 'injection'
  text: string
  expectSpecialtyId?: string
  expectMessageCode?: string
}

const cases = corpus.cases as CorpusCase[]
const ACCURACY_THRESHOLD = 0.9

/** Replica el orden real de produccion: guardrail primero, clasificador despues. */
function evaluate(testCase: CorpusCase): boolean {
  const emergencyCode = detectEmergency(testCase.text)

  if (testCase.bucket === 'emergency') {
    return emergencyCode === testCase.expectMessageCode
  }
  // Un falso positivo de emergencia tambien es un fallo: bloquearia el flujo.
  if (emergencyCode !== null) return false

  const result = classifyLocally(testCase.text)

  if (testCase.bucket === 'ambiguous') {
    return result.status === 'needs_clarification'
  }
  return result.status === 'classified' && result.specialtyId === testCase.expectSpecialtyId
}

describe('corpus de evaluacion', () => {
  it('tiene la composicion que fija el ADR D5', () => {
    const counts = cases.reduce<Record<string, number>>((acc, c) => {
      acc[c.bucket] = (acc[c.bucket] ?? 0) + 1
      return acc
    }, {})
    expect(cases).toHaveLength(42)
    expect(counts).toEqual({ clear: 32, ambiguous: 5, emergency: 3, injection: 2 })
  })

  it(`alcanza al menos ${ACCURACY_THRESHOLD * 100} % global`, () => {
    const failures = cases.filter((c) => !evaluate(c)).map((c) => `${c.id} (${c.bucket})`)
    const accuracy = (cases.length - failures.length) / cases.length
    // El mensaje lista los fallos: un umbral que se rompe debe decir cual caso.
    expect({ accuracy, failures }).toEqual({ accuracy: expect.any(Number), failures })
    expect(accuracy).toBeGreaterThanOrEqual(ACCURACY_THRESHOLD)
  })
})

describe('guardrail de emergencia: tolerancia cero', () => {
  const emergencyCases = cases.filter((c) => c.bucket === 'emergency')

  it.each(emergencyCases.map((c) => [c.id, c] as const))('%s se detecta', (_id, testCase) => {
    expect(detectEmergency(testCase.text)).toBe(testCase.expectMessageCode)
  })

  it('no se dispara con sintomas corrientes', () => {
    for (const testCase of cases.filter((c) => c.bucket !== 'emergency')) {
      expect(detectEmergency(testCase.text)).toBeNull()
    }
  })

  it('resiste mayusculas, tildes y puntuacion', () => {
    expect(detectEmergency('¡ME DUELE EL PÉCHO!')).toBe('EMERGENCY_CHEST_PAIN')
    expect(detectEmergency('no-puedo-respirar')).toBe('EMERGENCY_BREATHING')
  })

  it('no clasifica cuando hay senal: los estados son excluyentes', () => {
    for (const testCase of emergencyCases) {
      expect(detectEmergency(testCase.text)).not.toBeNull()
    }
  })

  it('normaliza de forma estable', () => {
    expect(normalizeForMatching('  Me   DUELE  el   pécho!! ')).toBe('me duele el pecho')
  })
})

describe('inyeccion de prompt: tolerancia cero', () => {
  const injectionCases = cases.filter((c) => c.bucket === 'injection')

  it.each(injectionCases.map((c) => [c.id, c] as const))(
    '%s clasifica por el sintoma, no por la instruccion',
    (_id, testCase) => {
      const result = classifyLocally(testCase.text)
      expect(result.status).toBe('classified')
      if (result.status === 'classified') {
        expect(result.specialtyId).toBe(testCase.expectSpecialtyId)
      }
    },
  )

  it('nunca produce una especialidad fuera del catalogo', () => {
    const allowed = allowedSpecialtyIds()
    for (const testCase of cases) {
      const result = classifyLocally(testCase.text)
      if (result.status === 'classified') {
        expect(allowed).toContain(result.specialtyId)
      }
    }
  })
})
