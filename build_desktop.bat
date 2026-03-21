@echo off
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
echo === Build Tomino Desktop ===
echo.

echo [1/3] Build React...
cd front
call npm run build
if errorlevel 1 (
    echo ERREUR: Build React echoue
    exit /b 1
)
cd ..
echo Build React OK

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
