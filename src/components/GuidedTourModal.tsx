'use client'

import { useState, useEffect } from 'react'
import {
  HeroDoctorBotIllustration,
  SavingsPiggyIllustration,
  SymptomBotIllustration,
} from './Illustrations'

interface Props {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onStartConsultation: () => void
}

const TOUR_STEPS = [
  {
    title: '1. Describe lo que sientes',
    badge: 'Triage Inteligente con IA',
    description:
      'Escribe tu malestar con tus propias palabras (o elige un ejemplo de 1 clic). Nuestra IA médica analiza tus síntomas y sugiere la especialidad adecuada al instante sin almacenar datos personales.',
    illustration: SymptomBotIllustration,
    tip: '💡 100% privado: tu texto solo vive en memoria de tu navegador durante la consulta.',
  },
  {
    title: '2. Verificación de Reglas y Póliza',
    badge: 'Motor Clínico Determinista',
    description:
      'Un motor de reglas auditable cruza tu plan de seguro (deducibles, copagos y excepciones de cobertura) para determinar con precisión matemática cuánto te corresponde pagar.',
    illustration: HeroDoctorBotIllustration,
    tip: '🛡️ Cero sorpresas: sabrás de antemano el código de regla exacto aplicado a tu caso.',
  },
  {
    title: '3. Ahorra eligiendo el mejor hospital',
    badge: 'Comparativa de Red en Tiempo Real',
    description:
      'Comparamos todos los centros médicos autorizados de tu red y te mostramos cuál te ofrece el copago más económico para que tomes la mejor decisión antes de salir de casa.',
    illustration: SavingsPiggyIllustration,
    tip: '⭐ Conoce exactamente cuánto ahorras respecto a la tarifa particular sin seguro.',
  },
] as const

export function GuidedTourModal({ isOpen, onClose, onStartConsultation }: Props) {
  const [currentStep, setCurrentStep] = useState(0)

  // Cerrar con Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const step = TOUR_STEPS[currentStep] ?? TOUR_STEPS[0]
  const Illustration = step.illustration

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm animate-scale-in"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-line bg-card shadow-2xl">
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between border-b border-line/80 px-6 py-4 bg-sunken/50">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-white text-xs font-bold">
              {currentStep + 1}
            </span>
            <span className="font-heading text-xs font-bold uppercase tracking-wider text-primary">
              Guía paso a paso &middot; {currentStep + 1} de {TOUR_STEPS.length}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full border border-line/80 bg-card text-muted transition-colors hover:bg-inset hover:text-strong"
            aria-label="Cerrar guía"
          >
            ✕
          </button>
        </div>

        {/* Contenido del paso actual */}
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex justify-center">
            <Illustration className="size-36" />
          </div>

          <span className="mb-1 inline-block rounded-full bg-accent-soft px-3 py-0.5 text-xs font-bold text-accent">
            {step.badge}
          </span>

          <h2 id="tour-title" className="mb-3 text-xl font-bold text-strong">
            {step.title}
          </h2>

          <p className="text-[0.9375rem] text-muted leading-relaxed mb-4">
            {step.description}
          </p>

          <div className="rounded-xl border border-line/70 bg-inset/60 p-3 text-xs text-strong font-medium">
            {step.tip}
          </div>
        </div>

        {/* Barra de progreso de puntos */}
        <div className="flex justify-center gap-2 pb-2">
          {TOUR_STEPS.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentStep(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentStep ? 'w-6 bg-primary' : 'w-2 bg-line'
              }`}
              aria-label={`Ir al paso ${index + 1}`}
            />
          ))}
        </div>

        {/* Pie con acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 bg-card p-4 sm:px-6">
          <button
            type="button"
            onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
            disabled={currentStep === 0}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-strong transition-colors hover:bg-inset disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Anterior
          </button>

          <div className="flex gap-2">
            {currentStep < TOUR_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => Math.min(TOUR_STEPS.length - 1, prev + 1))}
                className="btn-primary py-2 px-5 text-sm"
              >
                Siguiente
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onStartConsultation()
                }}
                className="btn-primary py-2 px-5 text-sm"
              >
                ¡Comenzar ahora! 🚀
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
