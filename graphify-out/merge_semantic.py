import glob
import json
from pathlib import Path

from graphify.cache import save_semantic_cache

# The PDF fragment is already in Graphify's semantic cache. Only merge the
# newly added Markdown fragment to avoid duplicating cached PDF relationships.
chunks = ["graphify-out/.graphify_chunk_02.json"]
all_nodes, all_edges, all_hyperedges = [], [], []
total_in = total_out = 0
for chunk in chunks:
    data = json.loads(Path(chunk).read_text())
    all_nodes.extend(data.get("nodes", []))
    all_edges.extend(data.get("edges", []))
    all_hyperedges.extend(data.get("hyperedges", []))
    total_in += data.get("input_tokens", 0)
    total_out += data.get("output_tokens", 0)

new = {
    "nodes": all_nodes,
    "edges": all_edges,
    "hyperedges": all_hyperedges,
    "input_tokens": total_in,
    "output_tokens": total_out,
}
Path("graphify-out/.graphify_semantic_new.json").write_text(json.dumps(new, indent=2))
saved = save_semantic_cache(all_nodes, all_edges, all_hyperedges)

cached_path = Path("graphify-out/.graphify_cached.json")
cached = json.loads(cached_path.read_text()) if cached_path.exists() else {"nodes": [], "edges": [], "hyperedges": []}
seen = set()
deduped = []
for node in cached["nodes"] + all_nodes:
    if node["id"] not in seen:
        seen.add(node["id"])
        deduped.append(node)
merged_semantic = {
    "nodes": deduped,
    "edges": cached["edges"] + all_edges,
    "hyperedges": cached.get("hyperedges", []) + all_hyperedges,
    "input_tokens": total_in,
    "output_tokens": total_out,
}
Path("graphify-out/.graphify_semantic.json").write_text(json.dumps(merged_semantic, indent=2))

ast = json.loads(Path("graphify-out/.graphify_ast.json").read_text())
ast_ids = {node["id"] for node in ast["nodes"]}
merged_nodes = list(ast["nodes"]) + [node for node in deduped if node["id"] not in ast_ids]
final = {
    "nodes": merged_nodes,
    "edges": ast["edges"] + merged_semantic["edges"],
    "hyperedges": merged_semantic["hyperedges"],
    "input_tokens": total_in,
    "output_tokens": total_out,
}
Path("graphify-out/.graphify_extract.json").write_text(json.dumps(final, indent=2))
print(f"Merged {len(chunks)} chunks: {len(merged_nodes)} nodes, {len(final['edges'])} edges, {len(final['hyperedges'])} hyperedges; cached {saved} files")
