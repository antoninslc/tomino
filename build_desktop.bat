@echo off
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
echo === Build Tomino Desktop ===
echo.

echo [0/3] Activation de l'environnement virtuel...
if not exist ".venv\Scripts\activate.bat" (
    echo ERREUR: Environnement virtuel introuvable.
    pause
    exit /b 1
)
call .venv\Scripts\activate.bat

echo [1/3] Build Backend (PyInstaller)...
python -m pip install pyinstaller
python -m pip install -r requirements.txt
python -m PyInstaller --onefile --noconsole --hidden-import=stripe --hidden-import=resend --hidden-import=cryptography --hidden-import=zoneinfo --hidden-import=tzdata --collect-all=tzdata --name tomino-backend app.py
if not exist "front\src-tauri\binaries" mkdir "front\src-tauri\binaries"
move /Y "dist\tomino-backend.exe" "front\src-tauri\binaries\tomino-backend-x86_64-pc-windows-msvc.exe"
if errorlevel 1 (
    echo ERREUR: Build Backend echoue
    exit /b 1
)
echo Build Backend OK
echo.

echo [2/3] Build React...
cd front
call npm run build
if errorlevel 1 (
    echo ERREUR: Build React echoue
    exit /b 1
)
cd ..
echo Build React OK
echo.

echo [2/3] Build Tauri...
cd front
where link.exe >nul 2>nul
if not errorlevel 1 goto link_ok

if exist "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    call "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
    goto link_ok
)
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
    goto link_ok
)

echo ERREUR: link.exe introuvable (Build Tools C++ MSVC manquants)
echo Installe Visual Studio Build Tools 2022 avec le workload "Desktop development with C++"
echo Puis relance ce script dans un nouveau terminal.
exit /b 1

:link_ok
call npm run tauri build
if errorlevel 1 (
    echo ERREUR: Build Tauri echoue
    exit /b 1
)
cd ..
echo Build Tauri OK

echo [3/3] Installeur disponible dans :
echo   front\src-tauri\target\release\bundle\
echo.
echo === Build termine ===
pause
