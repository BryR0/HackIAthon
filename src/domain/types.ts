/**
 * Contratos del dominio. Vocabulario compartido entre motor, API y UI.
 *
 * Reglas que estos tipos hacen cumplir:
 * - Todo dinero es entero en unidades menores (centavos). Nunca float.
 * - Todo porcentaje es entero en puntos basicos (0..10000). Nunca float.
 * - Los estados son uniones discriminadas y mutuamente excluyentes: una
 *   emergencia no puede traer especialidad, y una estimacion incompleta no
 *   puede traer montos.
 *
 * Los valores viven en data/*.json y tests/fixtures/golden-cases.json.
 */

// --- primitivos --------------------------------------------------------

/** Fecha calendario ISO 8601, `YYYY-MM-DD`. Sin hora ni zona. */
export type IsoDay = string

/** Codigo ISO 4217, tres letras mayusculas. El MVP solo usa "USD". */
export type CurrencyCode = string

/** Entero en unidades menores de la moneda. 1951 = USD 19.51. */
export type AmountMinor = number

/** Entero en puntos basicos. 7000 = 70 %. */
export type BasisPoints = number

/** Monto con su moneda, para cruzar limites donde la moneda no es implicita. */
export interface Money {
  readonly amountMinor: AmountMinor
  readonly currency: CurrencyCode
}

// --- catalogos cerrados ------------------------------------------------

export interface PatientDemo {
  readonly id: string
  readonly displayName: string
  readonly planId: string
}

export interface InsurancePlan {
  readonly id: string
  readonly name: string
  readonly currency: CurrencyCode
  readonly networkId: string
  readonly ruleVersion: string
}

export interface Specialty {
  readonly id: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly safetyNotes: string
}

/** El MVP compara una sola cosa entre hospitales: la consulta inicial. */
export type ServiceType = 'initial_consultation'

export interface Service {
  readonly id: string
  readonly specialtyId: string
  readonly name: string
  readonly serviceType: ServiceType
}

export type CoverageType = 'fixed_copay' | 'coinsurance' | 'not_covered'

/**
 * Regla de cobertura de un plan sobre un servicio.
 *
 * Invariantes que valida scripts/validate-data.mjs:
 * - `fixed_copay` exige `fixedCopayMinor` y `coverageBasisPoints: null`.
 * - `coinsurance` exige `coverageBasisPoints` y `fixedCopayMinor: null`.
 * - `not_covered` exige ambos en null.
 * - Entre reglas vigentes del mismo (plan, servicio) no puede haber empate de
 *   `precedence`: el motor no tendria forma determinista de elegir.
 */
export interface CoverageRule {
  readonly id: string
  readonly planId: string
  readonly serviceId: string
  readonly coverageType: CoverageType
  readonly fixedCopayMinor: AmountMinor | null
  readonly coverageBasisPoints: BasisPoints | null
  /** Menor gana. */
  readonly precedence: number
  readonly effectiveFrom: IsoDay
  /** `null` = vigencia abierta. */
  readonly effectiveTo: IsoDay | null
}

export interface Hospital {
  readonly id: string
  readonly name: string
  readonly location: string
  readonly networkIds: readonly string[]
  readonly specialtyIds: readonly string[]
}

export interface HospitalRate {
  readonly id: string
  readonly hospitalId: string
  readonly serviceId: string
  readonly referenceCostMinor: AmountMinor
  readonly currency: CurrencyCode
  readonly effectiveFrom: IsoDay
  readonly effectiveTo: IsoDay | null
}

// --- triage ------------------------------------------------------------

export type TriageConfidence = 'high' | 'medium' | 'low'

/**
 * Resultado de convertir lenguaje natural en una especialidad del catalogo.
 *
 * El LLM solo puede producir `classified` o `needs_clarification`, y solo con
 * ids que existan en el catalogo. `emergency_warning` lo emite el guardrail
 * determinista ANTES de llamar al proveedor, por eso no depende de que haya
 * LLM disponible.
 */
export type TriageResult =
  | { readonly status: 'emergency_warning'; readonly messageCode: string }
  | { readonly status: 'needs_clarification'; readonly question: string }
  | {
      readonly status: 'classified'
      readonly specialtyId: string
      readonly confidence: TriageConfidence
    }
  | { readonly status: 'unavailable'; readonly manualSelectionAllowed: true }

// --- estimacion --------------------------------------------------------

/** Por que un hospital quedo fuera de la comparacion. Siempre explicito. */
export type HospitalExclusionReason =
  /** El hospital no pertenece a la red del plan. */
  | 'out_of_network'
  /** El hospital no atiende esa especialidad. */
  | 'specialty_not_offered'
  /** No existe ninguna tarifa registrada para ese servicio. */
  | 'no_rate'
  /** Existen tarifas, pero ninguna vigente a la fecha de calculo. */
  | 'expired_rate'
  /** Hay mas de una tarifa vigente: cual aplicar seria una suposicion. */
  | 'ambiguous_rate'
  /** La tarifa esta en una moneda distinta a la del plan. */
  | 'currency_mismatch'

export interface ExcludedHospital {
  readonly hospitalId: string
  readonly reason: HospitalExclusionReason
}

export interface HospitalEstimate {
  readonly hospitalId: string
  readonly referenceCostMinor: AmountMinor
  readonly coveredAmountMinor: AmountMinor
  readonly patientCopayMinor: AmountMinor
}

/** Falta un dato del catalogo. Nunca se sustituye por un supuesto. */
export type MissingInput = 'coverage_rule_missing' | 'coverage_rule_expired'

/**
 * Resultado del motor determinista.
 *
 * Los cuatro estados son excluyentes. Solo `estimated` trae montos: si algo
 * falta, el resultado lo dice en vez de inventar una cifra.
 */
export type EstimateResult =
  | {
      readonly status: 'estimated'
      readonly patientDemoId: string
      readonly planId: string
      readonly serviceId: string
      readonly ruleVersion: string
      readonly appliedRuleId: string
      readonly currency: CurrencyCode
      readonly recommendedHospitalId: string
      readonly referenceCostMinor: AmountMinor
      readonly coveredAmountMinor: AmountMinor
      readonly patientCopayMinor: AmountMinor
      /** Todos los hospitales elegibles, ya ordenados por el desempate. */
      readonly alternatives: readonly HospitalEstimate[]
      readonly excluded: readonly ExcludedHospital[]
    }
  | {
      readonly status: 'not_covered'
      readonly planId: string
      readonly serviceId: string
      readonly ruleVersion: string
      readonly appliedRuleId: string
      readonly reasonCode: 'service_excluded_by_plan'
    }
  | {
      readonly status: 'needs_information'
      readonly planId: string
      readonly serviceId: string
      readonly ruleVersion: string
      readonly missing: readonly MissingInput[]
    }
  | {
      readonly status: 'no_compatible_hospitals'
      readonly planId: string
      readonly serviceId: string
      readonly ruleVersion: string
      readonly appliedRuleId: string
      readonly reasonCode: 'no_hospital_with_valid_rate'
      readonly excluded: readonly ExcludedHospital[]
    }

// --- observabilidad ----------------------------------------------------

/**
 * Evento tecnico. Allowlist estricta: ningun campo admite texto libre del
 * paciente. El sintoma vive solo en memoria durante la consulta.
 */
export interface AuditEvent {
  readonly correlationId: string
  readonly eventType: string
  readonly durationMs: number
  readonly status: string
  readonly ruleVersion: string
  readonly errorCode: string | null
  readonly createdAt: string
}
