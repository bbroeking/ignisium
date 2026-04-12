@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

REM Batch generate GLBs from images in inbox/
REM Uses system Python for orchestration, portable Python for GPU work.

set "HERE=%~dp0"
set "PORTABLE=%HERE%runtime\Hunyuan3D2_WinPortable"

REM Set env vars for worker subprocesses
set "HF_HUB_CACHE=%PORTABLE%\HuggingFaceHub"
set "HY3DGEN_MODELS=%PORTABLE%\HuggingFaceHub"
set "PYTHONPYCACHEPREFIX=%PORTABLE%\pycache"
set "PYTHONUNBUFFERED=1"
set "PATH=%PORTABLE%\MinGit\cmd;%PORTABLE%\python_standalone\Scripts;%PATH%"

REM Use system Python for batch orchestration (no CUDA context)
REM and portable Python only for worker.py (GPU inference)
python "%HERE%batch.py" %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo batch.py exited with code %ERRORLEVEL%
)
pause
