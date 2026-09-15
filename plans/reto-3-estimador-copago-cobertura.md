# Blueprint de implementación — Reto 3: Estimador Agéntico de Copago y Cobertura

Estado: Gate 0 cerrado — ver `docs/adr/0001-mvp-stack-and-rules.md`  
Modo: directo sobre `main` (remoto `origin` = BryR0/HackIAthon; `gh` CLI aun no instalado)  
Fuente: `hackIAthon-retos-filtro.md` y `hackIAthon-retos-filtro.pdf`  
Producto propuesto: **Cobertura Clara**

## 1. Decisión

Implementar el **Reto 3: Estimador Agéntico de Copago y Cobertura para el Paciente**.

El flujo solicitado por el reto es:

1. El paciente describe un síntoma.
2. El agente sugiere la especialidad hospitalaria apropiada.
3. Consulta el plan de seguro del paciente.
4. Calcula el copago exacto mediante reglas verificables.
5. Recomienda el hospital de la red con mejor costo estimado.

### Por qué este reto

Escala: 1 = desfavorable, 5 = favorable. La puntuación es una decisión de producto basada en los requisitos extraídos; no es un criterio oficial del hackIAthon.

| Reto | MVP demostrable | Datos simulables | Claridad del resultado | Potencial UX | Riesgo operativo | Total |
|---|---:|---:|---:|---:|---:|---:|
| 1. Preautorización quirúrgica | 4 | 3 | 5 | 4 | 2 | 18 |
| 2. Auditoría de siniestros | 3 | 3 | 4 | 3 | 3 | 16 |
| **3. Copago y cobertura** | **5** | **5** | **5** | **5** | **4** | **24** |
| 4. Alertas de emergencias | 3 | 4 | 4 | 3 | 2 | 16 |
| 5. Bienestar preventivo | 4 | 3 | 3 | 5 | 3 | 18 |

El Reto 3 permite mostrar IA útil sin delegarle el cálculo financiero: el modelo interpreta la conversación y propone una especialidad; un motor determinista aplica cobertura, red y copago. Esa separación hace que el resultado sea explicable, repetible y fácil de evaluar en una demo.

## 2. Objetivo y criterios de éxito

### Objetivo

Construir una aplicación web conversacional que produzca una estimación clara y auditable de cobertura y copago, y recomiende una opción de hospital dentro de la red.

### Criterios de éxito del MVP

- Un usuario completa el flujo principal en menos de 3 minutos.
- La especialidad sugerida se devuelve en una estructura validada, nunca como texto libre consumido directamente por el motor financiero.
- Para el conjunto de prueba, el copago calculado coincide en el 100 % de los casos con un oráculo independiente de las reglas sembradas.
- El resultado identifica plan, servicio, hospital, costo de referencia, cobertura aplicada, copago y explicación del cálculo.
- Ningún flujo presenta la estimación como diagnóstico médico, autorización definitiva o factura final.
- La interfaz funciona con teclado, lector de pantalla y anchos de 375, 768, 1024 y 1440 px.
- Existe un enlace público funcional y un repositorio público reproducible.

## 3. Alcance

### Incluido en el MVP

- Inicio sin contraseña con selección de un paciente ficticio o código de demo.
- Conversación guiada en español para capturar síntoma, duración y nivel de urgencia.
- Clasificación del síntoma hacia un catálogo cerrado de especialidades.
- Selección o recuperación de un plan ficticio.
- Motor de reglas determinista para cobertura y copago.
- Comparación de hospitales de la red por costo estimado.
- Resultado explicable y compartible como resumen generado sólo desde campos permitidos, sin síntomas ni texto libre.
- Historial local de estimaciones de la sesión.
- Datos semilla y escenarios de demo reproducibles.
- Registro técnico limitado a IDs ficticios, versión de reglas, estado, latencia y código de error; nunca guarda síntomas ni texto libre.

### Fuera de alcance

- Diagnóstico, triaje clínico definitivo o recomendación de tratamiento.
- Integración real con aseguradoras, hospitales, expedientes clínicos o pagos.
- Autorización de procedimientos.
- Procesamiento de documentos clínicos reales.
- Cálculo con deducibles acumulados, coseguro complejo o límites anuales salvo que el dataset de la competencia los exija.
- Comparación de procedimientos distintos: el MVP compara únicamente una **consulta inicial de la misma especialidad** entre hospitales.
- Uso de datos personales reales durante la demo.

## 4. Usuarios y recorridos

### Usuario principal

Paciente asegurado que necesita saber a qué especialidad acudir, cuánto podría pagar y qué hospital de la red ofrece la opción más económica.

### Recorrido feliz

1. Pantalla de bienvenida: explica qué hace y qué no hace el agente.
2. Identificación de demo: paciente/plan ficticio.
3. Conversación: síntoma, duración y señales de urgencia.
4. Confirmación: el usuario revisa la especialidad sugerida y puede cambiarla.
5. Cálculo: estado de carga estable con `aria-busy` y explicación del paso actual.
6. Resultado: tarjeta de copago, desglose, cobertura y hospitales comparados.
7. Acción final: nueva consulta o copia del resumen.

### Recorridos alternos obligatorios

- Síntoma ambiguo: una sola pregunta aclaratoria y posibilidad de elegir especialidad manualmente.
- Posible emergencia: transición irreversible dentro de esa consulta a `emergency_warning`; bloquea clasificación, confirmación manual, cálculo y comparación económica. El mensaje aclara que no detectar una señal tampoco descarta una emergencia.
- Servicio no cubierto: explicar la regla y ofrecer hospitales de red sin prometer cobertura.
- Plan o tarifa ausente: informar que no puede calcularse un valor exacto; nunca inventar un monto.
- Fallo del modelo: conservar los datos introducidos y permitir selección manual de especialidad.
- Sin hospitales compatibles: mostrar próximos pasos; no dejar una pantalla vacía.

## 5. Arquitectura propuesta

No existe stack previo en el repositorio. El Blueprint fija esta base para que los pasos sean reproducibles; el equipo debe confirmarla en el Gate 0 antes de modificar el repositorio.

- **Runtime/paquetes:** Node.js LTS declarado en `.nvmrc`, `npm` y lockfile obligatorio.
- **Web:** Next.js + TypeScript, interfaz responsive y renderizado accesible.
- **UI:** CSS/Tailwind con tokens semánticos; componentes propios pequeños o una librería accesible ya conocida por el equipo.
- **API:** rutas de servidor del mismo proyecto para reducir infraestructura.
- **Agente:** proveedor compatible con salida JSON detrás de un adaptador servidor; credencial sólo en servidor y doble local determinista para pruebas.
- **Reglas:** funciones TypeScript puras para cobertura, copago y ranking de hospitales.
- **Datos MVP:** JSON versionado en el repositorio; Supabase sólo si se necesita persistencia multiusuario.
- **Validación/pruebas:** Zod en límites, Vitest para unidad/integración, Playwright para E2E y axe para chequeos automáticos de accesibilidad.
- **Observabilidad:** eventos estructurados con identificadores ficticios, latencia y versión de reglas.
- **Despliegue sugerido:** Vercel u otro host que el equipo ya domine.

```text
Navegador
   │
   ├── conversación ──> /api/triage ──> adaptador LLM ──> especialidad validada
   │
   └── plan + especialidad ──> /api/estimate
                                  ├── catálogo de cobertura
                                  ├── tarifario por hospital
                                  └── motor determinista
                                           │
                                           └── estimación + desglose + ranking
```

### Invariantes

- El LLM no calcula dinero ni decide si algo está cubierto.
- El motor sólo acepta identificadores presentes en catálogos cerrados.
- Cada monto se almacena como entero en unidades menores (`amountMinor`) y muestra moneda y regla de origen.
- Los porcentajes se almacenan como puntos básicos (`basisPoints`); la fórmula y el redondeo comercial se aplican una sola vez al final.
- Sólo compiten hospitales con una tarifa única, vigente, de la misma consulta inicial y moneda; los demás quedan excluidos con una razón.
- Una respuesta incompleta produce estado `needs_information`, no un valor aproximado inventado.
- Los datos de demo están marcados visiblemente como ficticios.
- El texto del síntoma vive sólo en memoria durante la consulta: no entra en historial, almacenamiento, logs ni exportación.

### Gate 0 — decisiones antes de ejecutar

- Confirmar Next.js/TypeScript/npm y registrar versiones exactas en `.nvmrc` y lockfile.
- Elegir el proveedor/modelo disponible para el evento y documentar su variable de entorno; nunca exponer la clave al navegador.
- Confirmar que el despliegue será una sola aplicación y que el modo demo puede operar con el doble local.
- Confirmar moneda, regla de redondeo y fórmula del dataset; si no existen, adoptar USD, unidades menores enteras y redondeo half-up documentado.
- Registrar estas decisiones en `docs/adr/0001-mvp-stack-and-rules.md` antes del Paso 1. **HECHO** (2026-09-15).

## 6. Modelo de datos mínimo

| Entidad | Campos esenciales |
|---|---|
| `PatientDemo` | `id`, `displayName`, `planId` |
| `InsurancePlan` | `id`, `name`, `currency`, `networkId`, `ruleVersion` |
| `Specialty` | `id`, `name`, `aliases`, `safetyNotes` |
| `Service` | `id`, `specialtyId`, `name`, `serviceType` (MVP: `initial_consultation`) |
| `CoverageRule` | `planId`, `serviceId`, `coverageType`, `fixedCopayMinor`, `coverageBasisPoints`, `precedence`, `effectiveFrom`, `effectiveTo` |
| `Hospital` | `id`, `name`, `networkIds`, `location`, `specialtyIds` |
| `HospitalRate` | `hospitalId`, `serviceId`, `referenceCostMinor`, `currency`, `effectiveFrom`, `effectiveTo` |
| `Estimate` | `id`, `patientDemoId`, `planId`, `serviceId`, `ruleVersion`, `breakdown`, `recommendedHospitalId`, `createdAt` |
| `AuditEvent` | `correlationId`, `eventType`, `durationMs`, `status`, `createdAt` |

### Contratos principales

```ts
type TriageResult =
  | { status: "emergency_warning"; messageCode: string }
  | { status: "needs_clarification"; question: string }
  | { status: "classified"; specialtyId: string; confidence: "high" | "medium" | "low" }
  | { status: "unavailable"; manualSelectionAllowed: true };

type Money = { amountMinor: number; currency: string };

type EstimateResult =
  | { status: "estimated"; patientDemoId: string; planId: string; serviceId: string;
      recommendedHospitalId: string; referenceCost: Money; coveredAmount: Money;
      patientCopay: Money; ruleVersion: string; breakdown: string[];
      alternatives: Array<{ hospitalId: string; patientCopay: Money }> }
  | { status: "not_covered"; planId: string; serviceId: string; ruleVersion: string; reasonCode: string }
  | { status: "needs_information"; missing: string[] }
  | { status: "no_compatible_hospitals"; planId: string; serviceId: string; reasonCode: string };
```

Los estados de `TriageResult` son mutuamente excluyentes: una emergencia no puede incluir especialidad, aclaración ni fallback manual.

## 7. Dirección UI/UX

UI/UX Pro Max recomendó un sistema **Accessible & Ethical** para salud: profesional, inclusivo y de alta confianza, sin gradientes púrpura/rosa típicos de interfaces genéricas de IA.

### Sistema visual

- Tipografía: Figtree para títulos y Noto Sans para cuerpo; base mínima de 16 px y altura de línea 1.5.
- Base de paleta: teal/verde. Pares aprobados inicialmente: texto `#134E4A` sobre `#F0FDFA`, blanco sobre primario `#0E7490` y negro sobre acento `#16A34A`; cada estado y botón debe validarse automáticamente antes de aceptarlo.
- Usar variables semánticas, no colores crudos dispersos por componentes.
- Controles táctiles de al menos 44 × 44 px y separación mínima de 8 px.
- Foco visible de 3–4 px; contraste mínimo 4.5:1 para texto normal.
- Iconos SVG consistentes; ningún emoji como icono funcional.
- Movimiento de 150–300 ms sólo para comunicar cambio de estado; respetar `prefers-reduced-motion`.

### Pantallas/componentes

- `WelcomeCard`: alcance, privacidad y aviso de no diagnóstico.
- `DemoIdentitySelector`: selección de persona/plan ficticio con etiqueta visible.
- `ConversationPanel`: mensajes, preguntas guiadas y alternativa manual.
- `ProgressStepper`: Datos → Especialidad → Cobertura → Resultado.
- `EstimateSummary`: copago destacado y estado de cobertura.
- `CoverageBreakdown`: fórmula legible y regla aplicada.
- `HospitalComparison`: tabla/tarjetas ordenadas por copago, sin depender sólo del color.
- `ErrorSummary`: foco programático, enlaces a campos e información de recuperación.

### Estados obligatorios

`idle`, `collecting`, `clarifying`, `calculating`, `success`, `not-covered`, `needs-information`, `emergency-warning`, `model-error` y `network-error`.

## 8. Plan de construcción

Cada paso cabe en un cambio revisable y puede ejecutarse con contexto frío. Como no hay remoto configurado, los nombres de rama son sugerencias para cuando el equipo lo añada.

### Paso 1 — Contratos, datos semilla y escenarios dorados

**Contexto:** el motor y la UI necesitan vocabulario estable antes de integrar IA.  
**Dependencias:** Gate 0.  
**Archivos propuestos:** `docs/domain.md`, `data/*.json`, `src/domain/*.ts`, `tests/fixtures/golden-cases.json`.

Tareas:

- Definir catálogos cerrados de especialidades, planes, reglas, hospitales y tarifas.
- Crear al menos 16 casos dorados: cubierto, no cubierto, tarifa faltante, duplicada o vencida, fuera de red, empate, fracciones, copago mayor que el precio y síntoma ambiguo.
- Documentar precedencia, fórmula de copago, límite `min(copago, precio)`, puntos básicos, redondeo final y reglas de desempate.
- Calcular expectativas con una hoja/oráculo independiente, no con la función que se pondrá a prueba.
- Crear fixtures de cada estado discriminado para que la UI trabaje sin endpoints.
- Marcar todo el dataset como ficticio.

Verificación:

- Un script mínimo de validación, incluido con los contratos, valida los JSON contra sus esquemas.
- Cada ID referenciado existe.
- Un cálculo manual por escenario coincide con el valor esperado.

Salida: contratos de dominio y fixtures aprobados.  
Rollback: revertir sólo datos/esquemas; ningún consumidor existe todavía.

### Paso 2 — Base del proyecto, calidad y despliegue temprano

**Contexto:** crear el esqueleto sin lógica de negocio.  
**Dependencias:** Paso 1 para fijar los tipos.  
**Archivos propuestos:** `package.json`, `src/app/**`, `src/components/**`, configuración de TypeScript, lint y pruebas.

Tareas:

- Inicializar el stack confirmado y scripts `dev`, `build`, `lint`, `typecheck`, `test` y `test:e2e`.
- Añadir tokens de color, tipografía, espaciado, radios y foco.
- Crear layout responsive, skip link y regiones semánticas.
- Configurar variables de entorno mediante `.env.example`, sin secretos.
- Crear un despliegue vacío y ejecutar un smoke test en navegador privado para resolver cuentas y permisos al inicio, no en la última hora.

Verificación:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Salida: aplicación vacía desplegable y accesible, lockfile y primera URL verde.  
Rollback: volver al commit/tag `step-1-green`; si se cambia de stack, hacerlo antes de aceptar este paso.

### Paso 3 — Motor determinista de cobertura y copago

**Contexto:** es el núcleo de precisión; no depende del LLM ni de la interfaz.  
**Dependencias:** Pasos 1 y 2. Puede ejecutarse en paralelo con Pasos 4 y 5.  
**Archivos propuestos:** `src/domain/estimate.ts`, `src/domain/rank-hospitals.ts`, `src/domain/errors.ts`, `tests/unit/estimate.test.ts`.

Tareas:

- Implementar validación de entradas y estados explícitos.
- Calcular cobertura/copago sólo con enteros, reglas versionadas, precedencia explícita y redondeo final.
- Ordenar hospitales por copago y aplicar desempate documentado.
- Generar un desglose estructurado, no texto opaco.
- Crear pruebas parametrizadas contra el oráculo independiente de los casos dorados.

Verificación:

- 100 % de los casos dorados pasan.
- Mismos datos + misma versión de reglas = mismo resultado.
- Ningún `NaN`, monto negativo o moneda mezclada llega a la API.

Salida: librería pura y probada.  
Rollback: feature flag `ESTIMATE_ENGINE=v1|mock`; volver al commit/tag `step-2-green` sin tocar contratos.

### Paso 4 — Agente conversacional y barreras de seguridad

**Contexto:** la IA transforma lenguaje natural en una especialidad del catálogo; no emite diagnóstico ni calcula dinero.  
**Dependencias:** Pasos 1 y 2. Puede ejecutarse en paralelo con Pasos 3 y 5.  
**Archivos propuestos:** `src/agent/provider.ts`, `src/agent/triage.ts`, `src/agent/schema.ts`, `src/app/api/triage/route.ts`, `tests/evals/triage.test.ts`.

Tareas:

- Crear interfaz de proveedor y un doble determinista para pruebas/demo offline.
- Diseñar prompt con salida estructurada y catálogo permitido.
- Validar respuesta; rechazar especialidades fuera del catálogo.
- Ejecutar el detector de señales de emergencia antes del proveedor; una coincidencia devuelve sólo `emergency_warning` y bloquea todos los pasos posteriores, incluso con proveedor caído o selección manual.
- Aclarar que el detector no garantiza descartar una emergencia y mostrar la acción local apropiada definida por el organizador/equipo.
- Limitar longitud y frecuencia; antes de enviar, informar que el texto se procesa por el proveedor configurado y no se guardará por la aplicación.
- Evaluar ambigüedad, prompt injection, idioma, ruido y fallos de red.

Verificación:

- El agente jamás devuelve una especialidad no registrada.
- El corpus delimitado de evaluación alcanza el umbral acordado en Gate 0 y registra errores; no se promete inmunidad universal a ataques.
- Entradas de ataque del corpus no alteran reglas, sistema ni formato de salida.
- Los casos de emergencia bloquean cálculo con proveedor disponible, caído y fallback manual.
- El modo fallback manual completa el recorrido sin LLM.

Salida: endpoint de clasificación seguro y reemplazable.  
Rollback: feature flag `TRIAGE_PROVIDER=remote|local|manual`; el guardrail previo permanece activo en todos los modos.

### Paso 5 — Experiencia conversacional accesible

**Contexto:** implementar el recorrido definido en la sección 4 y el sistema visual de la sección 7.  
**Dependencias:** Pasos 1 y 2; usa fixtures discriminados y mocks definidos en el Paso 1. Puede ejecutarse en paralelo con Pasos 3 y 4.  
**Archivos propuestos:** `src/app/page.tsx`, `src/components/conversation/**`, `src/components/estimate/**`, `src/styles/tokens.css`.

Tareas:

- Construir el flujo móvil primero con progreso y persistencia de estado de sesión.
- Implementar etiquetas visibles, ayuda contextual y validación al salir del campo.
- En fallo de envío, mover foco a un resumen enlazado con los campos inválidos y mantener errores inline.
- Usar skeleton/progreso estable con `aria-busy`; evitar spinner parpadeante.
- Implementar todos los estados obligatorios, incluidas pantallas sin resultados y recuperación.

Verificación:

- Navegación completa sólo con teclado.
- Sin scroll horizontal en 375/768/1024/1440 px.
- Orden de foco y anuncios del lector de pantalla coherentes.
- Contraste y targets táctiles cumplen el sistema definido.

Salida: flujo completo conectado a mocks.  
Rollback: activar `UI_DATA_SOURCE=fixtures` y volver al commit/tag `step-2-green` sin tocar dominio.

### Paso 6 — Integración y explicabilidad

**Contexto:** unir clasificación, confirmación humana, cálculo y ranking sin mezclar responsabilidades.  
**Dependencias:** Pasos 3, 4 y 5.  
**Archivos propuestos:** `src/app/api/estimate/route.ts`, `src/services/estimate-service.ts`, pruebas de integración.

Tareas:

- Conectar la especialidad confirmada al motor determinista.
- Mostrar fórmula, datos utilizados, versión de regla y sello “estimación”.
- Añadir correlación de eventos sin registrar texto clínico sensible.
- Mantener síntomas sólo en memoria y construir historial/exportación desde la allowlist: IDs ficticios de paciente, plan, servicio y hospital; montos; moneda; regla y fecha.
- Manejar timeouts, reintentos acotados e idempotencia del cálculo.

Verificación:

- Casos dorados pasan por API y UI con el mismo valor.
- El fallo del LLM no afecta el motor de cálculo.
- Refrescar la página no duplica eventos ni cambia resultados.

Salida: MVP integrado de extremo a extremo.  
Rollback: `UI_DATA_SOURCE=fixtures`, `TRIAGE_PROVIDER=local` y `ESTIMATE_ENGINE=mock`; ejecutar smoke test del caso feliz después del cambio.

### Paso 7 — Pruebas, evaluación y endurecimiento

**Contexto:** demostrar capacidad de análisis y criterio técnico, no sólo una ruta feliz.  
**Dependencias:** Paso 6.

Tareas:

- Unitarias: fórmulas, límites, monedas, reglas ausentes y ranking.
- Integración: contratos de API, validación, errores y fallback.
- Evals del agente: clasificación conocida, ambigüedad, urgencia e inyección.
- E2E: ruta feliz, no cubierto, sin tarifa, emergencia y caída del proveedor.
- Accesibilidad automatizada y revisión manual con teclado.
- Verificar que build y logs no contienen secretos o datos reales.
- Introducir datos personales sintéticos y comprobar su ausencia en logs, almacenamiento, historial y resumen exportado.
- Probar los seis recorridos alternos definidos en la sección 4, no una muestra de cuatro.

Verificación:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Salida: evidencia reproducible en README y CI cuando exista remoto.  
Rollback: mantener desplegado el tag `step-6-green`; bloquear promoción si falla cualquier caso financiero dorado, privacidad o guardrail crítico.

### Paso 8 — Demo, despliegue y entrega

**Contexto:** el documento exige una solución funcional pública y un repositorio GitHub/GitLab.  
**Dependencias:** Paso 7.

Tareas:

- Crear README con problema, arquitectura, datos ficticios, decisiones, instalación, pruebas y limitaciones.
- Añadir `Demo mode` visiblemente rotulado con los escenarios fijados en la sección 12.
- Desplegar y ejecutar smoke test contra la URL pública.
- Publicar el repositorio sin secretos y fijar instrucciones reproducibles. Que sea público es una decisión del equipo para facilitar evaluación, no una exigencia textual identificada en la fuente.
- Preparar correo a `hackiathon@viamatica.com` con ambos enlaces.

Verificación:

- Un navegador privado puede completar la demo sin configuración local.
- El repositorio nuevo puede instalar, probar y compilar siguiendo el README.
- El enlace funcional es público y el enlace del repositorio es accesible para evaluación; el correo preparado incluye ambos.

Salida: entrega lista para evaluación.  
Rollback: volver al tag/despliegue `step-7-green`, activar los tres flags de fallback y repetir smoke test; nunca enviar un enlace que dependa de servicios locales.

## 9. Dependencias y paralelismo

```text
Gate 0 → Paso 1 → Paso 2 → { Paso 3, Paso 4, Paso 5 } → Paso 6 → Paso 7 → Paso 8
```

- Ola 1: Paso 1.
- Ola 2: Paso 2 y despliegue temprano.
- Ola 3: Pasos 3, 4 y 5 en paralelo con contratos y fixtures estables.
- Ola 4: Pasos 6, 7 y 8 en serie.
- Revisiones de mayor rigor: contratos/reglas (Paso 1), motor financiero (Paso 3), seguridad del agente (Paso 4) y gate final (Paso 7).

## 10. Cronograma de hackathon sugerido

| Bloque | Resultado |
|---|---|
| 0–0.5 h | Gate 0: decisiones y ADR |
| 0.5–2.5 h | Dominio, datos y casos dorados |
| 2.5–4 h | Scaffold y despliegue vacío |
| 4–9 h | Motor, agente y UI en paralelo |
| 9–12 h | Integración y explicabilidad |
| 12–15 h | Pruebas, accesibilidad y fallos |
| 15–16 h | Despliegue, README, video/demo y entrega |

Si el tiempo se reduce, se conserva primero: cálculo determinista, agente real en al menos un caso, ranking, guardrail de emergencia, caso feliz, caso no cubierto, fallback reproducible, resultado explicable y despliegue público. Historial, descarga y video son recortables; el video no es un entregable identificado en la fuente.

## 11. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación / gate |
|---|---|---|
| El LLM inventa una especialidad | Alto | Catálogo cerrado, esquema, validación y selección manual |
| Copago incorrecto | Crítico | Motor puro, casos dorados y prohibición de cálculo por LLM |
| Se interpreta como consejo médico | Alto | Avisos, lenguaje de estimación, guardrail de emergencia y no diagnóstico |
| Faltan tarifas o cobertura | Alto | Estado `needs_information`; nunca completar con supuestos |
| Usuario escribe datos reales en la demo pública | Alto | Aviso previo, texto sólo en memoria, allowlist de persistencia/exportación y prueba de fuga sintética |
| Demo depende de red/proveedor | Medio | Doble local y feature flag de fallback |
| Interfaz parece un chat genérico | Medio | Progreso visible, confirmación, desglose y comparación accionable |
| Tiempo insuficiente | Medio | Cortes de alcance definidos y pasos paralelos |

## 12. Guion de demo

Los IDs y montos finales se congelan en `tests/fixtures/golden-cases.json`; hasta entonces se usan estos marcadores explícitos, no cifras inventadas:

| Escenario | Entrada fijada | Resultado esperado |
|---|---|---|
| `DEMO-COVERED-01` | Paciente `ANA-PLUS`; síntoma semilla → dermatología | Especialidad confirmable, monto `TBD-fixture`, tres hospitales ordenados |
| `DEMO-NOT-COVERED-01` | Paciente/servicio semilla no cubierto | `not_covered`, regla y siguiente paso; ningún monto fabricado |
| `DEMO-EMERGENCY-01` | Texto semilla marcado como señal de emergencia | `emergency_warning`; cero llamadas a cálculo/ranking |
| `DEMO-FALLBACK-01` | Proveedor remoto desactivado | Clasificación local/manual visible y cálculo reproducible |

1. Mostrar el aviso de alcance y el rótulo de datos ficticios.
2. Ejecutar `DEMO-COVERED-01`, confirmar la especialidad y explicar el desglose.
3. Ejecutar `DEMO-NOT-COVERED-01` para demostrar honestidad.
4. Ejecutar `DEMO-EMERGENCY-01` para demostrar el bloqueo.
5. Ejecutar `DEMO-FALLBACK-01` para demostrar resiliencia.
6. Cerrar con arquitectura, pruebas, URL funcional y repositorio.

## 13. Definición de terminado

- [ ] Se implementó sólo el Reto 3.
- [ ] La ruta feliz y los seis recorridos alternos de la sección 4 funcionan.
- [ ] Todos los casos dorados financieros pasan.
- [ ] El LLM está aislado del cálculo monetario.
- [ ] La interfaz cumple teclado, foco, contraste, lector de pantalla y responsive.
- [ ] Datos, limitaciones y aviso de no diagnóstico son visibles.
- [ ] No hay secretos ni datos personales reales.
- [ ] El texto libre no aparece en logs, almacenamiento, historial ni exportación.
- [ ] El guardrail de emergencia bloquea proveedor, selección manual, cálculo y ranking.
- [ ] `lint`, tipos, pruebas, E2E y build pasan.
- [ ] URL del agente funcional pública.
- [ ] Repositorio GitHub/GitLab accesible para evaluación con README reproducible.
- [ ] Correo preparado para `hackiathon@viamatica.com` con ambos enlaces.

## 14. Protocolo de cambios al plan

- **Dividir:** si un paso supera una jornada, crear subpasos conservando sus criterios de salida.
- **Insertar:** un nuevo paso debe declarar dependencias, archivos, verificación y rollback.
- **Reordenar:** sólo si el grafo de dependencias sigue siendo válido.
- **Omitir:** documentar por qué y qué criterio de terminado queda afectado.
- **Abandonar:** registrar el último estado verde y el procedimiento de recuperación.
