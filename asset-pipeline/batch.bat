@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

REM Batch generate GLBs from all images in inbox/
REM Each image runs in its own worker.py subprocess with a clean GPU context.
REM
REM Usage:
REM   batch.bat                     (balanced preset, with texture)
REM   batch.bat --no-texture        (shape only, ~10s each)
REM   batch.bat --preset high       (octree 384, 50 steps)

set "HERE=%~dp0"
set "PORTABLE=%HERE%runtime\Hunyuan3D2_WinPortable"
set "PY=%PORTABLE%\python_standalone\python.exe"
set "WORKER=%HERE%worker.py"
set "INBOX=%HERE%inbox"
set "OUTPUT=%HERE%output"
set "GENERATED=%HERE%generated"

set "HF_HUB_CACHE=%PORTABLE%\HuggingFaceHub"
set "HY3DGEN_MODELS=%PORTABLE%\HuggingFaceHub"
set "PYTHONPYCACHEPREFIX=%PORTABLE%\pycache"
set "PYTHONUNBUFFERED=1"
set "PATH=%PORTABLE%\MinGit\cmd;%PORTABLE%\python_standalone\Scripts;%PATH%"

if not exist "%PY%" (
    echo ERROR: Portable Python not found at %PY%
    pause
    exit /b 1
)

if not exist "%INBOX%" mkdir "%INBOX%"
if not exist "%OUTPUT%" mkdir "%OUTPUT%"
if not exist "%GENERATED%" mkdir "%GENERATED%"

REM Parse args
set "PRESET=balanced"
set "TEXTURE=true"
set "DRYRUN="

:parse_args
if "%~1"=="" goto :done_args
if "%~1"=="--preset" (set "PRESET=%~2" & shift & shift & goto :parse_args)
if "%~1"=="--no-texture" (set "TEXTURE=false" & shift & goto :parse_args)
if "%~1"=="--dry-run" (set "DRYRUN=1" & shift & goto :parse_args)
shift
goto :parse_args
:done_args

REM Preset params
if "%PRESET%"=="fast" (set OCT=256& set STEPS=20& set CFG=7.5& set DEC=80000)
if "%PRESET%"=="balanced" (set OCT=256& set STEPS=30& set CFG=7.5& set DEC=80000)
if "%PRESET%"=="high" (set OCT=384& set STEPS=50& set CFG=8.5& set DEC=100000)

echo ================================================================
echo   Ignisium Batch Generator
echo   Preset: %PRESET% (octree=%OCT%, steps=%STEPS%, cfg=%CFG%)
echo   Texture: %TEXTURE%
echo   Input:  %INBOX%
echo   Output: %OUTPUT%
echo ================================================================
echo.

REM Count images
set COUNT=0
for %%f in ("%INBOX%\*.png" "%INBOX%\*.jpg") do set /a COUNT+=1
if %COUNT%==0 (
    echo No images found in %INBOX%
    echo Drop PNG/JPG concept images there and re-run.
    pause
    exit /b 0
)
echo Found %COUNT% images.
echo.

set IDX=0
for %%f in ("%INBOX%\*.png" "%INBOX%\*.jpg") do (
    set /a IDX+=1
    set "IMG=%%f"
    set "IMGNAME=%%~nf"

    REM Simplify name via Python one-liner
    for /f "delims=" %%n in ('"%PY%" -c "from batch import simplify_name; print(simplify_name('!IMGNAME!'))"') do set "ASSET=%%n"

    echo [!IDX!/%COUNT%] !ASSET! ^(%%~nxf^)

    if defined DRYRUN (
        echo   -^> would generate: output\!ASSET!_*.glb
        echo   -^> would move to:  generated\!ASSET!%%~xf
        echo.
    ) else (
        REM Write args JSON
        set "ARGS=%OUTPUT%\_batch_args_!ASSET!.json"
        echo {"image_path":"!IMG!","asset_name":"!ASSET!","use_texture":!TEXTURE!,"octree_resolution":!OCT!,"inference_steps":!STEPS!,"guidance_scale":!CFG!,"decimate_faces":!DEC!,"remove_background":true,"use_flashvdm":true}> "!ARGS!"

        REM Run worker in its own process (clean GPU context)
        "%PY%" -u "%WORKER%" "!ARGS!"
        set "RESULT=!ERRORLEVEL!"

        REM Clean up args file
        if exist "!ARGS!" del "!ARGS!"

        if !RESULT! EQU 0 (
            echo   OK
            REM Move source image to generated/
            if exist "%GENERATED%\!ASSET!%%~xf" del "%GENERATED%\!ASSET!%%~xf"
            move "%%f" "%GENERATED%\!ASSET!%%~xf" >nul
            echo   Moved: %%~nxf -^> generated\!ASSET!%%~xf
        ) else (
            echo   FAILED ^(exit code !RESULT!^)
        )
        echo.
    )
)

echo ================================================================
echo   Batch complete: %IDX% images processed.
echo ================================================================
if defined DRYRUN echo   (dry run - no files generated)
timeout /t 5 /nobreak >nul
