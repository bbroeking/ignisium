@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

REM GLB compression pipeline (Draco + WebP textures by default).
REM
REM Usage:
REM   compress.bat                  (process processed/, WebP)
REM   compress.bat processed/       (explicit input)
REM   compress.bat --ktx2           (KTX2 ETC1S; needs ktx-software on PATH)
REM   compress.bat --quality 70     (WebP quality, default 80)
REM
REM Output: <input>/web/<...>.glb mirroring the source layout.

set "HERE=%~dp0"

where npx >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npx not found. Install Node.js first.
    pause
    exit /b 1
)

python "%HERE%compress.py" %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo compress.py exited with code %ERRORLEVEL%
)
pause
