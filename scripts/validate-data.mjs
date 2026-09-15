#!/usr/bin/env node
/**
 * Validador de los catalogos cerrados del MVP.
 *
 * Sin dependencias a proposito: corre en Paso 1, antes de que exista
 * package.json. En Paso 2 se expone como `npm run validate:data`.
 *
 * Comprueba forma, unicidad de ids, integridad referencial, rangos de dinero y
 * porcentajes, coherencia de fechas, consistencia entre coverageType y sus
 * campos, y ausencia de empates de precedence. No calcula copagos: eso lo
 * verifica el oraculo en scripts/oracle.py.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AS_OF = '2026-09-15'
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY = /^[A-Z]{3}$/
const BASIS_POINTS_MAX = 10000
const MIN_ESTIMATE_CASES = 16

const problems = []

function fail(where, message) {
  problems.push(`${where}: ${message}`)
}

function read(relativePath) {
  try {
    return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'))
  } catch (error) {
    fail(relativePath, `no se pudo leer o parsear (${error.message})`)
    return null
  }
}

function checkCatalogShape(name, doc) {
  if (!doc) return []
  if (doc.fictional !== true) fail(name, 'debe declarar "fictional": true')
  if (typeof doc.ruleVersion !== 'string') fail(name, 'falta "ruleVersion"')
  if (!Array.isArray(doc.items)) {
    fail(name, 'falta el arreglo "items"')
    return []
  }
  const seen = new Set()
  for (const item of doc.items) {
    if (typeof item.id !== 'string' || item.id.length === 0) {
      fail(name, `item sin id: ${JSON.stringify(item).slice(0, 80)}`)
      continue
    }
    if (seen.has(item.id)) fail(name, `id duplicado "${item.id}"`)
    seen.add(item.id)
  }
  return doc.items
}

function checkMinorAmount(where, field, value) {
  if (!Number.isInteger(value)) fail(where, `${field} debe ser entero, llego ${JSON.stringify(value)}`)
  else if (value < 0) fail(where, `${field} no puede ser negativo (${value})`)
}

function checkDay(where, field, value, { nullable = false } = {}) {
  if (value === null) {
    if (!nullable) fail(where, `${field} no puede ser null`)
    return
  }
  if (typeof value !== 'string' || !ISO_DAY.test(value)) {
    fail(where, `${field} debe ser YYYY-MM-DD, llego ${JSON.stringify(value)}`)
    return
  }
  if (Number.isNaN(Date.parse(`${value}T00:00:00Z`))) fail(where, `${field} no es una fecha real (${value})`)
}

function checkRange(where, from, to) {
  if (typeof from === 'string' && typeof to === 'string' && to < from) {
    fail(where, `effectiveTo (${to}) es anterior a effectiveFrom (${from})`)
  }
}

function isEffective(row, asOf) {
  if (asOf < row.effectiveFrom) return false
  return row.effectiveTo === null || asOf <= row.effectiveTo
}

function requireRef(where, field, value, pool, poolName) {
  if (!pool.has(value)) fail(where, `${field} "${value}" no existe en ${poolName}`)
}

// --- carga -------------------------------------------------------------

const specialties = checkCatalogShape('data/specialties.json', read('data/specialties.json'))
const services = checkCatalogShape('data/services.json', read('data/services.json'))
const plans = checkCatalogShape('data/plans.json', read('data/plans.json'))
const patients = checkCatalogShape('data/patients.json', read('data/patients.json'))
const hospitals = checkCatalogShape('data/hospitals.json', read('data/hospitals.json'))
const coverageRules = checkCatalogShape('data/coverage-rules.json', read('data/coverage-rules.json'))
const rates = checkCatalogShape('data/hospital-rates.json', read('data/hospital-rates.json'))

const specialtyIds = new Set(specialties.map((s) => s.id))
const serviceIds = new Set(services.map((s) => s.id))
const planIds = new Set(plans.map((p) => p.id))
const hospitalIds = new Set(hospitals.map((h) => h.id))
const networkIds = new Set(plans.map((p) => p.networkId))

// --- servicios ---------------------------------------------------------

for (const service of services) {
  const where = `services/${service.id}`
  requireRef(where, 'specialtyId', service.specialtyId, specialtyIds, 'specialties')
  if (service.serviceType !== 'initial_consultation') {
    fail(where, `el MVP solo admite serviceType "initial_consultation", llego "${service.serviceType}"`)
  }
}

const servicesBySpecialty = new Map()
for (const service of services) {
  const list = servicesBySpecialty.get(service.specialtyId) ?? []
  list.push(service.id)
  servicesBySpecialty.set(service.specialtyId, list)
}
for (const specialty of specialties) {
  const list = servicesBySpecialty.get(specialty.id) ?? []
  if (list.length === 0) fail(`specialties/${specialty.id}`, 'no tiene ningun servicio asociado')
  if (list.length > 1) {
    fail(`specialties/${specialty.id}`, `el MVP espera una sola consulta inicial, hay ${list.length}: ${list.join(', ')}`)
  }
}

// --- planes y pacientes ------------------------------------------------

for (const plan of plans) {
  const where = `plans/${plan.id}`
  if (!CURRENCY.test(plan.currency ?? '')) fail(where, `currency debe ser ISO 4217, llego ${JSON.stringify(plan.currency)}`)
  if (typeof plan.networkId !== 'string' || plan.networkId.length === 0) fail(where, 'falta networkId')
  if (typeof plan.ruleVersion !== 'string') fail(where, 'falta ruleVersion')
}

for (const patient of patients) {
  requireRef(`patients/${patient.id}`, 'planId', patient.planId, planIds, 'plans')
}

// --- hospitales --------------------------------------------------------

for (const hospital of hospitals) {
  const where = `hospitals/${hospital.id}`
  if (!Array.isArray(hospital.networkIds) || hospital.networkIds.length === 0) {
    fail(where, 'networkIds debe ser un arreglo no vacio')
  }
  if (!Array.isArray(hospital.specialtyIds) || hospital.specialtyIds.length === 0) {
    fail(where, 'specialtyIds debe ser un arreglo no vacio')
  }
  for (const specialtyId of hospital.specialtyIds ?? []) {
    requireRef(where, 'specialtyIds', specialtyId, specialtyIds, 'specialties')
  }
}

for (const networkId of networkIds) {
  const members = hospitals.filter((h) => (h.networkIds ?? []).includes(networkId))
  if (members.length === 0) fail(`networks/${networkId}`, 'ningun hospital pertenece a esta red')
}

// --- reglas de cobertura ----------------------------------------------

const COVERAGE_TYPES = new Set(['fixed_copay', 'coinsurance', 'not_covered'])

for (const rule of coverageRules) {
  const where = `coverage-rules/${rule.id}`
  requireRef(where, 'planId', rule.planId, planIds, 'plans')
  requireRef(where, 'serviceId', rule.serviceId, serviceIds, 'services')
  checkDay(where, 'effectiveFrom', rule.effectiveFrom)
  checkDay(where, 'effectiveTo', rule.effectiveTo, { nullable: true })
  checkRange(where, rule.effectiveFrom, rule.effectiveTo)

  if (!Number.isInteger(rule.precedence)) fail(where, 'precedence debe ser entero')

  if (!COVERAGE_TYPES.has(rule.coverageType)) {
    fail(where, `coverageType invalido: ${JSON.stringify(rule.coverageType)}`)
    continue
  }

  if (rule.coverageType === 'fixed_copay') {
    checkMinorAmount(where, 'fixedCopayMinor', rule.fixedCopayMinor)
    if (rule.coverageBasisPoints !== null) fail(where, 'fixed_copay exige coverageBasisPoints null')
  } else if (rule.coverageType === 'coinsurance') {
    if (!Number.isInteger(rule.coverageBasisPoints)) {
      fail(where, 'coverageBasisPoints debe ser entero')
    } else if (rule.coverageBasisPoints < 0 || rule.coverageBasisPoints > BASIS_POINTS_MAX) {
      fail(where, `coverageBasisPoints fuera de 0..${BASIS_POINTS_MAX} (${rule.coverageBasisPoints})`)
    }
    if (rule.fixedCopayMinor !== null) fail(where, 'coinsurance exige fixedCopayMinor null')
  } else {
    if (rule.fixedCopayMinor !== null) fail(where, 'not_covered exige fixedCopayMinor null')
    if (rule.coverageBasisPoints !== null) fail(where, 'not_covered exige coverageBasisPoints null')
  }
}

// Empate de precedence entre reglas vigentes: el motor no podria elegir.
const rulesByKey = new Map()
for (const rule of coverageRules) {
  const key = `${rule.planId}|${rule.serviceId}`
  const list = rulesByKey.get(key) ?? []
  list.push(rule)
  rulesByKey.set(key, list)
}
for (const [key, list] of rulesByKey) {
  const effective = list.filter((r) => isEffective(r, AS_OF))
  if (effective.length < 2) continue
  const best = Math.min(...effective.map((r) => r.precedence))
  const winners = effective.filter((r) => r.precedence === best)
  if (winners.length > 1) {
    fail(`coverage-rules/${key}`, `empate de precedence ${best} entre ${winners.map((r) => r.id).join(', ')}`)
  }
}

// --- tarifas -----------------------------------------------------------

for (const rate of rates) {
  const where = `hospital-rates/${rate.id}`
  requireRef(where, 'hospitalId', rate.hospitalId, hospitalIds, 'hospitals')
  requireRef(where, 'serviceId', rate.serviceId, serviceIds, 'services')
  checkMinorAmount(where, 'referenceCostMinor', rate.referenceCostMinor)
  if (rate.referenceCostMinor === 0) fail(where, 'referenceCostMinor 0 no es una tarifa util')
  if (!CURRENCY.test(rate.currency ?? '')) fail(where, `currency debe ser ISO 4217, llego ${JSON.stringify(rate.currency)}`)
  checkDay(where, 'effectiveFrom', rate.effectiveFrom)
  checkDay(where, 'effectiveTo', rate.effectiveTo, { nullable: true })
  checkRange(where, rate.effectiveFrom, rate.effectiveTo)

  const hospital = hospitals.find((h) => h.id === rate.hospitalId)
  const service = services.find((s) => s.id === rate.serviceId)
  if (hospital && service && !(hospital.specialtyIds ?? []).includes(service.specialtyId)) {
    fail(where, `${rate.hospitalId} no ofrece la especialidad ${service.specialtyId} de este servicio`)
  }
}

// --- casos dorados -----------------------------------------------------

const golden = read('tests/fixtures/golden-cases.json')
if (golden) {
  if (golden.fictional !== true) fail('golden-cases', 'debe declarar "fictional": true')
  if (!Array.isArray(golden.cases)) {
    fail('golden-cases', 'falta el arreglo "cases"')
  } else {
    const patientIds = new Set(patients.map((p) => p.id))
    const seen = new Set()
    let estimateCases = 0
    for (const testCase of golden.cases) {
      const where = `golden-cases/${testCase.id}`
      if (seen.has(testCase.id)) fail(where, 'id de caso duplicado')
      seen.add(testCase.id)

      if (testCase.kind === 'estimate') {
        estimateCases += 1
        requireRef(where, 'patientDemoId', testCase.input.patientDemoId, patientIds, 'patients')
        requireRef(where, 'serviceId', testCase.input.serviceId, serviceIds, 'services')
        if (testCase.input.asOf !== golden.asOf) {
          fail(where, `asOf ${testCase.input.asOf} no coincide con el asOf global ${golden.asOf}`)
        }
        const expected = testCase.expected
        if (expected.status === 'estimated') {
          requireRef(where, 'recommendedHospitalId', expected.recommendedHospitalId, hospitalIds, 'hospitals')
          const ref = expected.referenceCostMinor
          const covered = expected.coveredAmountMinor
          const copay = expected.patientCopayMinor
          checkMinorAmount(where, 'referenceCostMinor', ref)
          checkMinorAmount(where, 'coveredAmountMinor', covered)
          checkMinorAmount(where, 'patientCopayMinor', copay)
          if (covered + copay !== ref) fail(where, `cubierto (${covered}) + copago (${copay}) != referencia (${ref})`)
          if (copay > ref) fail(where, `copago ${copay} supera el precio ${ref}`)
          const cheapest = Math.min(...expected.alternatives.map((a) => a.patientCopayMinor))
          if (copay !== cheapest) fail(where, `el recomendado no es el copago mas bajo (${copay} vs ${cheapest})`)
        }
      } else if (testCase.kind === 'triage') {
        const specialtyId = testCase.expected.specialtyId
        if (specialtyId !== undefined) {
          requireRef(where, 'specialtyId', specialtyId, specialtyIds, 'specialties')
        }
        if (testCase.expected.status === 'emergency_warning') {
          for (const forbidden of ['specialtyId', 'question', 'manualSelectionAllowed']) {
            if (forbidden in testCase.expected) {
              fail(where, `emergency_warning no puede incluir "${forbidden}": los estados son excluyentes`)
            }
          }
        }
      } else {
        fail(where, `kind desconocido: ${JSON.stringify(testCase.kind)}`)
      }
    }
    if (estimateCases < MIN_ESTIMATE_CASES) {
      fail('golden-cases', `el Blueprint exige al menos ${MIN_ESTIMATE_CASES} casos de estimacion, hay ${estimateCases}`)
    }
  }
}

// --- salida ------------------------------------------------------------

const catalogTotals = [
  ['specialties', specialties.length],
  ['services', services.length],
  ['plans', plans.length],
  ['patients', patients.length],
  ['hospitals', hospitals.length],
  ['coverage-rules', coverageRules.length],
  ['hospital-rates', rates.length],
  ['golden-cases', golden?.cases?.length ?? 0],
]

for (const [name, total] of catalogTotals) {
  console.log(`  ${name.padEnd(16)} ${String(total).padStart(3)}`)
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problema(s):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`\nCatalogos validos (asOf ${AS_OF}).`)
