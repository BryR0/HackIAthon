@echo off
rem Senal TVN - arranque en Windows. Solo requiere Python 3.12+ instalado.
rem Crea .env si falta, instala requirements.txt, libera el puerto e inicia el servidor.
setlocal
cd /d "%~dp0"

set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY (
  where python >nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo [server_start] ERROR: no se encontro Python. Instala Python 3.12 o superior desde https://www.python.org/downloads/
  exit /b 1
)

%PY% "%~dp0scripts\server_start.py" %*
exit /b %ERRORLEVEL%
