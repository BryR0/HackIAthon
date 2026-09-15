/**
 * Elegibilidad y orden de los hospitales.
 *
 * Especificacion normativa: docs/domain.md secciones 5 y 6.
 * El LLM no participa aqui. Solo entran ids de catalogos cerrados.
 */

import { isEffectiveOn } from './dates'
import { applyBasisPoints, capAtReference } from './money'
import type {
  Catalog,
} from './catalog'
import type {
  CoverageRule,
  ExcludedHospital,
  Hospital,
  HospitalEstimate,
  InsurancePlan,
  IsoDay,
  Service,
} from './types'

export interface RankingOutcome {
  readonly eligible: readonly HospitalEstimate[]
  readonly excluded: readonly ExcludedHospital[]
}

/**
 * Copago de un hospital concreto bajo la regla ya elegida.
 *
 * `fixed_copay` se limita al precio; `coinsurance` redondea el monto cubierto
 * una sola vez y deriva el copago por resta entera, de modo que
 * `cubierto + copago === referencia` siempre.
 */
function copayFor(rule: CoverageRule, referenceCostMinor: number): {
  coveredAmountMinor: number
  patientCopayMinor: number
} {
  if (rule.coverageType === 'fixed_copay') {
    const patientCopayMinor = capAtReference(rule.fixedCopayMinor ?? 0, referenceCostMinor)
    return { coveredAmountMinor: referenceCostMinor - patientCopayMinor, patientCopayMinor }
  }

  const coveredAmountMinor = applyBasisPoints(referenceCostMinor, rule.coverageBasisPoints ?? 0)
  return { coveredAmountMinor, patientCopayMinor: referenceCostMinor - coveredAmountMinor }
}

/**
 * Evalua un hospital. El primer motivo que aplique excluye y detiene: el orden
 * de las comprobaciones es parte de la especificacion, no un detalle.
 */
function evaluateHospital(
  hospital: Hospital,
  plan: InsurancePlan,
  service: Service,
  rule: CoverageRule,
  catalog: Catalog,
  asOf: IsoDay,
): HospitalEstimate | ExcludedHospital {
  const hospitalId = hospital.id

  if (!hospital.networkIds.includes(plan.networkId)) {
    return { hospitalId, reason: 'out_of_network' }
  }
  if (!hospital.specialtyIds.includes(service.specialtyId)) {
    return { hospitalId, reason: 'specialty_not_offered' }
  }

  const rows = catalog.hospitalRates.filter(
    (r) => r.hospitalId === hospitalId && r.serviceId === service.id,
  )
  if (rows.length === 0) return { hospitalId, reason: 'no_rate' }

  const effective = rows.filter((r) => isEffectiveOn(r, asOf))
  if (effective.length === 0) return { hospitalId, reason: 'expired_rate' }
  // Con dos tarifas vigentes, elegir una seria suponer. El plan prohibe suponer.
  if (effective.length > 1) return { hospitalId, reason: 'ambiguous_rate' }

  const rate = effective[0]!
  if (rate.currency !== plan.currency) return { hospitalId, reason: 'currency_mismatch' }

  const { coveredAmountMinor, patientCopayMinor } = copayFor(rule, rate.referenceCostMinor)
  return {
    hospitalId,
    referenceCostMinor: rate.referenceCostMinor,
    coveredAmountMinor,
    patientCopayMinor,
  }
}

function isEligible(row: HospitalEstimate | ExcludedHospital): row is HospitalEstimate {
  return 'patientCopayMinor' in row
}

/**
 * Orden: copago asc, luego costo de referencia asc, luego id asc.
 *
 * El tercer criterio existe para que el resultado sea reproducible, no porque
 * tenga sentido economico. Hace falta: con copago fijo todos los hospitales de
 * la red empatan en copago.
 */
function byCopayThenCostThenId(a: HospitalEstimate, b: HospitalEstimate): number {
  if (a.patientCopayMinor !== b.patientCopayMinor) {
    return a.patientCopayMinor - b.patientCopayMinor
  }
  if (a.referenceCostMinor !== b.referenceCostMinor) {
    return a.referenceCostMinor - b.referenceCostMinor
  }
  return a.hospitalId.localeCompare(b.hospitalId, 'en')
}

export function rankHospitals(
  plan: InsurancePlan,
  service: Service,
  rule: CoverageRule,
  catalog: Catalog,
  asOf: IsoDay,
): RankingOutcome {
  const eligible: HospitalEstimate[] = []
  const excluded: ExcludedHospital[] = []

  for (const hospital of catalog.hospitals) {
    const outcome = evaluateHospital(hospital, plan, service, rule, catalog, asOf)
    if (isEligible(outcome)) eligible.push(outcome)
    else excluded.push(outcome)
  }

  eligible.sort(byCopayThenCostThenId)
  excluded.sort((a, b) => a.hospitalId.localeCompare(b.hospitalId, 'en'))

  return { eligible, excluded }
}
