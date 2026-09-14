import json
from pathlib import Path

from graphify.analyze import suggest_questions
from graphify.build import build_from_json
from graphify.report import generate

extraction = json.loads(Path("graphify-out/.graphify_extract.json").read_text(encoding="utf-8"))
detection = json.loads(Path("graphify-out/.graphify_detect.json").read_text(encoding="utf-8"))
analysis = json.loads(Path("graphify-out/.graphify_analysis.json").read_text(encoding="utf-8"))
graph = build_from_json(extraction)
communities = {int(key): value for key, value in analysis["communities"].items()}
cohesion = {int(key): value for key, value in analysis["cohesion"].items()}
labels = {
    0: "Auditoría de siniestros",
    1: "Reglas del hackIAthon",
    2: "Alertas de emergencias",
    3: "Copago y cobertura",
    4: "Bienestar preventivo",
    5: "Preautorización quirúrgica",
    6: "Actores y datos clínicos",
}
tokens = {"input": extraction.get("input_tokens", 0), "output": extraction.get("output_tokens", 0)}
questions = suggest_questions(graph, communities, labels)
report = generate(graph, communities, cohesion, labels, analysis["gods"], analysis["surprises"], detection, tokens, ".", suggested_questions=questions)
Path("graphify-out/GRAPH_REPORT.md").write_text(report, encoding="utf-8")
Path("graphify-out/.graphify_labels.json").write_text(json.dumps({str(key): value for key, value in labels.items()}, ensure_ascii=False), encoding="utf-8")
print("Report updated with community labels")
