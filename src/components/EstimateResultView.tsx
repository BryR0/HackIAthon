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
      className="flex gap-4 rounded-2xl border border-l-4 border-warn bg-warn-soft/70 p-5 shadow-sm"
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-warn/15 text-warn">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </div>
      <div className="[&>*:last-child]:mb-0">
        <h2 className="mb-2 font-heading text-lg font-bold text-warn">{title}</h2>
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
    <details className="mt-4 rounded-xl border border-line bg-card/60 p-3 text-[0.9375rem] text-muted shadow-2xs">
      <summary className="cursor-pointer py-1 font-semibold text-strong transition-colors hover:text-primary">
        Por que no aparecen los demas hospitales ({excluded.length})
      </summary>
      <ul className="mt-3 list-disc space-y-1 ps-6 text-sm">
        {excluded.map((item) => (
          <li key={item.hospitalId}>
            <span className="font-semibold text-strong">
              {hospitalNames[item.hospitalId] ?? item.hospitalId}
            </span>
            : {EXCLUSION_LABEL[item.reason]}
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
      {/* Hero Card del Copago Estimado */}
      <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-ink via-[#0d4f5f] to-[#08333e] p-6 sm:p-9 text-white shadow-xl">
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-accent/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -left-16 -bottom-16 size-64 rounded-full bg-primary-line/25 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[#a5f3fc]">
              <span className="size-2 rounded-full bg-[#38bdf8] animate-pulse" />
              Tu copago estimado
            </span>
            <span className="shimmer-badge inline-flex items-center gap-1.5 rounded-full bg-accent/90 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-xs">
              ✓ {coveragePercent}% cubierto por tu plan
            </span>
          </div>

          <div className="my-1 flex items-baseline gap-3">
            <strong className="num font-heading text-display font-extrabold tracking-tight text-white drop-shadow-sm">
              {formatMinor(result.patientCopayMinor, currency)}
            </strong>
          </div>

          <div className="flex items-center gap-2 text-[0.9375rem] text-[#e0f7fa]">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-[#38bdf8]"
              aria-hidden="true"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>
              {specialtyName} en{' '}
              <strong className="font-semibold text-white">
                {hospitalNames[result.recommendedHospitalId]}
              </strong>
              {location ? `, ${location}` : ''}
            </span>
          </div>
        </div>
      </div>

      <h3 className="mb-3 text-lg font-bold text-strong">Como se calcula</h3>

      {/* Visual meter de desglose */}
      <div className="mb-4 rounded-xl border border-line bg-card p-4 shadow-2xs">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-strong">
          <span className="flex items-center gap-1.5 font-heading">
            <span className="size-2 rounded-full bg-accent" />
            Cubre tu plan ({coveragePercent} %)
          </span>
          <span className="flex items-center gap-1.5 font-heading">
            <span className="size-2 rounded-full bg-primary" />
            Pagas tu ({100 - coveragePercent} %)
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-inset p-0.5">
          <div
            className="h-full rounded-l-full bg-accent transition-all duration-500"
            style={{ width: `${coveragePercent}%` }}
          />
          <div
            className="h-full rounded-r-full bg-primary transition-all duration-500"
            style={{ width: `${100 - coveragePercent}%` }}
          />
        </div>
      </div>

      <ul className="mb-4 list-none rounded-xl border border-line p-0 overflow-hidden shadow-2xs">
        <li className="flex items-baseline justify-between gap-4 border-b border-line p-3.5 px-4 bg-card">
          <span className="text-strong">Costo de referencia de la consulta</span>
          <span className="num font-semibold text-strong whitespace-nowrap">
            {formatMinor(result.referenceCostMinor, currency)}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-4 border-b border-line p-3.5 px-4 bg-card">
          <span className="text-strong">Cubre tu plan ({coveragePercent} %)</span>
          <span className="num font-semibold text-strong whitespace-nowrap">
            &minus; {formatMinor(result.coveredAmountMinor, currency)}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-4 border-t-2 border-ink bg-sunken p-4 px-4 font-heading font-bold text-strong text-lg">
          <span>Pagas tu</span>
          <span className="num font-bold text-strong whitespace-nowrap">
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

      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-lg font-bold text-strong">Hospitales de tu red</h3>
        <span className="text-xs font-semibold text-muted">Comparativa en tiempo real</span>
      </div>

      {/* Tabla comparativa de hospitales */}
      <div
        className="mb-4 overflow-x-auto rounded-xl border border-line bg-card shadow-2xs"
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
                className="border-b-2 border-ink p-3 px-4 text-start font-heading text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-muted"
              >
                Hospital
              </th>
              <th
                scope="col"
                className="border-b-2 border-ink p-3 px-4 text-start font-heading text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-muted"
              >
                Costo de referencia
              </th>
              <th
                scope="col"
                className="border-b-2 border-ink p-3 px-4 text-end font-heading text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-muted"
              >
                Tu copago
              </th>
            </tr>
          </thead>
          <tbody>
            {result.alternatives.map((option) => {
              const recommended = option.hospitalId === result.recommendedHospitalId
              return (
                <tr
                  key={option.hospitalId}
                  className={`transition-colors ${
                    recommended
                      ? 'bg-accent-soft/80 border-l-4 border-accent'
                      : 'hover:bg-inset/40'
                  }`}
                >
                  <th
                    scope="row"
                    className="border-b border-line p-3.5 px-4 text-start font-medium text-strong"
                  >
                    {hospitalNames[option.hospitalId] ?? option.hospitalId}
                    {recommended ? (
                      <span className="shimmer-badge ms-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2.5 py-0.5 text-[0.8125rem] font-bold text-white shadow-2xs">
                        <span className="size-1.5 rounded-full bg-white animate-pulse" />
                        Mas economico
                      </span>
                    ) : null}
                  </th>
                  <td className="num border-b border-line p-3.5 px-4 text-strong font-medium">
                    {formatMinor(option.referenceCostMinor, currency)}
                  </td>
                  <td className="num border-b border-line p-3.5 px-4 text-end font-bold text-strong">
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
