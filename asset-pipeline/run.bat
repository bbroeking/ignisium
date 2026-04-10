@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
echo ================================================================
echo   Ignisium Asset Pipeline
echo ================================================================
echo.

REM Launch asset-pipeline\app.py using the YanWenKun Hunyuan3D-2 portable
REM runtime. Falls back to the legacy venv\ layout created by the old
REM setup_windows.bat if the portable isn't present.

set "HERE=%~dp0"
set "PORTABLE=%HERE%runtime\Hunyuan3D2_WinPortable"
set "PORTABLE_PY=%PORTABLE%\python_standalone\python.exe"
set "VENV_PY=%HERE%venv\Scripts\python.exe"

set "PY="
if exist "%PORTABLE_PY%" (
    set "PY=%PORTABLE_PY%"
    echo Using portable runtime: %PORTABLE_PY%
    REM Match the portable's own environment so the HuggingFace weight
    REM cache is shared between our app and the portable's own launcher.
    set "PATH=%PATH%;%PORTABLE%\MinGit\cmd;%PORTABLE%\python_standalone\Scripts"
    set "PYTHONPYCACHEPREFIX=%PORTABLE%\pycache"
    set "HF_HUB_CACHE=%PORTABLE%\HuggingFaceHub"
    set "HY3DGEN_MODELS=%PORTABLE%\HuggingFaceHub"
) else if exist "%VENV_PY%" (
    set "PY=%VENV_PY%"
    echo Using venv runtime: %VENV_PY%
) else (
    echo ERROR: No Python runtime found.
    echo.
    echo Expected either:
    echo   %PORTABLE_PY%
    echo   %VENV_PY%
    echo.
    echo Download the YanWenKun Hunyuan3D-2 portable from:
    echo   https://github.com/YanWenKun/Hunyuan3D-2-WinPortable/releases/latest
    echo and extract it into %HERE%runtime\
    echo so that %PORTABLE_PY% exists.
    pause
    exit /b 1
)

echo.
echo Press Ctrl+C to stop the server gracefully.
echo Closing this window also triggers a clean shutdown.
echo.
cd /d "%HERE%"
"%PY%" app.py
set "RESULT=%ERRORLEVEL%"

echo.
if %RESULT% EQU 0 (
    echo Server stopped cleanly.
) else if %RESULT% EQU -1073741510 (
    REM 0xC000013A = STATUS_CONTROL_C_EXIT, normal Ctrl+C
    echo Server stopped (Ctrl+C^).
) else (
    echo app.py exited with code %RESULT%.
)

REM Brief pause so the user can read the exit message, then auto-close.
timeout /t 3 /nobreak >nul
exit /b %RESULT%
