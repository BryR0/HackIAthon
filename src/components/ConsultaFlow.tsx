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

function stepStateFor(index: number, phase: Phase): 'done' | 'current' | 'todo' {
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
      <ol className="stepper" aria-label="Progreso de la consulta">
        {STEPS.map((step, index) => {
          const state = stepStateFor(index, phase)
          return (
            <li key={step} className="stepper__item" data-state={state}>
              <span className="stepper__dot" aria-hidden="true" />
              {step}
              {state === 'current' ? <span className="visually-hidden">(paso actual)</span> : null}
            </li>
          )
        })}
      </ol>

      {fieldError || errorMessage ? (
        <div
          className="card error-summary"
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="error-summary-title"
        >
          <h2 className="notice__title" id="error-summary-title">
            Revisa lo siguiente
          </h2>
          <ul>
            {fieldError ? (
              <li>
                <a href={`#${symptomId}`}>{fieldError}</a>
              </li>
            ) : null}
            {errorMessage ? <li>{errorMessage}</li> : null}
          </ul>
        </div>
      ) : null}

      {phase === 'emergency' ? (
        <div className="card">
          <div className="notice notice--danger" role="alert" aria-labelledby="emergencia-titulo">
            <h2 className="notice__title" id="emergencia-titulo">
              Esto puede ser una emergencia
            </h2>
            <p>
              Lo que describes menciona{' '}
              {EMERGENCY_MESSAGE[emergencyCode ?? ''] ?? 'una senal de alarma'}. No vamos a calcular
              un copago ni a compararte hospitales: eso puede esperar, tu no.
            </p>
            <p>
              <strong>Llama al ECU 911</strong> o acude ahora a emergencias del centro de salud mas
              cercano.
            </p>
            <p>
              Que no detectemos una senal tampoco descarta una emergencia. Si te sientes en peligro,
              busca atencion inmediata aunque esta herramienta no lo advierta.
            </p>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button button--secondary"
              onClick={resetForNewConsultation}
            >
              Empezar una consulta nueva
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'collecting' || phase === 'clarifying' ? (
        <form className="card" onSubmit={handleTriage} noValidate>
          <h2 className="card__title">
            {phase === 'clarifying' ? 'Necesitamos un dato mas' : 'Cuentanos que sientes'}
          </h2>

          <div className="field">
            <label className="field__label" htmlFor={patientId}>
              Paciente de demostracion
            </label>
            <p className="field__hint" id={`${patientId}-hint`}>
              Personas ficticias. No uses datos personales reales.
            </p>
            <select
              className="field__control"
              id={patientId}
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
            <div className="notice notice--info" role="status">
              <p>{clarification}</p>
            </div>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor={symptomId}>
              Describe tu sintoma
            </label>
            <p className="field__hint" id={`${symptomId}-hint`}>
              Tu texto se envia al clasificador configurado para sugerir la especialidad y no se
              guarda en ningun lado. Maximo {MAX_SYMPTOM_LENGTH} caracteres.
            </p>
            <textarea
              className="field__control"
              id={symptomId}
              ref={symptomRef}
              value={symptom}
              onChange={(event) => setSymptom(event.target.value)}
              aria-describedby={`${symptomId}-hint`}
              aria-invalid={fieldError ? 'true' : undefined}
              maxLength={MAX_SYMPTOM_LENGTH}
              disabled={busy}
              placeholder="Ejemplo: tengo una mancha en la piel que no se va hace tres semanas"
            />
            {fieldError ? <p className="field__error">{fieldError}</p> : null}
          </div>

          {phase === 'clarifying' ? (
            <div className="field">
              <label className="field__label" htmlFor={specialtySelectId}>
                O elige la especialidad tu mismo
              </label>
              <select
                className="field__control"
                id={specialtySelectId}
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

          <div className="button-row">
            <button type="submit" className="button button--primary" disabled={busy}>
              Sugerir especialidad
            </button>
            {phase === 'clarifying' && specialtyId ? (
              <button
                type="button"
                className="button button--secondary"
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
          <h2 className="card__title">Confirma la especialidad</h2>
          <div className="notice notice--info" role="status">
            <p>
              Segun lo que describiste, la especialidad sugerida es{' '}
              <strong>{specialtyLabel}</strong>. Puedes cambiarla si no corresponde.
            </p>
          </div>
          {providerNote ? <p className="provider-chip">{providerNote}</p> : null}

          <div className="field">
            <label className="field__label" htmlFor={specialtySelectId}>
              Especialidad
            </label>
            <select
              className="field__control"
              id={specialtySelectId}
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

          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              onClick={handleEstimate}
              disabled={busy}
            >
              Calcular mi copago
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={resetForNewConsultation}
            >
              Volver a empezar
            </button>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="card loading" aria-busy="true" role="status">
          <p>Aplicando las reglas de tu plan y comparando los hospitales de tu red…</p>
          <div className="loading__bar">
            <div className="loading__fill" />
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
          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              onClick={resetForNewConsultation}
            >
              Hacer otra consulta
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="card">
          <div className="notice notice--danger" role="alert" aria-labelledby="error-calculo-titulo">
            <h2 className="notice__title" id="error-calculo-titulo">
              No pudimos completar el calculo
            </h2>
            <p>{errorMessage}</p>
          </div>
          <div className="button-row">
            <button type="button" className="button button--primary" onClick={handleEstimate}>
              Reintentar
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={resetForNewConsultation}
            >
              Empezar de nuevo
            </button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <section className="card" aria-labelledby="historial-titulo">
          <h2 className="card__title" id="historial-titulo">
            Consultas de esta sesion
          </h2>
          <p className="field__hint">
            Solo se guardan la especialidad y el monto, en memoria del navegador. Tus sintomas no se
            registran y desaparecen al cerrar la pestana.
          </p>
          <ul>
            {history.map((entry) => (
              <li key={entry.key}>
                {entry.specialtyLabel}: {entry.summary}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
