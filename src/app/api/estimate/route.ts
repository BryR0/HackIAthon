/**
 * POST /api/estimate — copago y comparacion de hospitales.
 *
 * Solo acepta ids de catalogos cerrados. Ningun texto libre entra aqui, asi
 * que un fallo del LLM no puede alterar un monto.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { estimate, UnknownCatalogIdError, AmbiguousCoverageRuleError } from '../../../domain/estimate'
import { serviceForSpecialty, defaultCatalog } from '../../../domain/catalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  patientDemoId: z.string().min(1),
  specialtyId: z.string().min(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(request: Request) {
  const started = Date.now()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { status: 'invalid_request', errorCode: 'MALFORMED_JSON' },
      { status: 400 },
    )
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'invalid_request', errorCode: 'INVALID_INPUT' },
      { status: 400 },
    )
  }

  const service = serviceForSpecialty(defaultCatalog, parsed.data.specialtyId)
  if (!service) {
    return NextResponse.json(
      { status: 'invalid_request', errorCode: 'UNKNOWN_SPECIALTY' },
      { status: 400 },
    )
  }

  try {
    const result = estimate({
      patientDemoId: parsed.data.patientDemoId,
      serviceId: service.id,
      asOf: parsed.data.asOf ?? today(),
    })

    return NextResponse.json(
      { ...result, meta: { durationMs: Date.now() - started } },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof UnknownCatalogIdError) {
      return NextResponse.json(
        { status: 'invalid_request', errorCode: 'UNKNOWN_CATALOG_ID' },
        { status: 400 },
      )
    }
    if (error instanceof AmbiguousCoverageRuleError) {
      // Datos ambiguos: es un fallo del catalogo, no del usuario. Nunca se
      // devuelve un monto elegido a dedo entre reglas empatadas.
      return NextResponse.json(
        { status: 'error', errorCode: 'AMBIGUOUS_COVERAGE_RULE' },
        { status: 500 },
      )
    }
    return NextResponse.json({ status: 'error', errorCode: 'INTERNAL' }, { status: 500 })
  }
}
