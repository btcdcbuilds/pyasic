@echo off
rem Run YCB Site Capture on this computer (Windows).
rem First run: creates .venv, installs the app, and asks for the admin login.
rem Data (database + uploads) is kept in local-data. Open http://localhost:8000
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3") else (set "PY=python")
%PY% -c "import sys; sys.exit(sys.version_info < (3, 12))" 2>nul
if errorlevel 1 (
  echo Python 3.12 or newer is needed: https://www.python.org/downloads/
  echo Tick "Add python.exe to PATH" in the installer.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Setting up ^(first run only, a few minutes^)...
  %PY% -m venv .venv || goto :fail
  ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
  ".venv\Scripts\python.exe" -m pip install ".[bim,scan]" || goto :fail
)

set "SITECAPTURE_DATA_DIR=%CD%\local-data"
if not exist "%SITECAPTURE_DATA_DIR%" mkdir "%SITECAPTURE_DATA_DIR%"
if not exist "%SITECAPTURE_DATA_DIR%\sitecapture.db" (
  echo Create the first admin login.
  set /p "SITECAPTURE_ADMIN_EMAIL=Email: "
  set /p "SITECAPTURE_ADMIN_PASSWORD=Password (10+ characters): "
)

echo YCB Site Capture: http://localhost:8000  (close this window to stop)
start "" http://localhost:8000
".venv\Scripts\python.exe" -m uvicorn sitecapture.api.app:app --host 127.0.0.1 --port 8000
goto :eof

:fail
echo Setup failed - see the messages above.
pause
exit /b 1
