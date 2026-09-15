/**
 * Guardrail de emergencia. Determinista, sin LLM.
 *
 * Corre ANTES de llamar al proveedor y ANTES de permitir seleccion manual. Una
 * coincidencia devuelve solo `emergency_warning` y bloquea clasificacion,
 * calculo y comparacion economica, en los tres modos de proveedor.
 *
 * Limitacion honesta, que la interfaz debe repetir al usuario: no detectar una
 * senal NO descarta una emergencia. Esto es una red de seguridad basta, no un
 * triaje clinico.
 */

export interface EmergencySignal {
  readonly messageCode: string
  /** Patrones en minusculas y sin tildes. El texto se normaliza antes. */
  readonly patterns: readonly string[]
}

export const EMERGENCY_SIGNALS: readonly EmergencySignal[] = [
  {
    messageCode: 'EMERGENCY_CHEST_PAIN',
    patterns: [
      'dolor en el pecho',
      'dolor de pecho',
      'me duele el pecho',
      'duele fuerte el pecho',
      'opresion en el pecho',
      'presion en el pecho',
      'infarto',
    ],
  },
  {
    messageCode: 'EMERGENCY_BREATHING',
    patterns: [
      'no puedo respirar',
      'me falta el aire',
      'falta de aire',
      'me ahogo',
      'dificultad para respirar',
    ],
  },
  {
    messageCode: 'EMERGENCY_STROKE_SIGNS',
    patterns: [
      'no puedo mover el brazo',
      'no puedo mover la pierna',
      'se me traba el habla',
      'no puedo hablar bien',
      'se me tuerce la cara',
      'perdi la fuerza de un lado',
      'derrame',
    ],
  },
  {
    messageCode: 'EMERGENCY_SEVERE_BLEEDING',
    patterns: [
      'sangrado que no para',
      'no para de sangrar',
      'estoy sangrando mucho',
      'vomito con sangre',
      'vomite sangre',
    ],
  },
  {
    messageCode: 'EMERGENCY_CONSCIOUSNESS',
    patterns: [
      'me desmaye',
      'perdi el conocimiento',
      'no reacciona',
      'esta inconsciente',
      'convulsion',
      'convulsiones',
    ],
  },
  {
    messageCode: 'EMERGENCY_SUICIDAL_IDEATION',
    patterns: [
      'quiero morirme',
      'me quiero matar',
      'pensar en suicidio',
      'pensamientos suicidas',
      'quitarme la vida',
    ],
  },
  {
    messageCode: 'EMERGENCY_SEVERE_HEAD',
    patterns: [
      'el peor dolor de cabeza de mi vida',
      'dolor de cabeza repentino y muy fuerte',
      'golpe fuerte en la cabeza',
    ],
  },
]

/**
 * Minuscula, sin tildes, sin puntuacion, espacios colapsados.
 *
 * Normalizar es lo que permite escribir los patrones una sola vez y que igual
 * coincidan con "Me DUELE el pecho!!" o "me duele el pécho".
 */
export function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `null` no significa "no es emergencia": significa "no coincidio ningun patron". */
export function detectEmergency(text: string): string | null {
  const normalized = normalizeForMatching(text)
  if (normalized.length === 0) return null

  for (const signal of EMERGENCY_SIGNALS) {
    for (const pattern of signal.patterns) {
      if (normalized.includes(pattern)) return signal.messageCode
    }
  }
  return null
}
