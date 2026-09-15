/**
 * Clasificador determinista. Doble local del proveedor.
 *
 * Cumple tres papeles:
 * 1. Desarrollo y pruebas sin red ni costo.
 * 2. Demo reproducible: mismo texto, misma especialidad, siempre.
 * 3. Degradacion cuando no hay credencial o el proveedor falla.
 *
 * Es coincidencia de palabras, no comprension. Cuando la senal es debil
 * devuelve `needs_clarification` en vez de adivinar: una especialidad
 * equivocada con aire de certeza es peor que una pregunta.
 */

import { normalizeForMatching } from './emergency'
import type { ProviderResponse } from './schema'
import { defaultCatalog, type Catalog } from '../domain/catalog'

/** Terminos que el paciente usa de verdad, mas alla del nombre de la especialidad. */
const EXTRA_TERMS: Readonly<Record<string, readonly string[]>> = {
  'ESP-DERMATOLOGIA': ['mancha', 'manchas', 'roncha', 'ronchas', 'picazon', 'me pica', 'grano', 'granos', 'erupcion', 'comezon', 'urticaria'],
  'ESP-TRAUMATOLOGIA': ['me torci', 'torcedura', 'golpe', 'caida', 'me cai', 'hinchado', 'cojeo', 'hombro', 'muneca', 'espalda baja', 'lumbar'],
  'ESP-GASTROENTEROLOGIA': ['diarrea', 'estrenimiento', 'nauseas', 'me arde el estomago', 'reflujo', 'colon', 'hinchazon abdominal', 'dolor abdominal'],
  'ESP-CARDIOLOGIA': ['taquicardia', 'late rapido', 'presion arterial', 'hipertension', 'se me acelera'],
  'ESP-OTORRINOLARINGOLOGIA': ['me duele el oido', 'zumbido', 'ronquera', 'amigdalas', 'congestion nasal', 'dolor de garganta', 'gripe'],
  'ESP-OFTALMOLOGIA': ['veo borroso', 'ojo rojo', 'lagrimeo', 'me arden los ojos', 'lentes', 'miopia'],
  'ESP-GINECOLOGIA': ['regla', 'periodo', 'papanicolau', 'flujo', 'embarazo', 'anticonceptivo'],
  'ESP-PEDIATRIA': ['mi hijo', 'mi hija', 'mi bebe', 'el nino', 'la nina', 'control del nino'],
  'ESP-NEUROLOGIA': ['dolor de cabeza', 'jaqueca', 'hormigueo', 'entumecimiento', 'temblor', 'vertigo'],
  'ESP-UROLOGIA': ['me arde al orinar', 'orino mucho', 'sangre en la orina', 'calculos', 'vejiga'],
  'ESP-PSICOLOGIA': ['no puedo dormir', 'insomnio', 'me siento triste', 'angustia', 'ataques de panico', 'deprimido', 'deprimida'],
  'ESP-MEDICINA-GENERAL': ['chequeo', 'examen general', 'certificado medico', 'fiebre', 'malestar general'],
}

/** Una palabra suelta de 3 letras coincide por accidente; una frase, casi nunca. */
function scoreFor(normalized: string, terms: readonly string[]): number {
  let score = 0
  for (const term of terms) {
    if (term.length < 4) continue
    if (normalized.includes(term)) score += term.includes(' ') ? 3 : 2
  }
  return score
}

function termsForSpecialty(catalog: Catalog, specialtyId: string): readonly string[] {
  const specialty = catalog.specialties.find((s) => s.id === specialtyId)
  const fromCatalog = specialty ? [specialty.name, ...specialty.aliases] : []
  return [...fromCatalog, ...(EXTRA_TERMS[specialtyId] ?? [])].map(normalizeForMatching)
}

const CLARIFICATION_QUESTION =
  'No logro identificar la especialidad con eso. Cuentame donde sientes la molestia y desde cuando.'

export function classifyLocally(text: string, catalog: Catalog = defaultCatalog): ProviderResponse {
  const normalized = normalizeForMatching(text)

  const ranked = catalog.specialties
    .map((specialty) => ({
      specialtyId: specialty.id,
      score: scoreFor(normalized, termsForSpecialty(catalog, specialty.id)),
    }))
    .sort((a, b) => b.score - a.score || a.specialtyId.localeCompare(b.specialtyId, 'en'))

  const best = ranked[0]
  const runnerUp = ranked[1]

  if (!best || best.score === 0) {
    return { status: 'needs_clarification', question: CLARIFICATION_QUESTION }
  }

  // Empate real: dos especialidades igual de plausibles. Preguntar, no elegir.
  if (runnerUp && runnerUp.score === best.score) {
    return { status: 'needs_clarification', question: CLARIFICATION_QUESTION }
  }

  const margin = best.score - (runnerUp?.score ?? 0)
  const confidence = best.score >= 3 && margin >= 2 ? 'high' : best.score >= 2 ? 'medium' : 'low'

  return { status: 'classified', specialtyId: best.specialtyId, confidence }
}
