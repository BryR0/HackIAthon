# Graph Report - HackIAthon  (2026-09-14)

## Corpus Check
- 3 files · ~4,357 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 116 nodes · 128 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 97% EXTRACTED · 2% INFERRED · 1% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `67e3e7d6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Auditoría de siniestros|Auditoría de siniestros]]
- [[_COMMUNITY_Reglas del hackIAthon|Reglas del hackIAthon]]
- [[_COMMUNITY_Alertas de emergencias|Alertas de emergencias]]
- [[_COMMUNITY_Copago y cobertura|Copago y cobertura]]
- [[_COMMUNITY_Bienestar preventivo|Bienestar preventivo]]
- [[_COMMUNITY_Preautorización quirúrgica|Preautorización quirúrgica]]
- [[_COMMUNITY_Actores y datos clínicos|Actores y datos clínicos]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]

## God Nodes (most connected - your core abstractions)
1. `Blueprint de implementación — Reto 3: Estimador Agéntico de Copago y Cobertura` - 15 edges
2. `Reto 1: Agente de Pre-AutorizaciÃ³n QuirÃºrgica en Tiempo Real` - 10 edges
3. `8. Plan de construcción` - 9 edges
4. `Reto 2: Auditor AgÃ©ntico de FacturaciÃ³n de Siniestros` - 9 edges
5. `Reto 3: Estimador AgÃ©ntico de Copago y Cobertura para el Paciente` - 8 edges
6. `SelecciÃ³n de un Ãºnico reto` - 7 edges
7. `Listado de retos` - 6 edges
8. `SoluciÃ³n funcional` - 6 edges
9. `Reto 5: Agente de Bienestar Preventivo y GamificaciÃ³n de Salud` - 6 edges
10. `Reto 4: Sistema de Alerta Temprana de Ingresos a Emergencias` - 5 edges

## Surprising Connections (you probably didn't know these)
- `hackIAthon` --references--> `Viamatica`  [AMBIGUOUS]
  hackIAthon-retos-filtro.pdf → hackIAthon-retos-filtro.md
- `Reto 1: Agente de Pre-AutorizaciÃ³n QuirÃºrgica en Tiempo Real` --targets--> `Espera de horas o dÃ­as por autorizaciÃ³n quirÃºrgica`  [EXTRACTED]
  hackIAthon-retos-filtro.pdf → hackIAthon-retos-filtro.md
- `Reto 2: Auditor AgÃ©ntico de FacturaciÃ³n de Siniestros` --requires--> `DocumentaciÃ³n y facturas del siniestro`  [EXTRACTED]
  hackIAthon-retos-filtro.pdf → hackIAthon-retos-filtro.md
- `Reto 2: Auditor AgÃ©ntico de FacturaciÃ³n de Siniestros` --delivers--> `DetecciÃ³n de discrepancias o cobros duplicados`  [EXTRACTED]
  hackIAthon-retos-filtro.pdf → hackIAthon-retos-filtro.md
- `hackiathon@viamatica.com` --references--> `Viamatica`  [EXTRACTED]
  hackIAthon-retos-filtro.pdf → hackIAthon-retos-filtro.md

## Hyperedges (group relationships)
- **Flujo de preautorizaciÃ³n quirÃºrgica en tiempo real** — hackiathon_retos_filtro_informe_medico_digital, hackiathon_retos_filtro_poliza_del_paciente, hackiathon_retos_filtro_base_de_datos_de_notion, hackiathon_retos_filtro_preaprobacion_quirurgica, hackiathon_retos_filtro_solicitud_de_documentos_faltantes [EXTRACTED 1.00]
- **Flujo de alerta simultÃ¡nea por ingreso a emergencias** — hackiathon_retos_filtro_ingreso_a_emergencias, hackiathon_retos_filtro_webhook_de_ingreso_a_emergencias, hackiathon_retos_filtro_validez_de_la_poliza, hackiathon_retos_filtro_historial_de_preexistencias, hackiathon_retos_filtro_departamento_de_admisiones, hackiathon_retos_filtro_gestor_de_casos [EXTRACTED 1.00]
- **Ciclo de prevenciÃ³n e incentivos de salud** — hackiathon_retos_filtro_diagnosticos_frecuentes_anonimizados, hackiathon_retos_filtro_campanas_de_prevencion, hackiathon_retos_filtro_cumplimiento_del_chequeo, hackiathon_retos_filtro_beneficios_o_descuentos, hackiathon_retos_filtro_crm_de_notion [EXTRACTED 1.00]
- **Flujo de preautorizaciÃ³n quirÃºrgica en tiempo real** — hackiathon_retos_filtro_informe_medico_digital, hackiathon_retos_filtro_poliza_del_paciente, hackiathon_retos_filtro_base_de_datos_de_notion, hackiathon_retos_filtro_preaprobacion_quirurgica, hackiathon_retos_filtro_solicitud_de_documentos_faltantes [EXTRACTED 1.00]
- **Flujo de alerta simultÃ¡nea por ingreso a emergencias** — hackiathon_retos_filtro_ingreso_a_emergencias, hackiathon_retos_filtro_webhook_de_ingreso_a_emergencias, hackiathon_retos_filtro_validez_de_la_poliza, hackiathon_retos_filtro_historial_de_preexistencias, hackiathon_retos_filtro_departamento_de_admisiones, hackiathon_retos_filtro_gestor_de_casos [EXTRACTED 1.00]
- **Ciclo de prevenciÃ³n e incentivos de salud** — hackiathon_retos_filtro_diagnosticos_frecuentes_anonimizados, hackiathon_retos_filtro_campanas_de_prevencion, hackiathon_retos_filtro_cumplimiento_del_chequeo, hackiathon_retos_filtro_beneficios_o_descuentos, hackiathon_retos_filtro_crm_de_notion [EXTRACTED 1.00]

## Communities (10 total, 1 thin omitted)

### Community 0 - "Auditoría de siniestros"
Cohesion: 0.07
Nodes (27): 10. Cronograma de hackathon sugerido, 11. Riesgos y mitigaciones, 12. Guion de demo, 13. Definición de terminado, 14. Protocolo de cambios al plan, 1. Decisión, 2. Objetivo y criterios de éxito, 3. Alcance (+19 more)

### Community 1 - "Reglas del hackIAthon"
Cohesion: 0.13
Nodes (17): Agente conversacional, Reto 1: Agente de Pre-AutorizaciÃ³n QuirÃºrgica en Tiempo Real, AnÃ¡lisis de cobertura del procedimiento, Base de datos de Notion, CÃ¡lculo exacto del copago, CRM de Notion, Espera de horas o dÃ­as por autorizaciÃ³n quirÃºrgica, Reto 3: Estimador AgÃ©ntico de Copago y Cobertura para el Paciente (+9 more)

### Community 2 - "Alertas de emergencias"
Cohesion: 0.23
Nodes (12): Reto 2: Auditor AgÃ©ntico de FacturaciÃ³n de Siniestros, DetecciÃ³n de cobros duplicados, DetecciÃ³n de discrepancias, DetecciÃ³n de discrepancias o cobros duplicados, DocumentaciÃ³n del siniestro, DocumentaciÃ³n y facturas del siniestro, Facturas del taller, Insumos y honorarios cobrados (+4 more)

### Community 3 - "Copago y cobertura"
Cohesion: 0.17
Nodes (12): Reto 4: Sistema de Alerta Temprana de Ingresos a Emergencias, Asegurado, Aseguradora, Cumplimiento del chequeo en el hospital, Departamento de admisiones del hospital, Gestor de casos del seguro, Historial de pre-existencias, Ingreso a la emergencia del hospital (+4 more)

### Community 4 - "Bienestar preventivo"
Cohesion: 0.18
Nodes (11): 8. Plan de construcción, code:bash (npm run lint), code:bash (npm run lint), Paso 1 — Contratos, datos semilla y escenarios dorados, Paso 2 — Base del proyecto, calidad y despliegue temprano, Paso 3 — Motor determinista de cobertura y copago, Paso 4 — Agente conversacional y barreras de seguridad, Paso 5 — Experiencia conversacional accesible (+3 more)

### Community 5 - "Preautorización quirúrgica"
Cohesion: 0.22
Nodes (11): Capacidad de anÃ¡lisis, hackiathon@viamatica.com, Criterio tÃ©cnico, EjecuciÃ³n con herramientas de IA, Enlace del repositorio en GitHub o GitLab, Enlace pÃºblico del agente funcional, hackIAthon, Participante del hackIAthon (+3 more)

### Community 6 - "Actores y datos clínicos"
Cohesion: 0.2
Nodes (9): 1. Agente de Pre-Autorización Quirúrgica en Tiempo Real, 2. Auditor Agéntico de Facturación de Siniestros, 3. Estimador Agéntico de Copago y Cobertura para el Paciente, 4. Sistema de Alerta Temprana de Ingresos a Emergencias, 5. Agente de Bienestar Preventivo y Gamificación de Salud, Detalle de los entregables, hackIAthon – Retos Filtro, Introducción (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (9): Reto 5: Agente de Bienestar Preventivo y GamificaciÃ³n de Salud, Beneficios o descuentos automÃ¡ticos, CampaÃ±as de prevenciÃ³n especÃ­ficas, Chequeos preventivos de prÃ³stata o mamas, DiagnÃ³sticos frecuentes anonimizados, Especialidad hospitalaria sugerida, Hospital, Informe mÃ©dico digital (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.5
Nodes (4): 4. Usuarios y recorridos, Recorrido feliz, Recorridos alternos obligatorios, Usuario principal

## Ambiguous Edges - Review These
- `hackIAthon` → `Viamatica`  [AMBIGUOUS]
  hackIAthon-retos-filtro.md · relation: references

## Knowledge Gaps
- **52 isolated node(s):** `Detalle de los entregables`, `1. Agente de Pre-Autorización Quirúrgica en Tiempo Real`, `2. Auditor Agéntico de Facturación de Siniestros`, `3. Estimador Agéntico de Copago y Cobertura para el Paciente`, `4. Sistema de Alerta Temprana de Ingresos a Emergencias` (+47 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `hackIAthon` and `Viamatica`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `SelecciÃ³n de un Ãºnico reto` connect `Preautorización quirúrgica` to `Reglas del hackIAthon`, `Alertas de emergencias`, `Copago y cobertura`, `Community 7`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Why does `Blueprint de implementación — Reto 3: Estimador Agéntico de Copago y Cobertura` connect `Auditoría de siniestros` to `Community 8`, `Bienestar preventivo`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `Reto 2: Auditor AgÃ©ntico de FacturaciÃ³n de Siniestros` connect `Alertas de emergencias` to `Copago y cobertura`, `Preautorización quirúrgica`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **What connects `Detalle de los entregables`, `1. Agente de Pre-Autorización Quirúrgica en Tiempo Real`, `2. Auditor Agéntico de Facturación de Siniestros` to the rest of the system?**
  _52 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auditoría de siniestros` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Reglas del hackIAthon` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._