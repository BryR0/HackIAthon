'use client'

import { HeroDoctorBotIllustration } from './Illustrations'

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

export interface HeroSectionProps {
  readonly onStartConsultation?: () => void
  readonly onOpenTour?: () => void
}

export function HeroSection({ onStartConsultation, onOpenTour }: HeroSectionProps) {
  const handleStart = onStartConsultation ?? (() => {
    const symptomField = document.querySelector('textarea')
    if (symptomField) {
      symptomField.scrollIntoView({ behavior: 'smooth', block: 'center' })
      symptomField.focus()
    }
  })

  const handleTour = onOpenTour ?? (() => {})

  return (
    <>
      <section
        aria-labelledby="titulo-inicio"
        className="relative mb-10 overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-primary-soft/30 via-card to-card p-6 sm:p-10 shadow-xs"
      >
        {/* Luces ambientales sutiles */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -left-20 -bottom-20 size-72 rounded-full bg-accent/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card px-3.5 py-1 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-primary shadow-2xs">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex size-2 rounded-full bg-primary"></span>
              </span>
              Reto 3 &middot; hackIAthon &middot; IA &amp; Reglas Clínicas
            </div>

            <h1 id="titulo-inicio" className="mb-4 text-display font-extrabold tracking-tight text-strong">
              Sabe cuanto pagas{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                antes de ir.
              </span>
            </h1>

            <p className="max-w-[60ch] text-lg text-muted leading-relaxed mb-6">
              Describe tu sintoma. El agente sugiere la especialidad, un motor de reglas aplica la
              cobertura de tu plan y te muestra que hospital de tu red te sale mas barato.
            </p>

            {/* Botones de acción solicitados: Iniciar consulta y Modal Guía */}
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleStart}
                className="btn-primary shadow-md hover:shadow-lg transition-all"
              >
                ⚡ Iniciar consulta ahora
              </button>

              <button
                type="button"
                onClick={handleTour}
                className="btn-secondary"
              >
                ✨ Ver cómo funciona (Guía rápida)
              </button>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-strong shadow-2xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-primary" aria-hidden="true">
                  <path d="m13 2-2 7h4l-5 13 2-9h-4l5-11z"/>
                </svg>
                Triage IA en segundos
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-strong shadow-2xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-accent" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                100% Privado sin registro
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-strong shadow-2xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-primary" aria-hidden="true">
                  <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
                </svg>
                Cálculo de reglas auditable
              </span>
            </div>
          </div>

          {/* Ilustración Caricaturesca Animada SVG (Asistente Médico IA) */}
          <div className="hidden lg:flex flex-col items-center justify-center p-2">
            <HeroDoctorBotIllustration className="size-56" />
            <span className="mt-2 rounded-full border border-line bg-card/90 px-3 py-1 text-xs font-bold text-strong shadow-2xs">
              🤖 Asistente Clínico Inteligente
            </span>
          </div>
        </div>

        {/* Tarjetas comparativas Si hace / No hace */}
        <div className="mt-8 grid gap-4 border-t border-line/80 pt-6 sm:grid-cols-2 sm:gap-6">
          <div className="flex gap-3.5 rounded-xl border border-accent/20 bg-accent-soft/40 p-4 transition-all hover:bg-accent-soft/60">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-white shadow-2xs">
              <svg {...ICON_PROPS} width="18" height="18" className="text-white">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div>
              <strong className="mb-1 block font-heading font-semibold text-strong">Si hace</strong>
              <span className="block text-[0.9375rem] text-muted leading-relaxed">
                Sugiere una especialidad, aplica las reglas de tu plan y ensena el calculo completo,
                regla por regla.
              </span>
            </div>
          </div>

          <div className="flex gap-3.5 rounded-xl border border-line bg-card p-4 transition-all hover:border-danger/30 hover:bg-danger-soft/20">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger shadow-2xs">
              <svg {...ICON_PROPS} width="18" height="18" className="text-danger">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </div>
            <div>
              <strong className="mb-1 block font-heading font-semibold text-strong">No hace</strong>
              <span className="block text-[0.9375rem] text-muted leading-relaxed">
                No diagnostica, no autoriza procedimientos y no emite facturas. El monto es una
                estimacion con datos ficticios.
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
