/**
 * Orquestacion del triage.
 *
 * Orden que no se puede alterar:
 *   1. Guardrail de emergencia, determinista, ANTES del proveedor.
 *   2. Solo si no hubo senal, se llama al clasificador.
 *
 * Por eso una emergencia se detecta aunque el proveedor este caido, aunque no
 * haya credencial y aunque el usuario elija la especialidad a mano.
 */

import 'server-only'

import { detectEmergency } from './emergency'
import { classify, resolveProvider, type ProviderName } from './provider'
import type { TriageResult } from '../domain/types'

export interface TriageOutcome {
  readonly result: TriageResult
  readonly provider: ProviderName
  /** Se pidio un proveedor remoto y respondio el doble local. */
  readonly degraded: boolean
  /** El guardrail corto el flujo antes de llamar a nadie. */
  readonly blockedByGuardrail: boolean
}

export async function triage(text: string): Promise<TriageOutcome> {
  const emergencyCode = detectEmergency(text)
  if (emergencyCode !== null) {
    return {
      result: { status: 'emergency_warning', messageCode: emergencyCode },
      provider: resolveProvider(),
      degraded: false,
      blockedByGuardrail: true,
    }
  }

  const outcome = await classify(text)
  return {
    result: outcome.response,
    provider: outcome.provider,
    degraded: outcome.degraded,
    blockedByGuardrail: false,
  }
}
