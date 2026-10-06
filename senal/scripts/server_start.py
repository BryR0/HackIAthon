"""Lanzador multiplataforma de Señal TVN: solo requiere Python 3.12 instalado.

Pasos:
1. Verifica Python >= 3.12.
2. Crea ``.env`` desde ``.env.example`` si no existe.
3. Crea el entorno virtual ``.venv`` y asegura ``pip``.
4. Instala ``requirements.txt`` (solo si cambió desde la última instalación).
5. Libera el puerto (``SENAL_PUERTO``, 8765 por defecto) cerrando el proceso que lo escucha.
6. Inicia el servidor en http://127.0.0.1:<puerto>.

Usa solo la biblioteca estándar: se ejecuta antes de instalar dependencias.
Lo invocan ``server_start.bat`` (Windows) y ``server_start.sh`` (Linux/macOS).
"""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
VENV = RAIZ / ".venv"
REQUISITOS = RAIZ / "requirements.txt"
MARCA = VENV / ".requirements.sha256"
PYTHON_MINIMO = (3, 12)
PUERTO_POR_DEFECTO = 8765
HOST = "127.0.0.1"
ES_WINDOWS = os.name == "nt"
ESPERA_PUERTO_S = 10.0


def info(mensaje: str) -> None:
    print(f"[server_start] {mensaje}", flush=True)


def fallar(mensaje: str) -> None:
    print(f"[server_start] ERROR: {mensaje}", file=sys.stderr, flush=True)
    raise SystemExit(1)


def leer_env(ruta: Path) -> dict[str, str]:
    """Parser mínimo de .env (CLAVE=valor, comentarios con #, comillas opcionales)."""
    valores: dict[str, str] = {}
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        valores[clave.strip()] = valor.strip().strip('"').strip("'")
    return valores


def pids_netstat_windows(salida: str, puerto: int) -> set[int]:
    """PIDs en estado LISTENING exactamente en ``puerto`` según ``netstat -ano``."""
    pids: set[int] = set()
    for linea in salida.splitlines():
        partes = linea.split()
        if len(partes) < 5 or partes[0].upper() != "TCP" or partes[3].upper() != "LISTENING":
            continue
        if partes[1].rsplit(":", 1)[-1] == str(puerto) and partes[4].isdigit():
            pids.add(int(partes[4]))
    return pids


def pids_ss_linux(salida: str, puerto: int) -> set[int]:
    """PIDs en LISTEN exactamente en ``puerto`` según ``ss -ltnp``."""
    pids: set[int] = set()
    for linea in salida.splitlines():
        partes = linea.split()
        if len(partes) < 4 or partes[0] != "LISTEN":
            continue
        if partes[3].rsplit(":", 1)[-1] == str(puerto):
            pids.update(int(p) for p in re.findall(r"pid=(\d+)", linea))
    return pids


def _hash(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def necesita_instalar(requisitos: Path, marca: Path) -> bool:
    return not marca.exists() or marca.read_text(encoding="utf-8").strip() != _hash(requisitos)


def registrar_instalacion(requisitos: Path, marca: Path) -> None:
    marca.parent.mkdir(parents=True, exist_ok=True)
    marca.write_text(_hash(requisitos), encoding="utf-8")


def python_del_venv() -> Path:
    return VENV / ("Scripts/python.exe" if ES_WINDOWS else "bin/python")


def ejecutar(comando: list[str]) -> None:
    resultado = subprocess.run(comando, cwd=RAIZ, check=False)  # noqa: S603
    if resultado.returncode != 0:
        fallar(f"falló el comando: {' '.join(comando)}")


def verificar_python() -> None:
    if sys.version_info < PYTHON_MINIMO:
        version = ".".join(map(str, sys.version_info[:3]))
        fallar(f"se requiere Python 3.12 o superior (encontrado {version}).")
    info(f"Python {sys.version.split()[0]} OK")


def preparar_env() -> dict[str, str]:
    env, ejemplo = RAIZ / ".env", RAIZ / ".env.example"
    if not env.exists():
        if not ejemplo.exists():
            fallar("no existe .env ni .env.example")
        shutil.copyfile(ejemplo, env)
        info(".env no existía: creado desde .env.example (edítalo para agregar credenciales).")
    else:
        info(".env encontrado")
    return leer_env(env)


def preparar_venv() -> Path:
    python = python_del_venv()
    if not python.exists():
        info("Creando entorno virtual .venv ...")
        creado = subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=False)  # noqa: S603
        if creado.returncode != 0:
            fallar("no se pudo crear .venv (en Debian/Ubuntu instala python3-venv).")
    pip_ok = subprocess.run(  # noqa: S603
        [str(python), "-m", "pip", "--version"], capture_output=True, check=False
    )
    if pip_ok.returncode != 0:
        info("Instalando pip en .venv ...")
        ejecutar([str(python), "-m", "ensurepip", "--upgrade"])
    return python


def instalar_dependencias(python: Path) -> None:
    if not necesita_instalar(REQUISITOS, MARCA):
        info("Dependencias al día (requirements.txt sin cambios).")
        return
    info("Instalando dependencias de requirements.txt (la primera vez tarda varios minutos)...")
    ejecutar([str(python), "-m", "pip", "install", "--upgrade", "pip"])
    ejecutar([str(python), "-m", "pip", "install", "-r", str(REQUISITOS)])
    registrar_instalacion(REQUISITOS, MARCA)
    info("Dependencias instaladas.")


def _puerto_ocupado(puerto: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((HOST, puerto)) == 0


def _salida(comando: list[str]) -> str:
    resultado = subprocess.run(comando, capture_output=True, text=True, check=False)  # noqa: S603
    return resultado.stdout


def _pids_en_puerto(puerto: int) -> set[int]:
    if ES_WINDOWS:
        return pids_netstat_windows(_salida(["netstat", "-ano"]), puerto)
    if shutil.which("lsof"):
        salida = _salida(["lsof", "-nP", f"-iTCP:{puerto}", "-sTCP:LISTEN", "-t"])
        return {int(p) for p in salida.split() if p.isdigit()}
    if shutil.which("ss"):
        return pids_ss_linux(_salida(["ss", "-ltnp"]), puerto)
    return set()


def _terminar(pid: int, forzar: bool = False) -> None:
    if ES_WINDOWS:
        _salida(["taskkill", "/PID", str(pid), "/T", "/F"])
        return
    try:
        os.kill(pid, signal.SIGKILL if forzar else signal.SIGTERM)
    except ProcessLookupError:
        return


def _esperar_libre(puerto: int) -> bool:
    limite = time.monotonic() + ESPERA_PUERTO_S
    while _puerto_ocupado(puerto) and time.monotonic() < limite:
        time.sleep(0.3)
    return not _puerto_ocupado(puerto)


def liberar_puerto(puerto: int) -> None:
    pids = _pids_en_puerto(puerto) - {os.getpid()}
    if not pids and not _puerto_ocupado(puerto):
        info(f"Puerto {puerto} libre.")
        return
    if not pids:
        fallar(f"el puerto {puerto} está ocupado y no se pudo identificar el proceso.")
    for pid in sorted(pids):
        info(f"Cerrando proceso {pid} que escuchaba en el puerto {puerto}.")
        _terminar(pid)
    if not _esperar_libre(puerto):
        for pid in pids:
            _terminar(pid, forzar=True)
        if not _esperar_libre(puerto):
            fallar(f"no se pudo liberar el puerto {puerto}.")
    info(f"Puerto {puerto} liberado.")


def iniciar_servidor(python: Path, puerto: int) -> None:
    info(f"Iniciando Señal TVN en http://{HOST}:{puerto}  (Ctrl+C para detener)")
    info("La primera vez descarga el modelo de embeddings; después funciona sin internet.")
    comando = [
        str(python), "-m", "uvicorn", "senal.web.app:crear_app_desde_entorno",
        "--factory", "--host", HOST, "--port", str(puerto),
    ]  # fmt: skip
    try:
        subprocess.run(comando, cwd=RAIZ, check=False)  # noqa: S603
    except KeyboardInterrupt:
        info("Servidor detenido.")


def main() -> None:
    os.chdir(RAIZ)
    verificar_python()
    variables = preparar_env()
    python = preparar_venv()
    instalar_dependencias(python)
    puerto_texto = variables.get("SENAL_PUERTO") or str(PUERTO_POR_DEFECTO)
    if not puerto_texto.isdigit() or not 1 <= int(puerto_texto) <= 65535:
        fallar(f"SENAL_PUERTO inválido en .env: {puerto_texto!r}")
    puerto = int(puerto_texto)
    liberar_puerto(puerto)
    iniciar_servidor(python, puerto)


if __name__ == "__main__":
    main()
