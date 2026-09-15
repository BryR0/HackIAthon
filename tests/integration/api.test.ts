/**
 * Contratos de las rutas de API.
 *
 * Verifica lo que el Blueprint exige del Paso 6: que los casos dorados den el
 * mismo valor por API que por motor, que un fallo del LLM no toque el calculo,
 * y que el texto del sintoma no salga en ninguna respuesta.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import golden from '../fixtures/golden-cases.json'
import { POST as estimateRoute } from '../../src/app/api/estimate/route'
import { POST as triageRoute } from '../../src/app/api/triage/route'
import { estimate } from '../../src/domain/estimate'
import { serviceForSpecialty, defaultCatalog } from '../../src/domain/catalog'

interface GoldenEstimateCase {
  kind: string
  id: string
  input: { patientDemoId: string; serviceId: string; asOf: string }
}

function post(body: unknown): Request {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function rawPost(body: string): Request {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv('AI_PROVIDER', 'local')
})

describe('POST /api/estimate', () => {
  const goldenEstimates = (golden.cases as GoldenEstimateCase[]).filter(
    (c) => c.kind === 'estimate',
  )

  it.each(goldenEstimates.map((c) => [c.id, c] as const))(
    '%s por API coincide con el motor',
    async (_id, testCase) => {
      const service = defaultCatalog.services.find((s) => s.id === testCase.input.serviceId)!
      const response = await estimateRoute(
        post({
          patientDemoId: testCase.input.patientDemoId,
          specialtyId: service.specialtyId,
          asOf: testCase.input.asOf,
        }),
      )
      const payload = await response.json()
      const { meta: _meta, ...withoutMeta } = payload

      expect(response.status).toBe(200)
      expect(withoutMeta).toStrictEqual(estimate(testCase.input))
    },
  )

  it('rechaza una especialidad que no existe', async () => {
    const response = await estimateRoute(
      post({ patientDemoId: 'ANA-PLUS', specialtyId: 'ESP-INVENTADA' }),
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'UNKNOWN_SPECIALTY' })
  })

  it('rechaza un paciente que no existe', async () => {
    const response = await estimateRoute(
      post({ patientDemoId: 'NO-EXISTE', specialtyId: 'ESP-DERMATOLOGIA' }),
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'UNKNOWN_CATALOG_ID' })
  })

  it('rechaza JSON malformado sin reventar', async () => {
    const response = await estimateRoute(rawPost('{no es json'))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'MALFORMED_JSON' })
  })

  it('no almacena en cache: cada calculo se recalcula', async () => {
    const response = await estimateRoute(
      post({ patientDemoId: 'ANA-PLUS', specialtyId: 'ESP-DERMATOLOGIA', asOf: '2026-09-15' }),
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('refrescar no cambia el resultado', async () => {
    const body = { patientDemoId: 'ANA-PLUS', specialtyId: 'ESP-DERMATOLOGIA', asOf: '2026-09-15' }
    const first = await (await estimateRoute(post(body))).json()
    const second = await (await estimateRoute(post(body))).json()
    const { meta: _a, ...firstBody } = first
    const { meta: _b, ...secondBody } = second
    expect(firstBody).toStrictEqual(secondBody)
  })
})

describe('POST /api/triage', () => {
  it('clasifica un sintoma claro dentro del catalogo', async () => {
    const response = await triageRoute(post({ text: 'tengo una mancha en la piel hace semanas' }))
    const payload = await response.json()
    expect(payload.status).toBe('classified')
    expect(payload.specialtyId).toBe('ESP-DERMATOLOGIA')
  })

  it('bloquea con el guardrail antes de llamar a nadie', async () => {
    const response = await triageRoute(
      post({ text: 'me duele fuerte el pecho y me falta el aire' }),
    )
    const payload = await response.json()
    expect(payload.status).toBe('emergency_warning')
    expect(payload.meta.blockedByGuardrail).toBe(true)
    expect(payload).not.toHaveProperty('specialtyId')
  })

  it('el guardrail sigue activo con proveedor remoto configurado y caido', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini')
    vi.stubEnv('AI_API_KEY', 'clave-de-prueba')
    const fetchSpy = vi.fn().mockRejectedValue(new Error('red caida'))
    vi.stubGlobal('fetch', fetchSpy)

    const response = await triageRoute(post({ text: 'me duele fuerte el pecho' }))
    const payload = await response.json()

    expect(payload.status).toBe('emergency_warning')
    // Lo importante: no se llamo al proveedor. El guardrail corto antes.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('degrada al clasificador local cuando el proveedor falla', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini')
    vi.stubEnv('AI_API_KEY', 'clave-de-prueba')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

    const response = await triageRoute(post({ text: 'me torci el tobillo y esta hinchado' }))
    const payload = await response.json()

    expect(payload.status).toBe('classified')
    expect(payload.specialtyId).toBe('ESP-TRAUMATOLOGIA')
    expect(payload.meta.degraded).toBe(true)
    expect(payload.meta.provider).toBe('local')
  })

  it('descarta una especialidad inventada por el proveedor', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini')
    vi.stubEnv('AI_API_KEY', 'clave-de-prueba')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { text: '{"status":"classified","specialtyId":"ESP-FALSA","confidence":"high"}' },
                ],
              },
            },
          ],
        }),
      }),
    )

    const response = await triageRoute(post({ text: 'me pica la piel' }))
    const payload = await response.json()

    expect(payload.specialtyId).not.toBe('ESP-FALSA')
    expect(payload.meta.degraded).toBe(true)
  })

  it('rechaza texto demasiado corto', async () => {
    const response = await triageRoute(post({ text: 'ay' }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'INVALID_SYMPTOM' })
  })

  it('rechaza texto que supera el limite', async () => {
    const response = await triageRoute(post({ text: 'a'.repeat(501) }))
    expect(response.status).toBe(400)
  })
})

describe('privacidad: el sintoma no sale en la respuesta', () => {
  const canary = 'CANARIO-SINTETICO-cedula-1712345678-vivo-en-quito'

  it('ni en triage ni en sus metadatos', async () => {
    const response = await triageRoute(post({ text: `me pica la piel ${canary}` }))
    const body = await response.text()
    expect(body).not.toContain(canary)
    expect(body).not.toContain('1712345678')
  })

  it('ni cuando la entrada es invalida', async () => {
    const response = await triageRoute(post({ text: `x${canary}`.repeat(30) }))
    const body = await response.text()
    expect(body).not.toContain(canary)
  })

  it('ni en la respuesta de estimate, que nunca ve texto libre', async () => {
    const response = await estimateRoute(
      post({ patientDemoId: 'ANA-PLUS', specialtyId: 'ESP-DERMATOLOGIA', notas: canary }),
    )
    const body = await response.text()
    expect(body).not.toContain(canary)
  })
})

describe('aislamiento entre LLM y dinero', () => {
  it('el mismo calculo da lo mismo con proveedor local y con remoto caido', async () => {
    const body = { patientDemoId: 'ANA-PLUS', specialtyId: 'ESP-DERMATOLOGIA', asOf: '2026-09-15' }

    vi.stubEnv('AI_PROVIDER', 'local')
    const withLocal = await (await estimateRoute(post(body))).json()

    vi.stubEnv('AI_PROVIDER', 'gemini')
    vi.stubEnv('AI_API_KEY', 'clave-de-prueba')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('caido')))
    const withBrokenRemote = await (await estimateRoute(post(body))).json()

    expect(withLocal.patientCopayMinor).toBe(withBrokenRemote.patientCopayMinor)
    expect(withLocal.recommendedHospitalId).toBe(withBrokenRemote.recommendedHospitalId)
  })

  it('cada especialidad tiene su servicio de consulta inicial', () => {
    for (const specialty of defaultCatalog.specialties) {
      expect(serviceForSpecialty(defaultCatalog, specialty.id)).toBeDefined()
    }
  })
})
