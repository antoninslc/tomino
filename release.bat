@echo off
echo === Release Tomino ===
echo.

REM Vérifier que TAURI_PRIVATE_KEY est défini
if "%TAURI_PRIVATE_KEY%"=="" (
    echo ERREUR: Variable TAURI_PRIVATE_KEY non definie.
    echo Definir avec: set TAURI_PRIVATE_KEY=contenu_de_tomino.key
    exit /b 1
)

echo [1/3] Build React...
cd front
call npm run build
if errorlevel 1 ( echo ERREUR Build React & exit /b 1 )

echo [2/3] Build Tauri avec signature...
call npm run tauri build
if errorlevel 1 ( echo ERREUR Build Tauri & exit /b 1 )
cd ..

echo [3/3] Fichiers de release generes :
echo   front\src-tauri\target\release\bundle\nsis\
dir /b "front\src-tauri\target\release\bundle\nsis\"
echo.
echo Prochaine etape :
echo   1. Creer une release sur GitHub
echo   2. Uploader le .exe et le .exe.sig
echo   3. Uploader le latest.json genere dans bundle\

echo.
echo === Release terminee ===
pause
