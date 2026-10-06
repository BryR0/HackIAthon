# Bitácora de ejecución

Registro hecho **durante** el trabajo (reto §5: "registro durante la ejecución,
no solo un resumen final"). Hora de Panamá (UTC−5). Cada entrada con commit de
respaldo en la rama `parte-2/tvn-senal-decision`.

| Fecha y hora | Qué pasó | Evidencia |
|---|---|---|
| 2026-10-06 ~12:30 | Análisis del reto TVN; se crea la rama de la Parte 2 sin tocar la Parte 1 | rama `parte-2/tvn-senal-decision` |
| 2026-10-06 ~13:00 | Validación del plan con 3 agentes revisores (arquitectura, cobertura de requisitos, reuso de `docversion`). Veredicto: aprobar con cambios | plan §0 |
| 2026-10-06 ~13:15 | Cotejo con el PDF original: se recuperan las 9 URLs de fuentes que el `.md` había perdido | plan §6.1 |
| 2026-10-06 13:30 | Plan v2 publicado | `ec3ef9f` |
| 2026-10-06 13:36 | **Decisión:** stack Python + FastAPI en lugar de Next.js (ADR 0002) | `be85aa9` |
| 2026-10-06 13:41 | Validación del snapshot (T01) en verde | `67e4e58` |
| 2026-10-06 13:44 | Parsers de TVN RSS, GDELT, Banco Mundial y USGS | `b7187e0` |
| 2026-10-06 13:49 | Extracción y snapshot determinista. **Hallazgo:** la cuadrícula del reto da 540 filas, no 1.350 | `b297e02` |
| 2026-10-06 13:52 | Clasificación por embeddings con abstención + baseline + agrupación (T02) | `2052bf3` |
| 2026-10-06 13:53 | Motor de puntaje con reglas versionadas (T08) | `d43d6c3` |
| 2026-10-06 13:55 | Procedencia independiente (CU-03) y estado de evidencia | `5e33ecf` |
| 2026-10-06 ~13:45 | **Prueba fallida:** pytest no podía escribir en la carpeta temporal del sistema (`PermissionError`). **Corrección:** carpeta temporal dentro del proyecto | `pyproject.toml` |
| 2026-10-06 ~13:47 | **Prueba fallida:** se esperaban 1.350 indicadores y salieron 540. **Corrección:** la prueba replicaba la errata del reto; el código era correcto | `b297e02` |
| 2026-10-06 ~13:45 | GDELT responde 429 (límite 1 consulta / 5 s). Extracción con espera creciente en segundo plano | `extraccion.py` |
| 2026-10-06 14:04 | Se quitan preguntas al organizador que el reto ya responde | `573596c` |
| 2026-10-06 ~14:10 | Organizador: "avancen con el desarrollo, documenten todo"; Notion se habilita después. Se crea este espacio local | `docs/notion/` |
