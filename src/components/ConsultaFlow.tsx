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

import { useId, useRef, useState, useEffect } from 'react'

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
  readonly isModalOpen?: boolean
  readonly onModalOpenChange?: (open: boolean) => void
  readonly onPhaseChange?: (phase: Phase) => void
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

const QUICK_SYMPTOMS = [
  {
    label: 'Mancha en la piel',
    text: 'tengo una mancha en la piel que no se va hace tres semanas',
    icon: '🔍',
    category: 'Dermatología',
  },
  {
    label: 'Dolor de rodilla',
    text: 'me duele la rodilla al subir escaleras',
    icon: '🦴',
    category: 'Traumatología',
  },
  {
    label: 'Visión borrosa',
    text: 'veo borroso de lejos y me arden los ojos',
    icon: '👁️',
    category: 'Oftalmología',
  },
  {
    label: 'Alarma de emergencia',
    text: 'me duele fuerte el pecho y me falta el aire',
    icon: '🚨',
    category: 'Guardrail 911',
  },
] as const

const PHASE_STEP: Readonly<Record<Phase, number>> = {
  collecting: 0,
  clarifying: 1,
  confirming: 1,
  calculating: 2,
  result: 3,
  emergency: 0,
  error: 0,
}

type StepState = 'done' | 'current' | 'todo'

function stepStateFor(index: number, phase: Phase): StepState {
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
  isModalOpen: isModalOpenProp,
  onModalOpenChange: onModalOpenChangeProp,
  onPhaseChange,
}: ConsultaFlowProps) {
  const symptomId = useId()
  const patientId = useId()
  const specialtySelectId = useId()
  const errorSummaryRef = useRef<HTMLDivElement>(null)
  const symptomRef = useRef<HTMLTextAreaElement>(null)

  const [phase, setPhase] = useState<Phase>('collecting')
  const [internalModalOpen, setInternalModalOpen] = useState(false)
  const isModalOpen = isModalOpenProp ?? internalModalOpen
  const setModalOpen = onModalOpenChangeProp ?? setInternalModalOpen

  // Notificar al componente padre de cambios de fase para ocultar/mostrar el hero
  useEffect(() => {
    onPhaseChange?.(phase)
  }, [phase, onPhaseChange])

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

  // Si se abre el modal y venimos de un resultado previo, reiniciar formulario
  useEffect(() => {
    if (isModalOpen && (phase === 'result' || phase === 'emergency')) {
      setSymptom('')
      setFieldError(null)
      setClarification(null)
      setSpecialtyId('')
      setProviderNote(null)
      setEmergencyCode(null)
      setResult(null)
      setErrorMessage(null)
      setPhase('collecting')
    }
  }, [isModalOpen, phase])

  function focusErrorSummary() {
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
    setModalOpen(true)
    window.requestAnimationFrame(() => symptomRef.current?.focus())
  }

  function resetToHome() {
    setSymptom('')
    setFieldError(null)
    setClarification(null)
    setSpecialtyId('')
    setProviderNote(null)
    setEmergencyCode(null)
    setResult(null)
    setErrorMessage(null)
    setPhase('collecting')
    setModalOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
        setModalOpen(false)
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
      setModalOpen(false)

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
      {/* Modal para solicitar información: Steps + Formulario */}
      {isModalOpen && (phase === 'collecting' || phase === 'clarifying' || phase === 'confirming' || busy) ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-consulta-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/75 backdrop-blur-sm overflow-y-auto animate-scale-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false)
          }}
        >
          <div className="relative my-auto w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl">
            {/* Cabecera del Modal */}
            <div className="flex items-center justify-between border-b border-line px-5 sm:px-7 py-4 bg-sunken/40 shrink-0">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-ink text-white text-sm font-bold shadow-2xs">
                  ⚡
                </span>
                <div>
                  <h2 id="modal-consulta-title" className="m-0 text-base sm:text-lg font-bold text-strong leading-tight">
                    Estimador de Copago y Cobertura
                  </h2>
                  <span className="text-xs text-muted">
                    Triage clínico asistido por IA &middot; Reglas deterministas
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="grid size-9 place-items-center rounded-full border border-line bg-card text-muted transition-colors hover:bg-inset hover:text-strong"
                aria-label="Cerrar consulta"
              >
                ✕
              </button>
            </div>

            {/* Contenido con Scroll Interno Suave con id="consulta-flujo" */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-7" id="consulta-flujo">
              {/* Stepper */}
              <ol
                aria-label="Progreso de la consulta"
                className="mb-6 grid list-none grid-flow-col auto-cols-fr gap-2 rounded-2xl border border-line/80 bg-card p-2.5 shadow-2xs max-sm:grid-flow-row max-sm:auto-cols-auto"
              >
                {STEPS.map((step, index) => {
                  const state = stepStateFor(index, phase)
                  return (
                    <li
                      key={step}
                      className={`relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.8125rem] font-semibold transition-all duration-200 ${
                        state === 'current'
                          ? 'bg-primary-soft/60 text-primary shadow-2xs'
                          : state === 'done'
                            ? 'text-accent hover:bg-accent-soft/30'
                            : 'text-muted'
                      }`}
                    >
                      <span
                        className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-all ${
                          state === 'done'
                            ? 'bg-accent text-white shadow-2xs'
                            : state === 'current'
                              ? 'bg-primary text-white ring-4 ring-primary/20 shadow-2xs animate-pulse-glow'
                              : 'border border-line bg-inset text-muted'
                        }`}
                        aria-hidden="true"
                      >
                        {state === 'done' ? '✓' : index + 1}
                      </span>
                      <div>
                        <span className="block font-heading text-[0.6875rem] uppercase tracking-wider text-muted">
                          Paso {index + 1}
                        </span>
                        <span className="font-semibold text-sm leading-tight">{step}</span>
                      </div>
                      {state === 'current' ? (
                        <span className="sr-only"> (paso actual)</span>
                      ) : null}
                    </li>
                  )
                })}
              </ol>

              {/* Resumen de errores */}
              {fieldError || errorMessage ? (
                <div
                  ref={errorSummaryRef}
                  tabIndex={-1}
                  role="alert"
                  aria-labelledby="error-summary-title"
                  className="card mb-6 animate-fade-in-up border-2 border-danger shadow-md"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-danger text-white text-xs font-bold">!</span>
                    <h2 id="error-summary-title" className="font-heading text-lg font-bold text-danger">
                      Revisa lo siguiente
                    </h2>
                  </div>
                  <ul className="mt-3 list-disc ps-6">
                    {fieldError ? (
                      <li>
                        <a href={`#${symptomId}`} className="font-semibold text-danger underline hover:text-danger/80">
                          {fieldError}
                        </a>
                      </li>
                    ) : null}
                    {errorMessage ? <li className="text-body">{errorMessage}</li> : null}
                  </ul>
                </div>
              ) : null}

              {/* Formulario collecting o clarifying */}
              {phase === 'collecting' || phase === 'clarifying' ? (
                <form className="card animate-fade-in-up border border-line/80 shadow-sm" onSubmit={handleTriage} noValidate>
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-4">
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-primary">
                        {phase === 'clarifying' ? 'Aclaración de síntoma' : 'Paso 1 · Consulta Inteligente'}
                      </span>
                      <h2 className="m-0 text-xl font-bold text-strong">
                        {phase === 'clarifying' ? 'Necesitamos un dato mas' : 'Cuentanos que sientes'}
                      </h2>
                    </div>
                    <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                      Sin costo &middot; Privado
                    </span>
                  </div>

                  <div className="mb-6 grid gap-2">
                    <label className="font-heading font-semibold text-strong" htmlFor={patientId}>
                      Paciente de demostracion
                    </label>
                    <p id={`${patientId}-hint`} className="m-0 text-[0.9375rem] text-muted">
                      Personas ficticias. No uses datos personales reales.
                    </p>
                    <select
                      id={patientId}
                      className="field-control cursor-pointer"
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
                      className="mb-5 flex gap-3.5 rounded-xl border border-l-4 border-info bg-info-soft/70 p-4"
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
                      <p className="m-0 text-body font-medium">{clarification}</p>
                    </div>
                  ) : null}

                  {phase === 'collecting' ? (
                    <div className="mb-5 rounded-xl border border-primary/20 bg-primary-soft/25 p-4 transition-all">
                      <div className="mb-2.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-heading text-xs font-semibold uppercase tracking-wider text-primary">
                          <span>💡</span> Pruebas rápidas con 1 clic:
                        </span>
                        <span className="text-[0.6875rem] text-muted">Autocompleta para probar</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_SYMPTOMS.map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => {
                              setSymptom(item.text)
                              setFieldError(null)
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line/80 bg-card px-3 py-1.5 text-xs font-medium text-body shadow-2xs transition-all duration-150 hover:border-primary hover:bg-primary-soft/60 hover:text-primary hover:-translate-y-0.5 active:translate-y-0"
                          >
                            <span aria-hidden="true">{item.icon}</span>
                            <span>{item.label}</span>
                            <span className="rounded bg-inset px-1.5 py-0.5 text-[0.6875rem] font-bold text-strong">
                              {item.category}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mb-6 grid gap-2">
                    <div className="flex items-baseline justify-between">
                      <label className="font-heading font-semibold text-strong" htmlFor={symptomId}>
                        Describe tu sintoma
                      </label>
                      <span className="num text-xs font-medium text-muted">
                        {symptom.length} / {MAX_SYMPTOM_LENGTH}
                      </span>
                    </div>
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
                    <div className="mb-6 grid gap-2 rounded-xl border border-line bg-inset/50 p-4">
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

              {/* Paso 2: Confirmación */}
              {phase === 'confirming' ? (
                <div className="card animate-fade-in-up border border-line/80 shadow-sm">
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-4">
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-primary">
                        Paso 2 · Verificación Clínica
                      </span>
                      <h2 className="m-0 text-xl font-bold text-strong">Confirma la especialidad</h2>
                    </div>
                    <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                      ✓ Triage completado
                    </span>
                  </div>

                  <div
                    role="status"
                    className="mb-4 flex gap-3.5 rounded-xl border border-l-4 border-info bg-info-soft/70 p-4"
                  >
                    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-info text-white shadow-2xs">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <p className="m-0 self-center text-body leading-relaxed">
                      Segun lo que describiste, la especialidad sugerida es{' '}
                      <strong className="text-strong text-lg font-heading underline decoration-primary decoration-2 underline-offset-2">
                        {specialtyLabel}
                      </strong>. Puedes cambiarla si no corresponde.
                    </p>
                  </div>

                  {providerNote ? (
                    <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-inset px-3 py-1.5 text-[0.8125rem] font-medium text-muted">
                      <span className="size-2 rounded-full bg-accent animate-pulse" />
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
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>
                      </svg>
                      Calcular mi copago
                    </button>
                    <button type="button" className="btn-secondary" onClick={resetForNewConsultation}>
                      Volver a empezar
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Loader al calcular */}
              {busy ? (
                <div className="card animate-fade-in-up border border-primary/30 bg-gradient-to-b from-primary-soft/30 to-card p-6 shadow-md" aria-busy="true" role="status">
                  <div className="flex items-center gap-3">
                    <span className="relative flex size-3.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex size-3.5 rounded-full bg-primary"></span>
                    </span>
                    <p className="m-0 font-heading font-semibold text-strong">
                      Aplicando las reglas de tu plan y comparando los hospitales…
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-inset">
                    <div className="loading-fill h-full w-[35%] rounded-full bg-primary-line" />
                  </div>
                  <div className="grid gap-2 border-t border-line/60 pt-4 text-xs font-medium text-muted">
                    <div className="flex items-center gap-2 text-primary font-semibold">
                      <span className="size-2 rounded-full bg-primary animate-pulse" />
                      1. Analizando sintomatología y sugerencia médica
                    </div>
                    <div className="flex items-center gap-2 text-body">
                      <span className="size-2 rounded-full bg-line-strong" />
                      2. Evaluando reglas de cobertura y deducibles del plan
                    </div>
                    <div className="flex items-center gap-2 text-muted">
                      <span className="size-2 rounded-full bg-line" />
                      3. Optimizando centros médicos por menor copago
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* RESULTADOS EN PANTALLA COMPLETA / PANTALLA GRANDE */}
      {phase === 'result' && result ? (
        <section
          aria-labelledby="resultado-titulo"
          className="mt-6 mb-10 card animate-fade-in-up border border-line/80 shadow-md"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent text-lg font-bold shadow-2xs">
                ✓
              </span>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-accent">
                  Cálculo completado exitosamente
                </span>
                <h1 id="resultado-titulo" className="m-0 text-xl sm:text-2xl font-bold text-strong leading-tight">
                  Resultado de tu consulta
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={resetToHome}
                className="btn-secondary text-xs sm:text-sm py-2 px-3 sm:px-4"
              >
                ← Volver al inicio
              </button>
              <button
                type="button"
                onClick={resetForNewConsultation}
                className="btn-primary shadow-xs hover:shadow-md text-xs sm:text-sm py-2 px-3 sm:px-4"
              >
                ⚡ Hacer otra consulta
              </button>
            </div>
          </div>

          <EstimateResultView
            result={result}
            hospitalNames={hospitalNames}
            hospitalLocations={hospitalLocations}
            specialtyName={specialtyLabel}
          />

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn-primary"
                onClick={resetForNewConsultation}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
                </svg>
                Hacer otra consulta
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={resetToHome}
              >
                ← Volver al inicio
              </button>
            </div>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              ↑ Subir al inicio
            </button>
          </div>
        </section>
      ) : null}

      {/* ALERTA DE EMERGENCIA 911 EN PANTALLA COMPLETA */}
      {phase === 'emergency' ? (
        <section aria-labelledby="emergencia-titulo" className="mt-6 mb-10 card animate-fade-in-up border-2 border-danger/80 bg-card p-6 sm:p-8 shadow-lg">
          <div
            role="alert"
            aria-labelledby="emergencia-titulo"
            className="flex gap-4 rounded-xl border border-l-4 border-danger bg-danger-soft/70 p-5 sm:p-6"
          >
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-danger text-white shadow-sm animate-pulse">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
            </div>
            <div>
              <h1 id="emergencia-titulo" className="mb-2 font-heading text-xl sm:text-2xl font-bold text-danger leading-tight">
                Esto puede ser una emergencia
              </h1>
              <p className="mb-3 text-base leading-relaxed text-strong">
                Lo que describes menciona{' '}
                <strong className="text-danger underline decoration-danger/40">
                  {EMERGENCY_MESSAGE[emergencyCode ?? ''] ?? 'una senal de alarma'}
                </strong>. No vamos a calcular un copago ni a compararte hospitales: eso puede esperar, tu no.
              </p>
              <div className="mb-4 rounded-xl border border-danger/30 bg-card p-4 shadow-2xs">
                <p className="m-0 text-base font-semibold text-danger">
                  Llama al ECU 911 o acude ahora a emergencias del centro de salud mas cercano.
                </p>
              </div>
              <p className="mb-0 text-sm text-muted">
                Que no detectemos una senal tampoco descarta una emergencia. Si te sientes en
                peligro, busca atencion inmediata aunque esta herramienta no lo advierta.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="tel:911"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-6 py-3.5 font-heading font-bold text-white shadow-md hover:bg-danger/90 hover:shadow-lg transition-all max-sm:w-full"
            >
              📞 Llamar al ECU 911 ahora
            </a>
            <button type="button" className="btn-secondary" onClick={resetForNewConsultation}>
              ⚡ Empezar una consulta nueva
            </button>
            <button type="button" className="btn-secondary" onClick={resetToHome}>
              ← Volver al inicio
            </button>
          </div>
        </section>
      ) : null}

      {/* ERROR EN PANTALLA COMPLETA */}
      {phase === 'error' ? (
        <section aria-labelledby="error-calculo-titulo" className="mt-6 mb-10 card animate-fade-in-up border-2 border-danger/80 shadow-md">
          <div
            role="alert"
            aria-labelledby="error-calculo-titulo"
            className="flex gap-4 rounded-xl border border-l-4 border-danger bg-danger-soft/70 p-5"
          >
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-danger text-white">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
            </div>
            <div>
              <h2 id="error-calculo-titulo" className="mb-1 font-heading text-lg font-bold text-danger">
                No pudimos completar el calculo
              </h2>
              <p className="m-0 text-body">{errorMessage}</p>
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
        </section>
      ) : null}

      {/* HISTORIAL */}
      {history.length > 0 ? (
        <section className="card animate-fade-in-up mt-8 border border-line/80 shadow-xs" aria-labelledby="historial-titulo">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="historial-titulo" className="m-0 text-lg font-bold text-strong">
              Consultas de esta sesion
            </h2>
            <span className="rounded-full bg-inset px-2.5 py-0.5 text-xs font-semibold text-muted">
              {history.length} {history.length === 1 ? 'consulta' : 'consultas'}
            </span>
          </div>
          <p className="mb-4 text-[0.9375rem] text-muted">
            Solo se guardan la especialidad y el monto, en memoria del navegador. Tus sintomas no se
            registran y desaparecen al cerrar la pestana.
          </p>
          <ul className="m-0 list-none divide-y divide-line/60 p-0">
            {history.map((entry) => (
              <li
                key={entry.key}
                className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-inset/40 px-2 rounded-lg"
              >
                <span className="flex items-center gap-2 font-medium text-strong">
                  <span className="size-2 rounded-full bg-primary" />
                  {entry.specialtyLabel}
                </span>
                <span className="num rounded-md bg-sunken px-2.5 py-1 text-sm font-bold text-strong">
                  {entry.summary}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
