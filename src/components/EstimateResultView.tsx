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

function ExcludedList({
  excluded,
  hospitalNames,
}: {
  excluded: readonly { hospitalId: string; reason: HospitalExclusionReason }[]
  hospitalNames: Readonly<Record<string, string>>
}) {
  if (excluded.length === 0) return null
  return (
    <details className="excluded">
      <summary>Por que no aparecen los demas hospitales ({excluded.length})</summary>
      <ul>
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
      <div className="notice notice--warning" role="status">
        <h2 className="notice__title">No podemos calcular un valor exacto</h2>
        <p>
          Para {specialtyName}, {MISSING_LABEL[result.missing[0] ?? ''] ?? 'falta un dato'}. No
          mostramos un monto aproximado porque seria inventarlo.
        </p>
        <p>Consulta con tu aseguradora antes de agendar para confirmar la cobertura.</p>
      </div>
    )
  }

  if (result.status === 'not_covered') {
    return (
      <div className="notice notice--warning" role="status">
        <h2 className="notice__title">Tu plan no cubre esta consulta</h2>
        <p>
          La regla <code>{result.appliedRuleId}</code> de tu plan excluye {specialtyName}. Puedes
          atenderte pagando el valor particular del hospital.
        </p>
        <p>No prometemos ninguna cobertura para este servicio.</p>
      </div>
    )
  }

  if (result.status === 'no_compatible_hospitals') {
    return (
      <div className="notice notice--warning" role="status">
        <h2 className="notice__title">Ningun hospital de tu red puede atender esto hoy</h2>
        <p>
          Tu plan si cubre {specialtyName}, pero ningun hospital de tu red tiene una tarifa valida
          registrada para esta consulta.
        </p>
        <p>Siguiente paso: pide a tu aseguradora un hospital autorizado por excepcion.</p>
        <ExcludedList excluded={result.excluded} hospitalNames={hospitalNames} />
      </div>
    )
  }

  const { currency } = result
  const coveragePercent = Math.round((result.coveredAmountMinor / result.referenceCostMinor) * 100)

  return (
    <div>
      <div className="copay">
        <span className="copay__label">Tu copago estimado</span>
        <strong className="copay__value">{formatMinor(result.patientCopayMinor, currency)}</strong>
        <span className="copay__meta">
          {specialtyName} en {hospitalNames[result.recommendedHospitalId]}
          {hospitalLocations[result.recommendedHospitalId]
            ? `, ${hospitalLocations[result.recommendedHospitalId]}`
            : ''}
        </span>
      </div>

      <h3>Como se calcula</h3>
      <ul className="breakdown">
        <li className="breakdown__row">
          <span>Costo de referencia de la consulta</span>
          <span className="breakdown__value">
            {formatMinor(result.referenceCostMinor, currency)}
          </span>
        </li>
        <li className="breakdown__row">
          <span>Cubre tu plan ({coveragePercent} %)</span>
          <span className="breakdown__value">
            &minus; {formatMinor(result.coveredAmountMinor, currency)}
          </span>
        </li>
        <li className="breakdown__row breakdown__row--total">
          <span>Pagas tu</span>
          <span className="breakdown__value">{formatMinor(result.patientCopayMinor, currency)}</span>
        </li>
      </ul>
      <p className="field__hint">
        Regla aplicada <code>{result.appliedRuleId}</code> &middot; version de reglas{' '}
        <code>{result.ruleVersion}</code>
      </p>

      <h3>Hospitales de tu red</h3>
      {/* La tabla desborda en pantallas angostas. Un contenedor que scrollea
          debe ser alcanzable por teclado, o quien no usa raton no ve las
          columnas de la derecha. */}
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Comparacion de hospitales, desplazable horizontalmente"
      >
        <table className="hospitals">
          <caption>Ordenados por lo que pagarias tu, de menor a mayor.</caption>
          <thead>
            <tr>
              <th scope="col">Hospital</th>
              <th scope="col">Costo de referencia</th>
              <th scope="col">Tu copago</th>
            </tr>
          </thead>
          <tbody>
            {result.alternatives.map((option) => {
              const recommended = option.hospitalId === result.recommendedHospitalId
              return (
                <tr key={option.hospitalId} data-recommended={String(recommended)}>
                  <th scope="row">
                    {hospitalNames[option.hospitalId] ?? option.hospitalId}
                    {recommended ? <span className="tag-recommended">Mas economico</span> : null}
                  </th>
                  <td>{formatMinor(option.referenceCostMinor, currency)}</td>
                  <td>{formatMinor(option.patientCopayMinor, currency)}</td>
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
