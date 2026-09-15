# Dominio: cobertura, copago y comparación de hospitales

Especificación normativa del cálculo. Cuando el código y este documento
discrepen, gana este documento y el código es el defecto.

- Contratos TypeScript: [`src/domain/types.ts`](../src/domain/types.ts)
- Catálogos: [`data/`](../data)
- Oráculo independiente: [`scripts/oracle.py`](../scripts/oracle.py)
- Validador: [`scripts/validate-data.mjs`](../scripts/validate-data.mjs)
- Casos dorados: [`tests/fixtures/golden-cases.json`](../tests/fixtures/golden-cases.json)

Todos los datos son **ficticios**. Cada catálogo lo declara con
`"fictional": true` y el validador lo exige.

## 1. Representación de valores

| Concepto | Representación | Ejemplo |
|---|---|---|
| Dinero | Entero en unidades menores (centavos) | `1951` = USD 19.51 |
| Porcentaje | Entero en puntos básicos, 0..10000 | `7000` = 70 % |
| Fecha | ISO 8601 `YYYY-MM-DD`, sin hora ni zona | `2026-09-15` |
| Vigencia abierta | `effectiveTo: null` | — |

Nunca se usa punto flotante para dinero ni porcentajes. El motor no acepta
`NaN`, montos negativos ni mezcla de monedas.

## 2. Fecha de cálculo

Todo cálculo se evalúa contra una fecha `asOf`. Los casos dorados la fijan en
**`2026-09-15`** para que el resultado sea reproducible.

Vigencia **inclusiva en ambos extremos**:

```
vigente(fila, asOf)  ⟺  asOf >= effectiveFrom
                    ∧  (effectiveTo == null ∨ asOf <= effectiveTo)
```

## 3. Selección de la regla de cobertura

Dado `(planId, serviceId, asOf)`:

1. Filtrar las reglas de ese plan y servicio.
2. Si no hay ninguna → `needs_information`, `missing: ["coverage_rule_missing"]`.
3. Conservar solo las vigentes a `asOf`.
4. Si no queda ninguna → `needs_information`, `missing: ["coverage_rule_expired"]`.
5. Entre las vigentes, gana la de **`precedence` menor**.
6. Si dos vigentes empatan en `precedence` → **error de datos**, no una
   elección arbitraria. El validador lo bloquea antes de llegar al motor.

Ejemplo real del dataset: `PLAN-PLUS` sobre `SVC-PEDIATRIA-CI` tiene la regla
base `CR-PLUS-PED-BASE` (`precedence 200`, 50 %) y la campaña
`CR-PLUS-PED-CAMPANA` (`precedence 10`, 80 %, vigente jun–dic 2026). A
`2026-09-15` gana la campaña.

Si la regla ganadora es `not_covered` → estado `not_covered` con
`reasonCode: "service_excluded_by_plan"`. No se compara ni se calcula nada.

## 4. Fórmula del copago

Se aplica una sola vez, sobre la tarifa del hospital.

**Copago fijo**

```
copago   = min(fixedCopayMinor, referenceCostMinor)
cubierto = referenceCostMinor − copago
```

El `min` importa: `PLAN-BASICO` cobra USD 99.00 de copago en urología, pero
`HOSP-LITORAL` cobra USD 80.00 por la consulta. El paciente paga 80.00, no
99.00. Un copago nunca supera el precio.

**Coseguro**

```
cubierto = half_up(referenceCostMinor × coverageBasisPoints / 10000)
copago   = referenceCostMinor − cubierto
```

El redondeo comercial **half-up** se aplica **solo al monto cubierto**, una
única vez. El copago sale de una resta entera exacta, así que no hay un segundo
redondeo y `cubierto + copago == referencia` siempre.

Caso `.5` exacto en el dataset: `HOSP-PACIFICO` cobra `6505` por dermatología y
`PLAN-PLUS` cubre 70 %.

```
6505 × 7000 / 10000 = 4553.5  → half_up → 4554
copago = 6505 − 4554 = 1951   (USD 19.51)
```

Los extremos también son válidos: `coverageBasisPoints: 0` significa cubierto
pero sin beneficio (copago = precio completo), y `10000` significa copago cero.
Ninguno de los dos es lo mismo que `not_covered`, que es una exclusión del plan.

### Implementaciones independientes

`scripts/oracle.py` usa `Decimal` con `ROUND_HALF_UP`. El motor de Paso 3 usará
aritmética entera (`(a × bp + 5000) / 10000` truncado). Son dos caminos
distintos a propósito: si coinciden en los 18 casos, el acuerdo es evidencia;
si uno se equivoca, el desacuerdo lo delata.

## 5. Elegibilidad de un hospital

Se evalúan **todos** los hospitales del catálogo, en este orden. El primer
motivo que aplique excluye y detiene la evaluación de ese hospital.

| Orden | Motivo | Condición |
|---|---|---|
| 1 | `out_of_network` | El `networkId` del plan no está en `hospital.networkIds` |
| 2 | `specialty_not_offered` | La especialidad del servicio no está en `hospital.specialtyIds` |
| 3 | `no_rate` | No existe ninguna fila de tarifa para `(hospital, servicio)` |
| 4 | `expired_rate` | Existen tarifas, pero ninguna vigente a `asOf` |
| 5 | `ambiguous_rate` | Hay **más de una** tarifa vigente |
| 6 | `currency_mismatch` | La moneda de la tarifa difiere de la del plan |

`no_rate` y `expired_rate` se distinguen a propósito: "nunca tuvimos precio" y
"el precio caducó" son problemas operativos distintos.

`ambiguous_rate` no elige la más barata ni la más reciente. Con dos tarifas
vigentes, cualquier elección sería una suposición, y el plan prohíbe suponer.

Si ningún hospital queda elegible → `no_compatible_hospitals`, con la lista
completa de exclusiones y su motivo. Nunca una pantalla vacía.

## 6. Orden de la comparación

Los hospitales elegibles se ordenan por:

1. `patientCopayMinor` ascendente — lo que de verdad paga el paciente.
2. `referenceCostMinor` ascendente — a igual copago, el precio menor.
3. `hospitalId` ascendente — desempate final, puramente determinista.

El tercer criterio existe para que el resultado sea reproducible, no porque
tenga sentido clínico o económico. Hace falta: con copago fijo, todos los
hospitales de la red empatan en copago.

El primero de la lista es `recommendedHospitalId`. La lista completa viaja en
`alternatives` para que el paciente vea de dónde sale la recomendación.

## 7. Estados de salida

Ver `EstimateResult` y `TriageResult` en
[`src/domain/types.ts`](../src/domain/types.ts). Son uniones discriminadas y
mutuamente excluyentes.

| Estado | Cuándo | Trae montos |
|---|---|---|
| `estimated` | Regla vigente y al menos un hospital elegible | Sí |
| `not_covered` | La regla ganadora excluye el servicio | No |
| `needs_information` | Falta la regla o está vencida | No |
| `no_compatible_hospitals` | Regla válida, cero hospitales elegibles | No |

La prohibición es la misma en los tres estados sin montos: **no se inventa una
cifra aproximada**.

En triage, `emergency_warning` es terminal dentro de esa consulta y no puede
coexistir con `specialtyId`, `question` ni `manualSelectionAllowed`. El
validador lo comprueba sobre los casos dorados.

## 8. Cómo se verifica

```bash
python scripts/oracle.py
```

```bash
node scripts/validate-data.mjs
```

`python scripts/oracle.py --emit` regenera
`tests/fixtures/golden-cases.json`.

El validador comprueba forma, unicidad de ids, integridad referencial, rangos
de dinero y puntos básicos, coherencia de fechas, consistencia entre
`coverageType` y sus campos, ausencia de empates de `precedence`, y sobre los
casos dorados: que `cubierto + copago == referencia`, que el copago no supere
el precio, que el recomendado sea efectivamente el de copago más bajo, y que
haya al menos 16 casos de estimación.

Se comprobó que el validador detecta defectos reales, no solo que pasa: con una
FK rota, un `coverageBasisPoints` de 12000 y un empate de `precedence`
inyectados a propósito, reportó los tres y salió con código 1.

## 9. Fuera de alcance del MVP

Deducibles acumulados, coseguro escalonado, límites anuales, copagos por
evento, comparación entre procedimientos distintos y conversión de moneda. El
MVP compara **una consulta inicial de la misma especialidad** entre hospitales,
en una sola moneda.

## 10. Desviación respecto del Blueprint

El Blueprint (sección 6) propuso `EstimateResult` con objetos `Money` por
monto. La implementación usa campos planos `*Minor` más un único `currency` a
nivel del resultado.

Motivo: en el MVP todos los montos de una estimación comparten la moneda del
plan — un hospital con otra moneda queda excluido con `currency_mismatch` antes
de calcular. Repetir `currency` en cada monto sugeriría que pueden diferir. El
tipo `Money` se conserva para los límites donde la moneda no sea implícita.
