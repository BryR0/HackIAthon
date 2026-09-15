/**
 * Validacion del limite con el LLM.
 *
 * Todo lo que devuelve un proveedor pasa por aqui. Una especialidad fuera del
 * catalogo, un campo extra o un tipo equivocado se rechazan: el motor
 * financiero solo ve ids que existen.
 */

import { z } from 'zod'

import { allowedSpecialtyIds } from '../domain/catalog'

/** Limite de entrada. Acotar longitud reduce costo y superficie de inyeccion. */
export const MAX_SYMPTOM_LENGTH = 500
export const MIN_SYMPTOM_LENGTH = 3

export const symptomInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(MIN_SYMPTOM_LENGTH, 'Describe tu sintoma con un poco mas de detalle.')
    .max(MAX_SYMPTOM_LENGTH, `El texto no puede superar ${MAX_SYMPTOM_LENGTH} caracteres.`),
})

export type SymptomInput = z.infer<typeof symptomInputSchema>

/**
 * Respuesta cruda del proveedor.
 *
 * El enum se construye desde el catalogo en tiempo de ejecucion: si manana se
 * agrega una especialidad, el esquema la acepta sin tocar este archivo, y una
 * inventada sigue siendo imposible.
 */
export function buildProviderResponseSchema() {
  const ids = allowedSpecialtyIds()
  const specialtyId = z.string().refine((value) => ids.includes(value), {
    message: 'specialtyId fuera del catalogo cerrado',
  })

  return z.discriminatedUnion('status', [
    z.object({
      status: z.literal('classified'),
      specialtyId,
      confidence: z.enum(['high', 'medium', 'low']),
    }),
    z.object({
      status: z.literal('needs_clarification'),
      question: z.string().trim().min(1).max(200),
    }),
  ])
}

export type ProviderResponse = z.infer<ReturnType<typeof buildProviderResponseSchema>>

/** Estructura que se le pide al modelo. Va literal en el prompt. */
export const PROVIDER_JSON_CONTRACT = `{
  "status": "classified" | "needs_clarification",
  "specialtyId": "<id exacto del catalogo, solo si status es classified>",
  "confidence": "high" | "medium" | "low",
  "question": "<una sola pregunta, solo si status es needs_clarification>"
}`
