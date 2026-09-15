# Cobertura Clara

Estimador agéntico de copago y cobertura para el paciente.
**Reto 3** de los retos filtro del hackIAthon de Viamatica.

> Todos los datos son **ficticios**. Esta herramienta no diagnostica, no autoriza
> procedimientos y no emite facturas.

## El problema

Un paciente no sabe a qué especialidad acudir, ni cuánto va a pagar, hasta que
ya está en la ventanilla. La información existe —su plan, el tarifario del
hospital, la red— pero no está donde él la necesita: antes de decidir.

## La decisión de diseño que define el proyecto

**El modelo de lenguaje nunca calcula dinero.**

```
Paciente ──texto libre──> Guardrail de emergencia (determinista)
                              │
                              ├─ hay señal ──> emergency_warning. Fin.
                              │
                              └─ no hay señal
                                    │
                                    v
                              LLM ──> especialidad del catálogo cerrado
                                    │
                                    v
                              Confirmación humana
                                    │
                                    v
                              Motor determinista ──> copago + ranking
```

El LLM hace una sola cosa: convertir lenguaje natural en un `specialtyId` que
existe en un catálogo cerrado. Todo lo demás —cobertura, copago, comparación de
hospitales— lo hace aritmética entera con reglas versionadas.

Consecuencias verificadas por las pruebas:

- Una especialidad inventada por el modelo se descarta entera, no se "arregla".
- Si el proveedor se cae, el monto calculado es **idéntico**.
- El guardrail de emergencia corre **antes** del proveedor, así que funciona sin
  credencial, sin red y con selección manual.

## Cómo correrlo

```bash
npm install
```

```bash
npm run dev
```

Abre `http://localhost:3000`. Funciona sin configurar nada: sin credencial,
degrada al clasificador determinista local y lo rotula en la interfaz.

### Con un proveedor real

Copia `.env.example` a `.env` y completa:

```bash
cp .env.example .env
```

| Variable | Para qué |
|---|---|
| `AI_PROVIDER` | `gemini`, `groq`, `openai`, `anthropic`, `ollama` o `local` |
| `AI_API_KEY` | Credencial. Solo servidor, nunca llega al navegador |
| `AI_MODEL` | Opcional, si quieres otro modelo del proveedor |
| `OLLAMA_BASE_URL` | Solo desarrollo local |

Si omites `AI_PROVIDER`, se autodetecta el primero con credencial. Si ninguno la
tiene, degrada a `local`. Ver [ADR 0001 D2](docs/adr/0001-mvp-stack-and-rules.md).

## Verificación

```bash
npm run verify
```

Corre validación de datos, lint, typecheck y las 80 pruebas.

```bash
npm run test:e2e
```

20 pruebas end-to-end en desktop y móvil, incluida auditoría axe WCAG 2.1 AA.

| Comando | Qué hace |
|---|---|
| `npm run validate:data` | Valida catálogos, integridad referencial y casos dorados |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript en modo estricto |
| `npm test` | 80 pruebas: unidad, integración y evals del agente |
| `npm run test:e2e` | 20 pruebas Playwright + axe |
| `python scripts/oracle.py` | Recalcula los 18 casos dorados con el oráculo independiente |

### El oráculo independiente

`scripts/oracle.py` calcula las expectativas de los casos dorados con `Decimal`
y `ROUND_HALF_UP`. El motor de producción usa aritmética entera. **Son dos
implementaciones deliberadamente distintas**: que coincidan en los 18 casos es
evidencia, no tautología.

Es una herramienta de desarrollo. No se despliega, y no hace falta Python para
correr el proyecto: `tests/fixtures/golden-cases.json` está versionado.

## Estado de la verificación

| Comprobación | Resultado |
|---|---|
| Casos dorados financieros | 18/18 — motor TS coincide con oráculo Python |
| Corpus del clasificador | 30/30 (100 %), umbral exigido 90 % |
| Emergencia e inyección | 5/5, tolerancia cero |
| Pruebas totales | 80 unidad/integración/evals + 20 E2E |
| axe WCAG 2.1 AA | 0 violaciones, desktop y móvil |
| `npm audit` | 0 vulnerabilidades |

## Arquitectura

```
data/                      Catálogos cerrados en JSON, versionados y ficticios
docs/domain.md             Especificación normativa del cálculo
docs/adr/                  Decisiones de arquitectura
scripts/oracle.py          Oráculo independiente (desarrollo)
scripts/validate-data.mjs  Validador de catálogos, sin dependencias
src/domain/                Motor determinista. Funciones puras, sin IA
src/agent/                 Guardrail, esquemas, clasificador local, adaptador
src/app/api/               Rutas de servidor
src/components/            Interfaz accesible
tests/                     Unidad, integración, evals, E2E y fixtures
```

Documentos: [dominio](docs/domain.md) ·
[ADR 0001](docs/adr/0001-mvp-stack-and-rules.md) ·
[blueprint](plans/reto-3-estimador-copago-cobertura.md)

## Reglas del cálculo

Especificación completa en [docs/domain.md](docs/domain.md). Lo esencial:

- Dinero: **entero en centavos**. Nunca punto flotante.
- Porcentajes: **puntos básicos** (0–10000).
- Copago fijo: `min(copago, precio)`. Nunca pagas más que la consulta.
- Coseguro: `cubierto = half_up(precio × bp / 10000)`, `copago = precio − cubierto`.
  Un solo redondeo, sobre el monto cubierto.
- Precedencia: gana la regla vigente de `precedence` menor. Un empate es un
  error de datos, no una elección arbitraria.
- Desempate del ranking: copago asc → costo de referencia asc → id asc.

Si falta un dato, el resultado lo dice (`needs_information`). **Nunca se inventa
un monto aproximado.**

## Privacidad

El texto del síntoma vive solo en memoria durante la consulta:

- No entra en `localStorage`, historial ni resumen.
- No aparece en logs ni en ninguna respuesta de la API.
- El historial de sesión guarda solo especialidad y monto.

Hay tres pruebas que inyectan un canario sintético y verifican que no aparece en
ninguna respuesta.

## Seguridad clínica

- El guardrail de emergencia corre antes que todo lo demás y bloquea cálculo y
  comparación de forma irreversible dentro de esa consulta.
- Deriva al **ECU 911**.
- La interfaz dice explícitamente que **no detectar una señal no descarta una
  emergencia**. Es una red basta, no un triaje clínico.

## Limitaciones

Honestas, no ocultas:

- Los datos son ficticios. Ningún monto corresponde a un plan o tarifario real.
- Solo compara **consulta inicial de la misma especialidad**. Sin deducibles
  acumulados, coseguro escalonado, límites anuales ni conversión de moneda.
- El clasificador local es coincidencia de términos, no comprensión. Cuando la
  señal es débil pregunta en vez de adivinar.
- El corpus de evaluación mide el clasificador local. Un proveedor remoto tiene
  que medirse contra el mismo corpus antes de confiar en él.
- El guardrail de emergencia cubre un conjunto acotado de señales en español.

## Stack

Next.js 15 · TypeScript estricto · Zod · Vitest · Playwright · axe-core.
Sin base de datos: los catálogos son JSON versionado.

El reto no impone lenguaje ni stack —verificado sobre el documento fuente—; esta
elección está justificada en [ADR 0001 D7](docs/adr/0001-mvp-stack-and-rules.md).
