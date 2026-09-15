/**
 * Carga de catalogos cerrados.
 *
 * Los JSON viajan en el bundle: son datos ficticios pequenos y versionados, y
 * el Blueprint descarta base de datos para el MVP (ADR 0001 D6).
 *
 * Toda busqueda por id devuelve `undefined` en vez de lanzar: el motor decide
 * si la ausencia es `needs_information` o un defecto de programacion.
 */

import coverageRulesJson from '../../data/coverage-rules.json'
import hospitalRatesJson from '../../data/hospital-rates.json'
import hospitalsJson from '../../data/hospitals.json'
import patientsJson from '../../data/patients.json'
import plansJson from '../../data/plans.json'
import servicesJson from '../../data/services.json'
import specialtiesJson from '../../data/specialties.json'

import type {
  CoverageRule,
  Hospital,
  HospitalRate,
  InsurancePlan,
  PatientDemo,
  Service,
  Specialty,
} from './types'

export const specialties = specialtiesJson.items as readonly Specialty[]
export const services = servicesJson.items as readonly Service[]
export const plans = plansJson.items as readonly InsurancePlan[]
export const patients = patientsJson.items as readonly PatientDemo[]
export const hospitals = hospitalsJson.items as readonly Hospital[]
export const coverageRules = coverageRulesJson.items as readonly CoverageRule[]
export const hospitalRates = hospitalRatesJson.items as readonly HospitalRate[]

export const CATALOG_RULE_VERSION = plansJson.ruleVersion

export interface Catalog {
  readonly specialties: readonly Specialty[]
  readonly services: readonly Service[]
  readonly plans: readonly InsurancePlan[]
  readonly patients: readonly PatientDemo[]
  readonly hospitals: readonly Hospital[]
  readonly coverageRules: readonly CoverageRule[]
  readonly hospitalRates: readonly HospitalRate[]
}

/** Catalogo por defecto. Las pruebas pueden pasar uno propio al motor. */
export const defaultCatalog: Catalog = {
  specialties,
  services,
  plans,
  patients,
  hospitals,
  coverageRules,
  hospitalRates,
}

export function findPatient(catalog: Catalog, id: string): PatientDemo | undefined {
  return catalog.patients.find((p) => p.id === id)
}

export function findPlan(catalog: Catalog, id: string): InsurancePlan | undefined {
  return catalog.plans.find((p) => p.id === id)
}

export function findService(catalog: Catalog, id: string): Service | undefined {
  return catalog.services.find((s) => s.id === id)
}

export function findSpecialty(catalog: Catalog, id: string): Specialty | undefined {
  return catalog.specialties.find((s) => s.id === id)
}

export function findHospital(catalog: Catalog, id: string): Hospital | undefined {
  return catalog.hospitals.find((h) => h.id === id)
}

/** Servicio de consulta inicial de una especialidad. Uno solo, por invariante. */
export function serviceForSpecialty(catalog: Catalog, specialtyId: string): Service | undefined {
  return catalog.services.find((s) => s.specialtyId === specialtyId)
}

/** Ids validos para restringir la salida del LLM. Nunca se acepta texto libre. */
export function allowedSpecialtyIds(catalog: Catalog = defaultCatalog): readonly string[] {
  return catalog.specialties.map((s) => s.id)
}
