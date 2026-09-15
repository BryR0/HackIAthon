/**
 * Presentacion del resultado del motor.
 *
 * Muestra la formula, la regla aplicada y la lista completa de hospitales, no
 * solo el numero: el paciente tiene que poder ver de donde sale el monto.
 */

import { formatMinor } from '../domain/money'
import type { EstimateResult, HospitalExclusionReason } from '../domain/types'

interface Props {
  readonly result: EstimateResult
  readonly hospitalNames: Readonly<Record<string, string>>
  readonly hospitalLocations: Readonly<Record<string, string>>
  readonly specialtyName: string
}

const EXCLUSION_LABEL: Readonly<Record<HospitalExclusionReason, string>> = {
  out_of_network: 'fuera de la red de tu plan',
  specialty_not_offered: 'no atiende esta especialidad',
  no_rate: 'sin tarifa registrada para esta consulta',
  expired_rate: 'su tarifa esta vencida',
  ambiguous_rate: 'tiene tarifas duplicadas sin resolver',
  currency_mismatch: 'su tarifa esta en otra moneda',
}

const MISSING_LABEL: Readonly<Record<string, string>> = {
  coverage_rule_missing: 'tu plan no tiene una regla registrada para esta consulta',
  coverage_rule_expired: 'la regla de cobertura de tu plan esta vencida',
}

function WarningNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex gap-3 rounded border border-l-4 border-warn bg-warn-soft p-4"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-warn"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <div className="[&>*:last-child]:mb-0">
        <h2 className="mb-2 font-heading text-lg text-warn">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function ExcludedList({
  excluded,
  hospitalNames,
}: {
  excluded: readonly { hospitalId: string; reason: HospitalExclusionReason }[]
  hospitalNames: Readonly<Record<string, string>>
}) {
  if (excluded.length === 0) return null
  return (
    <details className="text-[0.9375rem] text-muted">
      <summary className="cursor-pointer py-2 font-semibold">
        Por que no aparecen los demas hospitales ({excluded.length})
      </summary>
      <ul className="mt-2 list-disc ps-6">
        {excluded.map((item) => (
          <li key={item.hospitalId}>
            {hospitalNames[item.hospitalId] ?? item.hospitalId}: {EXCLUSION_LABEL[item.reason]}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function EstimateResultView({
  result,
  hospitalNames,
  hospitalLocations,
  specialtyName,
}: Props) {
  if (result.status === 'needs_information') {
    return (
      <WarningNotice title="No podemos calcular un valor exacto">
        <p className="mb-3">
          Para {specialtyName}, {MISSING_LABEL[result.missing[0] ?? ''] ?? 'falta un dato'}. No
          mostramos un monto aproximado porque seria inventarlo.
        </p>
        <p>Consulta con tu aseguradora antes de agendar para confirmar la cobertura.</p>
      </WarningNotice>
    )
  }

  if (result.status === 'not_covered') {
    return (
      <WarningNotice title="Tu plan no cubre esta consulta">
        <p className="mb-3">
          La regla <code>{result.appliedRuleId}</code> de tu plan excluye {specialtyName}. Puedes
          atenderte pagando el valor particular del hospital.
        </p>
        <p>No prometemos ninguna cobertura para este servicio.</p>
      </WarningNotice>
    )
  }

  if (result.status === 'no_compatible_hospitals') {
    return (
      <WarningNotice title="Ningun hospital de tu red puede atender esto hoy">
        <p className="mb-3">
          Tu plan si cubre {specialtyName}, pero ningun hospital de tu red tiene una tarifa valida
          registrada para esta consulta.
        </p>
        <p className="mb-3">
          Siguiente paso: pide a tu aseguradora un hospital autorizado por excepcion.
        </p>
        <ExcludedList excluded={result.excluded} hospitalNames={hospitalNames} />
      </WarningNotice>
    )
  }

  const { currency } = result
  const coveragePercent = Math.round((result.coveredAmountMinor / result.referenceCostMinor) * 100)
  const location = hospitalLocations[result.recommendedHospitalId]

  return (
    <div>
      <div className="mb-8 grid gap-2 rounded-lg bg-ink p-6">
        <span className="font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[#a5f3fc]">
          Tu copago estimado
        </span>
        <strong className="num font-heading text-display font-semibold tracking-tight text-white">
          {formatMinor(result.patientCopayMinor, currency)}
        </strong>
        <span className="text-[0.9375rem] text-[#e0f7fa]">
          {specialtyName} en {hospitalNames[result.recommendedHospitalId]}
          {location ? `, ${location}` : ''}
        </span>
      </div>

      <h3 className="mb-3 text-lg">Como se calcula</h3>
      <ul className="mb-4 list-none rounded border border-line p-0">
        <li className="flex items-baseline justify-between gap-4 border-b border-line p-3 px-4">
          <span>Costo de referencia de la consulta</span>
          <span className="num whitespace-nowrap">
            {formatMinor(result.referenceCostMinor, currency)}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-4 border-b border-line p-3 px-4">
          <span>Cubre tu plan ({coveragePercent} %)</span>
          <span className="num whitespace-nowrap">
            &minus; {formatMinor(result.coveredAmountMinor, currency)}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-4 border-t-2 border-ink bg-sunken p-3 px-4 font-heading font-semibold text-strong">
          <span>Pagas tu</span>
          <span className="num whitespace-nowrap">
            {formatMinor(result.patientCopayMinor, currency)}
          </span>
        </li>
      </ul>

      <p className="mb-8 flex flex-wrap gap-x-4 gap-y-2 text-[0.8125rem] text-muted">
        <span>
          Regla aplicada <code>{result.appliedRuleId}</code>
        </span>
        <span>
          Version de reglas <code>{result.ruleVersion}</code>
        </span>
      </p>

      <h3 className="mb-3 text-lg">Hospitales de tu red</h3>
      {/* La tabla desborda en pantallas angostas. Un contenedor que scrollea
          debe ser alcanzable por teclado, o quien no usa raton no ve las
          columnas de la derecha. */}
      <div
        className="mb-4 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Comparacion de hospitales, desplazable horizontalmente"
      >
        <table className="w-full min-w-[32rem] border-collapse">
          <caption className="pb-3 text-start text-[0.9375rem] text-muted">
            Ordenados por lo que pagarias tu, de menor a mayor.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b-2 border-ink p-3 px-4 text-start font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-muted"
              >
                Hospital
              </th>
              <th
                scope="col"
                className="border-b-2 border-ink p-3 px-4 text-start font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-muted"
              >
                Costo de referencia
              </th>
              <th
                scope="col"
                className="border-b-2 border-ink p-3 px-4 text-end font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-muted"
              >
                Tu copago
              </th>
            </tr>
          </thead>
          <tbody>
            {result.alternatives.map((option) => {
              const recommended = option.hospitalId === result.recommendedHospitalId
              return (
                <tr key={option.hospitalId} className={recommended ? 'bg-accent-soft' : undefined}>
                  <th
                    scope="row"
                    className="border-b border-line p-3 px-4 text-start font-normal text-strong"
                  >
                    {hospitalNames[option.hospitalId] ?? option.hospitalId}
                    {/* Texto, no solo color: la recomendacion se lee igual sin
                        percibir el tono de fondo. */}
                    {recommended ? (
                      <span className="ms-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-[0.8125rem] font-bold text-white">
                        Mas economico
                      </span>
                    ) : null}
                  </th>
                  <td className="num border-b border-line p-3 px-4">
                    {formatMinor(option.referenceCostMinor, currency)}
                  </td>
                  <td className="num border-b border-line p-3 px-4 text-end">
                    {formatMinor(option.patientCopayMinor, currency)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ExcludedList excluded={result.excluded} hospitalNames={hospitalNames} />
    </div>
  )
}
