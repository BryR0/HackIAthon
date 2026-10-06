#!/usr/bin/env sh
# Senal TVN - arranque en Linux/macOS. Solo requiere Python 3.12+ instalado.
# Crea .env si falta, instala requirements.txt, libera el puerto e inicia el servidor.
set -eu
cd "$(dirname "$0")"

PY=""
for candidato in python3.13 python3.12 python3 python; do
  if command -v "$candidato" >/dev/null 2>&1; then
    PY="$candidato"
    break
  fi
done

if [ -z "$PY" ]; then
  echo "[server_start] ERROR: no se encontro Python. Instala Python 3.12 o superior." >&2
  exit 1
fi

exec "$PY" scripts/server_start.py "$@"
