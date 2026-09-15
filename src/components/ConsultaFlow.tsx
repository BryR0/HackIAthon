'use client'

/**
 * Flujo completo de la consulta.
 *
 * Recorridos que implementa (Blueprint seccion 4): feliz, sintoma ambiguo,
 * emergencia, no cubierto, plan o tarifa ausente, fallo del modelo y sin
 * hospitales compatibles.
 *
 * Privacidad: el texto del sintoma vive solo en el estado de este componente
 * durante la consulta. No entra en localStorage, ni en el historial, ni en el
 * resumen. Al empezar una consulta nueva se borra.
 */

import { useId, useRef, useState } from 'react'

import { EstimateResultView } from './EstimateResultView'
import { MAX_SYMPTOM_LENGTH, MIN_SYMPTOM_LENGTH } from '../agent/schema'
import { formatMinor } from '../domain/money'
import type { EstimateResult } from '../domain/types'

export interface FlowOption {
  readonly id: string
  readonly label: string
}

export interface ConsultaFlowProps {
  readonly patients: readonly { id: string; displayName: string; planName: string }[]
  readonly specialties: readonly FlowOption[]
  readonly hospitalNames: Readonly<Record<string, string>>
  readonly hospitalLocations: Readonly<Record<string, string>>
}

type Phase =
  | 'collecting'
  | 'clarifying'
  | 'confirming'
  | 'calculating'
  | 'result'
  | 'emergency'
  | 'error'

/** Solo ids y montos. Nunca el texto del sintoma. */
interface HistoryEntry {
  readonly key: string
  readonly specialtyLabel: string
  readonly summary: string
}

const EMERGENCY_MESSAGE: Readonly<Record<string, string>> = {
  EMERGENCY_CHEST_PAIN: 'dolor en el pecho o falta de aire',
  EMERGENCY_BREATHING: 'dificultad para respirar',
  EMERGENCY_STROKE_SIGNS: 'posibles signos de un evento cerebrovascular',
  EMERGENCY_SEVERE_BLEEDING: 'un sangrado que no se detiene',
  EMERGENCY_CONSCIOUSNESS: 'perdida de conciencia o convulsiones',
  EMERGENCY_SUICIDAL_IDEATION: 'pensamientos de hacerte dano',
  EMERGENCY_SEVERE_HEAD: 'un dolor de cabeza subito e intenso',
}

const STEPS = ['Datos', 'Especialidad', 'Cobertura', 'Resultado'] as const

const PHASE_STEP: Readonly<Record<Phase, number>> = {
  collecting: 0,
  clarifying: 1,
  confirming: 1,
  calculating: 2,
  result: 3,
  emergency: 0,
  error: 0,
}

/** Barra superior + color: el estado no se comunica solo con el tono. */
const STEP_STYLE = {
  done: 'text-accent before:bg-accent',
  current: 'text-primary before:bg-primary',
  todo: 'text-muted before:bg-transparent',
} as const

function stepStateFor(index: number, phase: Phase): keyof typeof STEP_STYLE {
  const active = PHASE_STEP[phase]
  if (index < active) return 'done'
  if (index === active) return 'current'
  return 'todo'
}

export function ConsultaFlow({
  patients,
  specialties,
  hospitalNames,
  hospitalLocations,
}: ConsultaFlowProps) {
  const symptomId = useId()
  const patientId = useId()
  const specialtySelectId = useId()
  const errorSummaryRef = useRef<HTMLDivElement>(null)
  const symptomRef = useRef<HTMLTextAreaElement>(null)

  const [phase, setPhase] = useState<Phase>('collecting')
  const [patient, setPatient] = useState(patients[0]?.id ?? '')
  const [symptom, setSymptom] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [clarification, setClarification] = useState<string | null>(null)
  const [specialtyId, setSpecialtyId] = useState('')
  const [providerNote, setProviderNote] = useState<string | null>(null)
  const [emergencyCode, setEmergencyCode] = useState<string | null>(null)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [history, setHistory] = useState<readonly HistoryEntry[]>([])

  const specialtyLabel =
    specialties.find((s) => s.id === specialtyId)?.label ?? 'la especialidad seleccionada'

  function focusErrorSummary() {
    // El foco va al resumen, no al campo: el lector de pantalla anuncia primero
    // que hubo un error, y desde ahi se navega a cada campo.
    window.requestAnimationFrame(() => errorSummaryRef.current?.focus())
  }

  function resetForNewConsultation() {
    setSymptom('')
    setFieldError(null)
    setClarification(null)
    setSpecialtyId('')
    setProviderNote(null)
    setEmergencyCode(null)
    setResult(null)
    setErrorMessage(null)
    setPhase('collecting')
    window.requestAnimationFrame(() => symptomRef.current?.focus())
  }

  async function handleTriage(event: React.FormEvent) {
    event.preventDefault()
    const text = symptom.trim()

    if (text.length < MIN_SYMPTOM_LENGTH) {
      setFieldError('Describe tu sintoma con al menos unas palabras.')
      focusErrorSummary()
      return
    }
    if (text.length > MAX_SYMPTOM_LENGTH) {
      setFieldError(`El texto no puede superar ${MAX_SYMPTOM_LENGTH} caracteres.`)
      focusErrorSummary()
      return
    }

    setFieldError(null)
    setErrorMessage(null)
    setPhase('calculating')

    try {
      const response = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const payload = await response.json()

      if (payload.status === 'emergency_warning') {
        setEmergencyCode(payload.messageCode)
        setPhase('emergency')
        return
      }
      if (payload.status === 'needs_clarification') {
        setClarification(payload.question)
        setPhase('clarifying')
        return
      }
      if (payload.status === 'classified') {
        setSpecialtyId(payload.specialtyId)
        setProviderNote(
          payload.meta?.degraded || payload.meta?.provider === 'local'
            ? 'Sugerencia calculada en modo local determinista.'
            : `Sugerencia del proveedor ${payload.meta?.provider}.`,
        )
        setPhase('confirming')
        return
      }

      // Cualquier otra respuesta: no se pierde lo escrito y se ofrece manual.
      setClarification(null)
      setErrorMessage('No pudimos interpretar tu sintoma. Elige la especialidad tu mismo.')
      setPhase('clarifying')
    } catch {
      setErrorMessage(
        'No pudimos conectar con el clasificador. Tu texto sigue aqui: elige la especialidad manualmente.',
      )
      setPhase('clarifying')
    }
  }

  async function handleEstimate() {
    if (!specialtyId) {
      setFieldError('Elige una especialidad para continuar.')
      focusErrorSummary()
      return
    }

    setFieldError(null)
    setPhase('calculating')

    try {
      const response = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patientDemoId: patient, specialtyId }),
      })
      const payload: EstimateResult = await response.json()

      if (!response.ok) {
        setErrorMessage('No pudimos calcular la estimacion. Intenta de nuevo.')
        setPhase('error')
        return
      }

      setResult(payload)
      setPhase('result')

      const label = specialties.find((s) => s.id === specialtyId)?.label ?? specialtyId
      let summary: string
      if (payload.status === 'estimated') {
        const hospital =
          hospitalNames[payload.recommendedHospitalId] ?? payload.recommendedHospitalId
        summary = `${formatMinor(payload.patientCopayMinor, payload.currency)} en ${hospital}`
      } else if (payload.status === 'not_covered') {
        summary = 'no cubierto por el plan'
      } else if (payload.status === 'needs_information') {
        summary = 'faltan datos para calcular'
      } else {
        summary = 'sin hospitales compatibles'
      }

      setHistory((current) => [
        { key: `${Date.now()}`, specialtyLabel: label, summary },
        ...current,
      ])
    } catch {
      setErrorMessage('Se perdio la conexion durante el calculo. Intenta de nuevo.')
      setPhase('error')
    }
  }

  const busy = phase === 'calculating'

  return (
    <div>
      <ol
        aria-label="Progreso de la consulta"
        className="mb-8 grid list-none grid-flow-col auto-cols-fr border-t-2 border-line p-0 max-sm:grid-flow-row max-sm:auto-cols-auto max-sm:border-t-0"
      >
        {STEPS.map((step, index) => {
          const state = stepStateFor(index, phase)
          return (
            <li
              key={step}
              className={`relative pe-2 pt-3 text-[0.8125rem] font-semibold before:absolute before:inset-x-0 before:-top-0.5 before:end-2 before:h-0.5 before:content-[''] max-sm:border-s-2 max-sm:border-line max-sm:py-2 max-sm:pe-0 max-sm:ps-3 max-sm:before:inset-y-0 max-sm:before:inset-x-auto max-sm:before:-start-0.5 max-sm:before:h-full max-sm:before:w-0.5 ${STEP_STYLE[state]}`}
            >
              {/* Sin opacidad: atenuar este texto lo dejaba en 3.48:1. El
                  color heredado de cada estado ya cumple AA por si solo. */}
              <span className="block font-heading text-[0.8125rem]">Paso {index + 1}</span>
              {step}
              {state === 'current' ? (
                <span className="sr-only"> (paso actual)</span>
              ) : null}
            </li>
          )
        })}
      </ol>

      {fieldError || errorMessage ? (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="error-summary-title"
          className="card border-2 border-danger"
        >
          <h2 id="error-summary-title" className="mb-2 font-heading text-lg text-danger">
            Revisa lo siguiente
          </h2>
          <ul className="mt-2 list-disc ps-6">
            {fieldError ? (
              <li>
                <a href={`#${symptomId}`} className="font-semibold text-danger underline">
                  {fieldError}
                </a>
              </li>
            ) : null}
            {errorMessage ? <li>{errorMessage}</li> : null}
          </ul>
        </div>
      ) : null}

      {phase === 'emergency' ? (
        <div className="card">
          <div
            role="alert"
            aria-labelledby="emergencia-titulo"
            className="flex gap-3 rounded border border-l-4 border-danger bg-danger-soft p-4"
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
              className="mt-0.5 shrink-0 text-danger"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
            <div>
              <h2 id="emergencia-titulo" className="mb-2 font-heading text-lg text-danger">
                Esto puede ser una emergencia
              </h2>
              <p className="mb-3">
                Lo que describes menciona{' '}
                {EMERGENCY_MESSAGE[emergencyCode ?? ''] ?? 'una senal de alarma'}. No vamos a
                calcular un copago ni a compararte hospitales: eso puede esperar, tu no.
              </p>
              <p className="mb-3">
                <strong>Llama al ECU 911</strong> o acude ahora a emergencias del centro de salud
                mas cercano.
              </p>
              <p className="mb-0">
                Que no detectemos una senal tampoco descarta una emergencia. Si te sientes en
                peligro, busca atencion inmediata aunque esta herramienta no lo advierta.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" onClick={resetForNewConsultation}>
              Empezar una consulta nueva
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'collecting' || phase === 'clarifying' ? (
        <form className="card" onSubmit={handleTriage} noValidate>
          <h2 className="mb-6 text-xl">
            {phase === 'clarifying' ? 'Necesitamos un dato mas' : 'Cuentanos que sientes'}
          </h2>

          <div className="mb-6 grid gap-2">
            <label className="font-heading font-semibold text-strong" htmlFor={patientId}>
              Paciente de demostracion
            </label>
            <p id={`${patientId}-hint`} className="m-0 text-[0.9375rem] text-muted">
              Personas ficticias. No uses datos personales reales.
            </p>
            <select
              id={patientId}
              className="field-control"
              aria-describedby={`${patientId}-hint`}
              value={patient}
              onChange={(event) => setPatient(event.target.value)}
              disabled={busy}
            >
              {patients.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName} — {option.planName}
                </option>
              ))}
            </select>
          </div>

          {clarification ? (
            <div
              role="status"
              className="mb-4 flex gap-3 rounded border border-l-4 border-info bg-info-soft p-4"
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
                className="mt-0.5 shrink-0 text-info"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <p className="m-0">{clarification}</p>
            </div>
          ) : null}

          <div className="mb-6 grid gap-2">
            <label className="font-heading font-semibold text-strong" htmlFor={symptomId}>
              Describe tu sintoma
            </label>
            <p id={`${symptomId}-hint`} className="m-0 text-[0.9375rem] text-muted">
              Tu texto se envia al clasificador configurado para sugerir la especialidad y no se
              guarda en ningun lado. Maximo {MAX_SYMPTOM_LENGTH} caracteres.
            </p>
            <textarea
              id={symptomId}
              ref={symptomRef}
              className="field-control min-h-[7.5rem] resize-y"
              value={symptom}
              onChange={(event) => setSymptom(event.target.value)}
              aria-describedby={`${symptomId}-hint`}
              aria-invalid={fieldError ? 'true' : undefined}
              maxLength={MAX_SYMPTOM_LENGTH}
              disabled={busy}
              placeholder="Ejemplo: tengo una mancha en la piel que no se va hace tres semanas"
            />
            {fieldError ? (
              <p className="m-0 text-[0.9375rem] font-semibold text-danger">{fieldError}</p>
            ) : null}
          </div>

          {phase === 'clarifying' ? (
            <div className="mb-6 grid gap-2">
              <label className="font-heading font-semibold text-strong" htmlFor={specialtySelectId}>
                O elige la especialidad tu mismo
              </label>
              <select
                id={specialtySelectId}
                className="field-control"
                value={specialtyId}
                onChange={(event) => setSpecialtyId(event.target.value)}
                disabled={busy}
              >
                <option value="">Selecciona una especialidad</option>
                {specialties.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              Sugerir especialidad
            </button>
            {phase === 'clarifying' && specialtyId ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleEstimate}
                disabled={busy}
              >
                Continuar con esta especialidad
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {phase === 'confirming' ? (
        <div className="card">
          <h2 className="mb-6 text-xl">Confirma la especialidad</h2>

          <div
            role="status"
            className="mb-4 flex gap-3 rounded border border-l-4 border-info bg-info-soft p-4"
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
              className="mt-0.5 shrink-0 text-info"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <p className="m-0">
              Segun lo que describiste, la especialidad sugerida es{' '}
              <strong>{specialtyLabel}</strong>. Puedes cambiarla si no corresponde.
            </p>
          </div>

          {providerNote ? (
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-inset px-3 py-2 text-[0.8125rem] text-muted">
              {providerNote}
            </p>
          ) : null}

          <div className="mb-6 grid gap-2">
            <label className="font-heading font-semibold text-strong" htmlFor={specialtySelectId}>
              Especialidad
            </label>
            <select
              id={specialtySelectId}
              className="field-control"
              value={specialtyId}
              onChange={(event) => setSpecialtyId(event.target.value)}
              disabled={busy}
            >
              {specialties.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={handleEstimate} disabled={busy}>
              Calcular mi copago
            </button>
            <button type="button" className="btn-secondary" onClick={resetForNewConsultation}>
              Volver a empezar
            </button>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="card grid gap-4" aria-busy="true" role="status">
          <p className="m-0">Aplicando las reglas de tu plan y comparando los hospitales…</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-inset">
            <div className="loading-fill h-full w-[35%] rounded-full bg-primary-line" />
          </div>
        </div>
      ) : null}

      {phase === 'result' && result ? (
        <div className="card">
          <EstimateResultView
            result={result}
            hospitalNames={hospitalNames}
            hospitalLocations={hospitalLocations}
            specialtyName={specialtyLabel}
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={resetForNewConsultation}>
              Hacer otra consulta
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="card">
          <div
            role="alert"
            aria-labelledby="error-calculo-titulo"
            className="flex gap-3 rounded border border-l-4 border-danger bg-danger-soft p-4"
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
              className="mt-0.5 shrink-0 text-danger"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
            <div>
              <h2 id="error-calculo-titulo" className="mb-2 font-heading text-lg text-danger">
                No pudimos completar el calculo
              </h2>
              <p className="m-0">{errorMessage}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={handleEstimate}>
              Reintentar
            </button>
            <button type="button" className="btn-secondary" onClick={resetForNewConsultation}>
              Empezar de nuevo
            </button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <section className="card" aria-labelledby="historial-titulo">
          <h2 id="historial-titulo" className="mb-4 text-xl">
            Consultas de esta sesion
          </h2>
          <p className="mb-4 text-[0.9375rem] text-muted">
            Solo se guardan la especialidad y el monto, en memoria del navegador. Tus sintomas no se
            registran y desaparecen al cerrar la pestana.
          </p>
          <ul className="m-0 list-none p-0">
            {history.map((entry) => (
              <li
                key={entry.key}
                className="flex justify-between gap-4 border-b border-line py-3 last:border-b-0"
              >
                <span>{entry.specialtyLabel}</span>
                <span className="num font-semibold text-strong">{entry.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
