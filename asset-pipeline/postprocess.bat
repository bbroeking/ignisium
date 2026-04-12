@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

REM Headless Blender post-processing for batch-generated GLBs.
REM
REM Usage:
REM   postprocess.bat                  (process output/, generate LODs)
REM   postprocess.bat output/          (explicit input folder)
REM   postprocess.bat --no-lods        (skip LOD generation)

set "BLENDER=C:\Program Files\Blender Foundation\Blender 4.3\blender.exe"
set "HERE=%~dp0"

if not exist "%BLENDER%" (
    echo ERROR: Blender not found at %BLENDER%
    echo Edit BLENDER path in this .bat file or install Blender 4.3.
    pause
    exit /b 1
)

"%BLENDER%" --background --python "%HERE%postprocess.py" -- %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo postprocess exited with code %ERRORLEVEL%
)
pause
