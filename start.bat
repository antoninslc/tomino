@echo off
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

if "%1"=="tauri" goto tauri_dev
if "%1"=="test" goto run_tests

:normal
echo Lancement Tomino (mode navigateur)...
start "Tomino - Backend" cmd /k ".venv\Scripts\activate && python app.py"
start "Tomino - Frontend" cmd /k "cd front && npm run dev"
timeout /t 3 /nobreak > nul
start "" "http://localhost:5173"
goto end

:tauri_dev
echo Lancement Tomino (mode app desktop Tauri)...
where link.exe >nul 2>nul
if errorlevel 1 (
	echo ERREUR: link.exe introuvable ^(Build Tools C++ MSVC manquants^)
	echo Installe Visual Studio Build Tools 2022 avec le workload "Desktop development with C++"
	goto end
)
start "Tomino - Backend" cmd /k ".venv\Scripts\activate && python app.py"
timeout /t 2 /nobreak > nul
cd front && npm run tauri dev
goto end

:run_tests
echo Lancement des tests backend...
.venv\Scripts\python.exe -m unittest discover -s tests -v
goto end

:end