@echo off
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
echo === Tomino Desktop - Mode Developpeur ===
echo.

echo [1/3] Activation de l'environnement virtuel...
if not exist ".venv\Scripts\activate.bat" (
    echo ERREUR: Environnement virtuel introuvable.
    pause
    exit /b 1
)
call .venv\Scripts\activate.bat

:: --- Detection rebuild backend ---
set BINARY=front\src-tauri\binaries\tomino-backend-x86_64-pc-windows-msvc.exe
set NEED_BUILD=1

if "%1"=="-f"         set NEED_BUILD=0
if "%1"=="--fast"     set NEED_BUILD=0
if "%1"=="--no-build" set NEED_BUILD=0

if %NEED_BUILD%==1 (
    if exist "%BINARY%" (
        :: Comparer la date du binaire avec les fichiers Python sources
        powershell -NoProfile -Command ^
            "$bin = (Get-Item '%BINARY%').LastWriteTime;" ^
            "$sources = 'app.py','database.py','grok.py','prices.py','calculs.py','emails.py','requirements.txt';" ^
            "$changed = $sources | Where-Object { (Test-Path $_) -and (Get-Item $_).LastWriteTime -gt $bin };" ^
            "if ($changed) { Write-Host \"[BACKEND] Modifie: $($changed -join ', ')\"; exit 1 } else { exit 0 }"
        if errorlevel 1 (
            set NEED_BUILD=1
        ) else (
            set NEED_BUILD=0
            echo [2/3] Backend inchange -- build ignore.
        )
    )
)

if %NEED_BUILD%==1 (
    echo [2/3] Build Backend ^(PyInstaller^)...
    call python -m PyInstaller --onefile --noconsole --hidden-import=stripe --hidden-import=resend --hidden-import=cryptography --hidden-import=zoneinfo --hidden-import=tzdata --collect-all=tzdata --name tomino-backend app.py
    if errorlevel 1 (
        echo ERREUR: Build Backend echoue.
        pause
        exit /b 1
    )
    if not exist "front\src-tauri\binaries" mkdir "front\src-tauri\binaries"
    move /Y "dist\tomino-backend.exe" "%BINARY%"
    if errorlevel 1 (
        echo ERREUR: Deplacement du binaire echoue.
        pause
        exit /b 1
    )
    echo Build Backend OK
    echo.
)

echo [3/3] Nettoyage des processus fantomes...
taskkill /IM tomino-backend* /F >nul 2>&1

echo [4/4] Lancement de Tauri en mode dev...
cd front
call npm run tauri dev
if errorlevel 1 (
    echo ERREUR: Lancement Tauri dev echoue.
    pause
)
cd ..

echo === Fin de session dev ===
pause
