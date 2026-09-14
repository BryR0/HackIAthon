import json
from pathlib import Path

analysis = json.loads(Path("graphify-out/.graphify_analysis.json").read_text(encoding="utf-8"))
extraction = json.loads(Path("graphify-out/.graphify_extract.json").read_text(encoding="utf-8"))
labels = {node["id"]: node["label"] for node in extraction["nodes"]}
for community_id, node_ids in analysis["communities"].items():
    print(f"COMMUNITY {community_id} cohesion={analysis['cohesion'][community_id]}")
    for node_id in node_ids:
        print(f"- {labels.get(node_id, node_id)}")
