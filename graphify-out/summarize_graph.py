import json
from pathlib import Path

path = Path("graphify-out/.graphify_chunk_02.json")
data = json.loads(path.read_text(encoding="utf-8"))
for node in data["nodes"]:
    print(f"{node.get('source_location')}: {node.get('label')}")
