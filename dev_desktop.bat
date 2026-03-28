@echo off
setlocal enabledelayedexpansion
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
echo === Tomino Desktop - Mode Developpeur ===
echo.

echo [1] Activation de l'environnement virtuel...
if not exist ".venv\Scripts\activate.bat" (
    echo ERREUR: Environnement virtuel introuvable.
    pause
    exit /b 1
)
call .venv\Scripts\activate.bat

set BINARY=front\src-tauri\binaries\tomino-backend-x86_64-pc-windows-msvc.exe
set NEED_BUILD=1

if "%1"=="-f"         set NEED_BUILD=0
if "%1"=="--fast"     set NEED_BUILD=0
if "%1"=="--no-build" set NEED_BUILD=0

if !NEED_BUILD!==1 if exist "%BINARY%" (
    powershell -NoProfile -Command "$bin=(Get-Item '%BINARY%').LastWriteTime; $src='app.py','database.py','grok.py','prices.py','calculs.py','emails.py','requirements.txt'; $changed=$src|Where-Object{(Test-Path $_)-and((Get-Item $_).LastWriteTime -gt $bin)}; if($changed){exit 1}else{exit 0}"
    if !errorlevel!==0 (
        set NEED_BUILD=0
        echo [2] Backend inchange -- build ignore.
        echo.
    )
)

if !NEED_BUILD!==1 (
    echo [2] Build Backend ^(PyInstaller ^- peut prendre 2-3 min^)...
    call python -m PyInstaller --onefile --noconsole --hidden-import=stripe --hidden-import=resend --hidden-import=cryptography --hidden-import=zoneinfo --hidden-import=tzdata --collect-all=tzdata --name tomino-backend app.py
    if !errorlevel! neq 0 (
        echo ERREUR: Build Backend echoue.
        pause
        exit /b 1
    )
    if not exist "front\src-tauri\binaries" mkdir "front\src-tauri\binaries"
    move /Y "dist\tomino-backend.exe" "%BINARY%"
    echo Build Backend OK
    echo.
)

echo [3] Nettoyage des processus fantomes...
taskkill /IM tomino-backend* /F >nul 2>&1

echo [4] Lancement Tauri dev...
cd front
call npm run tauri dev
cd ..

echo === Fin de session dev ===
pause
