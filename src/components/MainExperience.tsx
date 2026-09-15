'use client'

import { useState, useEffect } from 'react'
import { HeroSection } from './HeroSection'
import { GuidedTourModal } from './GuidedTourModal'
import { ConsultaFlow, type FlowOption } from './ConsultaFlow'

export interface MainExperienceProps {
  readonly patients: readonly { id: string; displayName: string; planName: string }[]
  readonly specialties: readonly FlowOption[]
  readonly hospitalNames: Readonly<Record<string, string>>
  readonly hospitalLocations: Readonly<Record<string, string>>
}

export function MainExperience({
  patients,
  specialties,
  hospitalNames,
  hospitalLocations,
}: MainExperienceProps) {
  const [isTourOpen, setIsTourOpen] = useState(false)
  const [isConsultaModalOpen, setIsConsultaModalOpen] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<string>('collecting')

  const isResultMode = currentPhase === 'result' || currentPhase === 'emergency'

  // Cerrar modal con la tecla Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (isConsultaModalOpen) setIsConsultaModalOpen(false)
        if (isTourOpen) setIsTourOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isConsultaModalOpen, isTourOpen])

  return (
    <>
      {/* Al salir del modal y ver resultados, ocultamos el hero para apreciar todo en pantalla completa */}
      {!isResultMode && (
        <HeroSection
          onStartConsultation={() => setIsConsultaModalOpen(true)}
          onOpenTour={() => setIsTourOpen(true)}
        />
      )}

      {/* Modal Guiado (Paso a Paso con Ilustraciones) */}
      <GuidedTourModal
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onStartConsultation={() => {
          setIsTourOpen(false)
          setIsConsultaModalOpen(true)
        }}
      />

      {/* Flujo de Consulta: steps y formulario en modal "consulta-flujo", resultados en pantalla grande */}
      <ConsultaFlow
        patients={patients}
        specialties={specialties}
        hospitalNames={hospitalNames}
        hospitalLocations={hospitalLocations}
        isModalOpen={isConsultaModalOpen}
        onModalOpenChange={setIsConsultaModalOpen}
        onPhaseChange={setCurrentPhase}
      />
    </>
  )
}
