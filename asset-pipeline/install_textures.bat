@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

REM Compress + install celestial texture PNGs into the game folder.
REM
REM Reads PNGs from input/, identifies the planet/sun by filename
REM keyword, and writes 1024x1024 WebP files to
REM public/assets/textures/celestial/<key>.webp .

set "HERE=%~dp0"
set "PORTABLE=%HERE%runtime\Hunyuan3D2_WinPortable"
set "PY=%PORTABLE%\python_standalone\python.exe"

if not exist "%PY%" (
    echo ERROR: Portable Python not found at %PY%
    pause
    exit /b 1
)

"%PY%" "%HERE%install_textures.py" %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo install_textures exited with code %ERRORLEVEL%
)
pause
