# ADR 0001 — Stack del MVP y reglas base

- **Fecha:** 2026-09-15
- **Estado:** Aceptado
- **Contexto:** Gate 0 del [Blueprint Reto 3](../../plans/reto-3-estimador-copago-cobertura.md)
- **Decisores:** BryR0

## Contexto

El Blueprint exige cerrar las decisiones de stack, proveedor de IA, moneda y
umbrales antes de modificar el repositorio. El repositorio no tenía código de
aplicación al momento de esta decisión.

Hechos verificados del entorno:

- `origin` = `https://github.com/BryR0/HackIAthon.git` (el Blueprint decía que no
  había remoto; queda corregido).
- Node `v22.19.0`, npm `11.19.0`.
- Ollama `0.11.10` local con `llama3.2`, `llama3`, `nomic-embed-text`.
- `gh` CLI no instalado.
- Sin API key de proveedor hosted en el entorno.
- Plazo de entrega: una semana desde 2026-09-15. Ejecución individual.

## Decisiones

### D1 — Stack

Next.js + TypeScript, npm con lockfile obligatorio, Node LTS fijado en `.nvmrc`
como `22.19.0`. Rutas de servidor del mismo proyecto para la API. Una sola
aplicación desplegable.

### D2 — Proveedor de IA: cascada con degradación automática

El adaptador de proveedor se configura por `.env` y admite cualquier backend.
Orden de resolución en tiempo de arranque:

1. Si `TRIAGE_PROVIDER` está fijado explícitamente, se usa ese.
2. Si no, se autodetecta el primer proveedor con credencial válida presente.
3. Si ninguno tiene credencial, se degrada al **doble determinista local** y la
   interfaz rotula visiblemente que opera en modo local.

Backends soportados: `groq`, `gemini`, `anthropic`, `openai`, `ollama`, `local`.

| Entorno | Proveedor |
|---|---|
| Desarrollo local | `ollama` (`llama3.2`), sin costo |
| Vercel (enlace público) | `groq` o `gemini` en free tier, key en variable de entorno de servidor |
| Vercel sin key configurada | `local` determinista, con rótulo visible |

Ollama nunca se expone a internet: Vercel no puede alcanzar `localhost:11434` y
un túnel dependería de una máquina encendida durante la semana de evaluación.

Se evaluó y descartó auto-hospedar Ollama en una instancia EC2 (`t3.large`,
~USD 14 por semana). Cerraba el mismo hueco que el free tier hosted, pero con
inferencia CPU-only a 5–10 s por clasificación, y añadía TLS, systemd, security
group y el riesgo de que el enlace entregado muriera durante la ventana de
evaluación. El free tier hosted da menor latencia, costo cero y cero operación.
El adaptador permite revertir a EC2 apuntando `OLLAMA_BASE_URL` a un host
remoto, sin cambio de arquitectura.

La credencial vive sólo en el servidor. Nunca se expone al navegador.

### D3 — Moneda, redondeo y locale

- Moneda: **USD**. Interfaz en **es-EC**.
- Todo monto se almacena como entero en centavos (`amountMinor`).
- Porcentajes en puntos básicos (`basisPoints`).
- Redondeo comercial **half-up**, aplicado una sola vez al final del cálculo.
- Límite duro: `copago = min(copago_calculado, precio_referencia)`.

### D4 — Guardrail de emergencia

Una señal de emergencia muestra: llamar al **ECU 911** o acudir a emergencias
del centro de salud más cercano. El mensaje aclara que no detectar una señal
tampoco descarta una emergencia. La transición a `emergency_warning` es
irreversible dentro de esa consulta y bloquea clasificación, selección manual,
cálculo y comparación económica en todos los modos de proveedor.

### D5 — Umbral de evaluación del clasificador

Corpus etiquetado de **42 casos**: 32 claros, 5 ambiguos, 3 de emergencia, 2 de
prompt injection. El corpus nació con 30 casos y se amplió con 12 claros al
sumar odontología, endocrinología, neumología, nutrición, reumatología,
alergología y fisioterapia al catálogo: una especialidad sin casos en el corpus
no está evaluada.

- Clasificación correcta ≥ **90 %** sobre el corpus.
- **100 %** en los 3 casos de emergencia y los 2 de injection. Sin tolerancia.

Fallar cualquiera de los dos criterios bloquea la promoción en el Paso 7.

### D6 — Persistencia

JSON versionado en el repositorio. Sin base de datos externa. El historial es
únicamente de sesión, en memoria del navegador, construido desde la allowlist de
campos: IDs ficticios de paciente, plan, servicio y hospital; montos; moneda;
versión de regla; fecha. El texto libre del síntoma nunca se persiste.

### D7 — Lenguaje: TypeScript confirmado

Se reevaluó el lenguaje tras confirmar que la fuente del reto no impone ninguno.
Verificado por búsqueda sobre `hackIAthon-retos-filtro.md`: el documento sólo
exige escoger un reto, entregar una solución funcional, un enlace público del
agente y un enlace de repositorio en GitHub o GitLab. No menciona lenguaje,
framework, stack ni plataforma. Notion aparece sólo en los retos 1 y 5; el
Reto 3 no menciona ninguna herramienta.

TypeScript se mantiene porque las piezas que sí dependen del lenguaje son la UI
accesible de la sección 7 del Blueprint y el tooling Vitest/Playwright/axe. El
motor de copago es aritmética entera y la llamada al LLM es HTTP con JSON
schema: ninguno de los dos gana nada con otro lenguaje. Python sólo compensaría
si el reto exigiera embeddings o ML local, y no lo hace.

### D8 — Alcance

Se ejecuta el Blueprint completo, Pasos 1 a 8, incluidos E2E de las cinco rutas,
evals del agente, accesibilidad automatizada y prueba de fuga sintética.

## Consecuencias

- El desarrollo local no tiene costo de API gracias a Ollama.
- El enlace público funciona aunque no se consiga una key hosted; degrada a modo
  determinista rotulado en lugar de fallar.
- La calidad de clasificación puede diferir entre `llama3.2` local y el
  proveedor hosted. El corpus de evals debe ejecutarse contra **ambos** antes de
  la entrega.
- Falta conseguir una key de Groq o Gemini free tier antes del Paso 8; hasta
  entonces el despliegue degrada al determinista rotulado.
- Falta instalar `gh` CLI o publicar el repositorio por la web antes del Paso 8.
- El umbral de 90 % puede ser exigente para `llama3.2`; el fallback de selección
  manual de especialidad mantiene el recorrido utilizable si no se alcanza.
