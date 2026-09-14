import json
from datetime import datetime, timezone
from pathlib import Path

from graphify.detect import save_manifest

detect = json.loads(Path("graphify-out/.graphify_detect.json").read_text(encoding="utf-8"))
save_manifest(detect["files"])
extract = json.loads(Path("graphify-out/.graphify_extract.json").read_text(encoding="utf-8"))
input_tokens = extract.get("input_tokens", 0)
output_tokens = extract.get("output_tokens", 0)
cost_path = Path("graphify-out/cost.json")
cost = json.loads(cost_path.read_text(encoding="utf-8")) if cost_path.exists() else {
    "runs": [], "total_input_tokens": 0, "total_output_tokens": 0
}
cost["runs"].append({
    "date": datetime.now(timezone.utc).isoformat(),
    "input_tokens": input_tokens,
    "output_tokens": output_tokens,
    "files": detect.get("total_files", 0),
})
cost["total_input_tokens"] += input_tokens
cost["total_output_tokens"] += output_tokens
cost_path.write_text(json.dumps(cost, indent=2), encoding="utf-8")
print(f"This run: {input_tokens:,} input tokens, {output_tokens:,} output tokens")
print(f"All time: {cost['total_input_tokens']:,} input, {cost['total_output_tokens']:,} output ({len(cost['runs'])} runs)")
