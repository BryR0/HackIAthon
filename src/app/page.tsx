/**
 * Pantalla principal. Server component: arma los catalogos y los pasa al flujo.
 *
 * Los datos ficticios se resuelven en el servidor para que el cliente reciba
 * solo lo que necesita mostrar, no el catalogo completo de reglas y tarifas.
 */

import { ConsultaFlow } from '../components/ConsultaFlow'
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
    <>
      <section aria-labelledby="titulo-inicio">
        <h1 id="titulo-inicio">Estima tu copago antes de atenderte</h1>
        <p>
          Describe tu sintoma y el agente sugiere la especialidad. Un motor de reglas calcula tu
          copago exacto y compara los hospitales de tu red, de mas barato a mas caro.
        </p>
        <div className="notice notice--info">
          <h2 className="notice__title">Que hace y que no hace</h2>
          <p>
            <strong>Si hace:</strong> sugiere una especialidad, aplica las reglas de cobertura de tu
            plan y te muestra el calculo completo.
          </p>
          <p>
            <strong>No hace:</strong> no diagnostica, no autoriza procedimientos y no emite facturas.
            El monto es una estimacion con datos ficticios.
          </p>
        </div>
      </section>

      <ConsultaFlow
        patients={patientOptions}
        specialties={specialtyOptions}
        hospitalNames={hospitalNames}
        hospitalLocations={hospitalLocations}
      />
    </>
  )
}
