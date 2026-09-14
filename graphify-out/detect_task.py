import json
from pathlib import Path

from graphify.detect import detect

result = detect(Path("."))
Path("graphify-out/.graphify_detect.json").write_text(json.dumps(result))
print(f"Corpus: {result.get('total_files', 0)} files · ~{result.get('total_words', 0)} words")
for key, values in result.get("files", {}).items():
    if values:
        print(f"  {key}: {len(values)} files")
print(f"skipped_sensitive: {len(result.get('skipped_sensitive', []))}")
