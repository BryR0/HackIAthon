/**
 * Pantalla principal. Server component: arma los catalogos y los pasa al flujo.
 *
 * Los datos ficticios se resuelven en el servidor para que el cliente reciba
 * solo lo que necesita mostrar, no el catalogo completo de reglas y tarifas.
 */

import { MainExperience } from '../components/MainExperience'
import { hospitals, patients, plans, specialties } from '../domain/catalog'

export default function HomePage() {
  const planNameById = new Map(plans.map((plan) => [plan.id, plan.name]))

  const patientOptions = patients.map((patient) => ({
    id: patient.id,
    displayName: patient.displayName,
    planName: planNameById.get(patient.planId) ?? patient.planId,
  }))

  const specialtyOptions = specialties.map((specialty) => ({
    id: specialty.id,
    label: specialty.name,
  }))

  const hospitalNames = Object.fromEntries(hospitals.map((h) => [h.id, h.name]))
  const hospitalLocations = Object.fromEntries(hospitals.map((h) => [h.id, h.location]))

  return (
    <MainExperience
      patients={patientOptions}
      specialties={specialtyOptions}
      hospitalNames={hospitalNames}
      hospitalLocations={hospitalLocations}
    />
  )
}
