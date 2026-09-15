/**
 * Motor determinista de cobertura y copago.
 *
 * Especificacion normativa: docs/domain.md.
 *
 * Invariante central del proyecto: el LLM nunca entra aqui. Esta funcion solo
 * acepta ids que existen en catalogos cerrados, y ante cualquier dato ausente
 * devuelve un estado explicito en lugar de una cifra aproximada.
 *
 * Pura: mismos datos + misma version de reglas = mismo resultado.
 */

import { defaultCatalog, findPatient, findPlan, findService, type Catalog } from './catalog'
import { assertIsoDay, isEffectiveOn } from './dates'
import { rankHospitals } from './rank-hospitals'
import type { CoverageRule, EstimateResult, IsoDay, MissingInput } from './types'

export interface EstimateInput {
  readonly patientDemoId: string
  readonly serviceId: string
  readonly asOf: IsoDay
}

/** Falla el programa, no el usuario: la UI solo ofrece ids del catalogo. */
export class UnknownCatalogIdError extends Error {
  constructor(
    readonly field: 'patientDemoId' | 'serviceId' | 'planId',
    readonly value: string,
  ) {
    super(`${field} desconocido: "${value}"`)
    this.name = 'UnknownCatalogIdError'
  }
}

/** Empate de precedence entre reglas vigentes: los datos son ambiguos. */
export class AmbiguousCoverageRuleError extends Error {
  constructor(readonly ruleIds: readonly string[]) {
    super(`Empate de precedence entre reglas vigentes: ${ruleIds.join(', ')}`)
    this.name = 'AmbiguousCoverageRuleError'
  }
}

type RuleSelection =
  | { readonly ok: true; readonly rule: CoverageRule }
  | { readonly ok: false; readonly missing: MissingInput }

/**
 * Regla ganadora para (plan, servicio, fecha).
 *
 * Distingue "nunca existio" de "existio y caduco": son problemas operativos
 * distintos y la interfaz los explica distinto.
 */
export function selectCoverageRule(
  planId: string,
  serviceId: string,
  asOf: IsoDay,
  catalog: Catalog = defaultCatalog,
): RuleSelection {
  const matches = catalog.coverageRules.filter(
    (r) => r.planId === planId && r.serviceId === serviceId,
  )
  if (matches.length === 0) return { ok: false, missing: 'coverage_rule_missing' }

  const effective = matches.filter((r) => isEffectiveOn(r, asOf))
  if (effective.length === 0) return { ok: false, missing: 'coverage_rule_expired' }

  const best = Math.min(...effective.map((r) => r.precedence))
  const winners = effective.filter((r) => r.precedence === best)
  if (winners.length > 1) {
    throw new AmbiguousCoverageRuleError(winners.map((r) => r.id).sort())
  }

  return { ok: true, rule: winners[0]! }
}

export function estimate(input: EstimateInput, catalog: Catalog = defaultCatalog): EstimateResult {
  assertIsoDay(input.asOf, 'asOf')

  const patient = findPatient(catalog, input.patientDemoId)
  if (!patient) throw new UnknownCatalogIdError('patientDemoId', input.patientDemoId)

  const plan = findPlan(catalog, patient.planId)
  if (!plan) throw new UnknownCatalogIdError('planId', patient.planId)

  const service = findService(catalog, input.serviceId)
  if (!service) throw new UnknownCatalogIdError('serviceId', input.serviceId)

  const selection = selectCoverageRule(plan.id, service.id, input.asOf, catalog)
  if (!selection.ok) {
    return {
      status: 'needs_information',
      planId: plan.id,
      serviceId: service.id,
      ruleVersion: plan.ruleVersion,
      missing: [selection.missing],
    }
  }

  const rule = selection.rule

  if (rule.coverageType === 'not_covered') {
    return {
      status: 'not_covered',
      planId: plan.id,
      serviceId: service.id,
      ruleVersion: plan.ruleVersion,
      appliedRuleId: rule.id,
      reasonCode: 'service_excluded_by_plan',
    }
  }

  const { eligible, excluded } = rankHospitals(plan, service, rule, catalog, input.asOf)

  if (eligible.length === 0) {
    return {
      status: 'no_compatible_hospitals',
      planId: plan.id,
      serviceId: service.id,
      ruleVersion: plan.ruleVersion,
      appliedRuleId: rule.id,
      reasonCode: 'no_hospital_with_valid_rate',
      excluded,
    }
  }

  const best = eligible[0]!

  return {
    status: 'estimated',
    patientDemoId: patient.id,
    planId: plan.id,
    serviceId: service.id,
    ruleVersion: plan.ruleVersion,
    appliedRuleId: rule.id,
    currency: plan.currency,
    recommendedHospitalId: best.hospitalId,
    referenceCostMinor: best.referenceCostMinor,
    coveredAmountMinor: best.coveredAmountMinor,
    patientCopayMinor: best.patientCopayMinor,
    alternatives: eligible,
    excluded,
  }
}
