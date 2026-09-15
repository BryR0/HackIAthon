/**
 * Pantalla principal. Server component: arma los catalogos y los pasa al flujo.
 *
 * Los datos ficticios se resuelven en el servidor para que el cliente reciba
 * solo lo que necesita mostrar, no el catalogo completo de reglas y tarifas.
 */

import { ConsultaFlow } from '../components/ConsultaFlow'
import { hospitals, patients, plans, specialties } from '../domain/catalog'

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

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
      <section aria-labelledby="titulo-inicio" className="mb-12">
        <span className="mb-2 block font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-primary">
          Reto 3 &middot; hackIAthon
        </span>

        <h1 id="titulo-inicio" className="mb-4 text-display">
          Sabe cuanto pagas antes de ir.
        </h1>

        <p className="max-w-[62ch] text-lg text-muted">
          Describe tu sintoma. El agente sugiere la especialidad, un motor de reglas aplica la
          cobertura de tu plan y te muestra que hospital de tu red te sale mas barato.
        </p>

        <div className="mt-6 grid gap-4 border-t-2 border-ink pt-6 sm:grid-cols-2 sm:gap-8">
          <div className="flex gap-3">
            <svg {...ICON_PROPS} className="mt-0.5 shrink-0 text-accent">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span>
              <strong className="mb-1 block font-heading font-semibold text-strong">Si hace</strong>
              <span className="block text-[0.9375rem] text-muted">
                Sugiere una especialidad, aplica las reglas de tu plan y ensena el calculo completo,
                regla por regla.
              </span>
            </span>
          </div>

          <div className="flex gap-3">
            <svg {...ICON_PROPS} className="mt-0.5 shrink-0 text-danger">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            <span>
              <strong className="mb-1 block font-heading font-semibold text-strong">No hace</strong>
              <span className="block text-[0.9375rem] text-muted">
                No diagnostica, no autoriza procedimientos y no emite facturas. El monto es una
                estimacion con datos ficticios.
              </span>
            </span>
          </div>
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
