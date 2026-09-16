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

/**
 * Terminos que el paciente usa de verdad, mas alla del nombre de la especialidad.
 *
 * Se escribe como habla la gente ("me duele la muela"), no como escribe la
 * aseguradora. Las frases pesan mas que las palabras sueltas: ver `scoreFor`.
 */
const EXTRA_TERMS: Readonly<Record<string, readonly string[]>> = {
  'ESP-DERMATOLOGIA': ['mancha', 'manchas', 'roncha', 'ronchas', 'picazon', 'me pica', 'grano', 'granos', 'erupcion', 'comezon', 'urticaria', 'me arde la piel', 'se me cae el pelo', 'caspa', 'hongos en la piel', 'verruga', 'quemadura de sol'],
  'ESP-TRAUMATOLOGIA': ['me torci', 'torcedura', 'golpe', 'caida', 'me cai', 'hinchado', 'cojeo', 'hombro', 'muneca', 'espalda baja', 'lumbar', 'me duele la rodilla', 'me duele el tobillo', 'me duele la espalda', 'me duele el cuello', 'dolor de espalda', 'luxacion', 'me lastime', 'no puedo doblar'],
  'ESP-GASTROENTEROLOGIA': ['diarrea', 'estrenimiento', 'nauseas', 'me arde el estomago', 'reflujo', 'colon', 'hinchazon abdominal', 'dolor abdominal', 'me duele el estomago', 'dolor de estomago', 'me duele la barriga', 'indigestion', 'muchos gases', 'ardor al comer'],
  'ESP-CARDIOLOGIA': ['taquicardia', 'late rapido', 'presion arterial', 'hipertension', 'se me acelera', 'colesterol', 'me late fuerte el corazon', 'presion baja', 'se me hinchan los pies'],
  'ESP-OTORRINOLARINGOLOGIA': ['me duele el oido', 'zumbido', 'ronquera', 'amigdalas', 'congestion nasal', 'dolor de garganta', 'gripe', 'me duele la garganta', 'no escucho bien', 'me sangra la nariz', 'ronco al dormir', 'anginas', 'afonia'],
  'ESP-OFTALMOLOGIA': ['veo borroso', 'ojo rojo', 'lagrimeo', 'me arden los ojos', 'lentes', 'miopia', 'me duele el ojo', 'me pican los ojos', 'veo manchas', 'astigmatismo', 'cataratas', 'examen de la vista'],
  'ESP-GINECOLOGIA': ['regla', 'periodo', 'papanicolau', 'flujo', 'embarazo', 'anticonceptivo', 'menopausia', 'estoy embarazada', 'dolor en el vientre', 'retraso menstrual', 'control prenatal'],
  'ESP-PEDIATRIA': ['mi hijo', 'mi hija', 'mi bebe', 'el nino', 'la nina', 'control del nino', 'mi nene', 'mi nena', 'vacunas del bebe', 'control de crecimiento'],
  'ESP-NEUROLOGIA': ['dolor de cabeza', 'jaqueca', 'hormigueo', 'entumecimiento', 'temblor', 'vertigo', 'me duele la cabeza', 'se me duerme la mano', 'perdida de memoria', 'me olvido las cosas'],
  'ESP-UROLOGIA': ['me arde al orinar', 'orino mucho', 'sangre en la orina', 'calculos', 'vejiga', 'no puedo orinar bien', 'dolor al orinar', 'infeccion urinaria', 'me duele el rinon', 'examen de prostata'],
  'ESP-PSICOLOGIA': ['no puedo dormir', 'insomnio', 'me siento triste', 'angustia', 'ataques de panico', 'deprimido', 'deprimida', 'me siento solo', 'me siento sola', 'mucho estres', 'ataque de ansiedad', 'quiero terapia', 'problemas de pareja', 'no tengo ganas de nada'],
  'ESP-MEDICINA-GENERAL': ['chequeo', 'examen general', 'certificado medico', 'fiebre', 'malestar general', 'examenes de rutina', 'chequeo general', 'me siento decaido', 'certificado de salud', 'resultados de examenes'],
  'ESP-ODONTOLOGIA': ['me duele la muela', 'me duele el diente', 'dolor de muela', 'dolor de muelas', 'dolor de diente', 'muela picada', 'caries', 'limpieza dental', 'me sangran las encias', 'muela del juicio', 'se me rompio un diente', 'brackets', 'ortodoncia', 'protesis dental'],
  'ESP-ENDOCRINOLOGIA': ['azucar alta', 'azucar en la sangre', 'soy diabetico', 'soy diabetica', 'tiroides', 'me sube el azucar', 'mucha sed y orino mucho', 'problemas hormonales', 'control de diabetes', 'subi de peso sin razon'],
  'ESP-NEUMOLOGIA': ['tos que no se quita', 'tos con flema', 'me silba el pecho', 'me canso al caminar', 'asma', 'bronquitis', 'fumo hace anos', 'tos seca hace semanas', 'ronquidos con pausas'],
  'ESP-NUTRICION': ['quiero bajar de peso', 'bajar de peso', 'subir de peso', 'plan alimenticio', 'que puedo comer', 'sobrepeso', 'obesidad', 'dieta', 'nutricionista', 'quiero comer sano'],
  'ESP-REUMATOLOGIA': ['dolor en las articulaciones', 'me duelen las articulaciones', 'artritis', 'artrosis', 'dedos hinchados', 'rigidez en la manana', 'me duelen los huesos siempre', 'lupus', 'fibromialgia'],
  'ESP-ALERGOLOGIA': ['soy alergico', 'soy alergica', 'alergia', 'alergias', 'estornudos', 'rinitis', 'me hincho con ciertos alimentos', 'alergia al polvo', 'alergia a un medicamento', 'ojos llorosos en primavera'],
  'ESP-FISIOTERAPIA': ['rehabilitacion', 'terapia fisica', 'fisioterapia', 'contractura', 'recuperar movilidad', 'despues de la operacion', 'ejercicios para el dolor', 'tengo el musculo tenso'],
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
