/**
 * POST /api/triage — sintoma en texto libre a especialidad del catalogo.
 *
 * Contrato de privacidad: el texto del sintoma se procesa y se descarta. No se
 * registra, no se persiste y no aparece en la respuesta. Lo unico que sale son
 * ids del catalogo y codigos de estado.
 */

import { NextResponse } from 'next/server'

import { triage } from '../../../agent/triage'
import { symptomInputSchema } from '../../../agent/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const parsed = symptomInputSchema.safeParse(body)
  if (!parsed.success) {
    // Se devuelve el mensaje de validacion, nunca el texto que lo provoco.
    return NextResponse.json(
      {
        status: 'invalid_request',
        errorCode: 'INVALID_SYMPTOM',
        message: parsed.error.issues[0]?.message ?? 'Entrada invalida.',
      },
      { status: 400 },
    )
  }

  const outcome = await triage(parsed.data.text)

  return NextResponse.json(
    {
      ...outcome.result,
      meta: {
        provider: outcome.provider,
        degraded: outcome.degraded,
        blockedByGuardrail: outcome.blockedByGuardrail,
        durationMs: Date.now() - started,
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
