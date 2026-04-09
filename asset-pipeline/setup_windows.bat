@echo off
setlocal EnableDelayedExpansion

echo ================================================================
echo   Ignisium Asset Pipeline - Windows Setup
echo ================================================================
echo.
echo This script installs Hunyuan3D-2 and all dependencies.
echo Requires: Python 3.10, Git, CUDA Toolkit 12.4, NVIDIA GPU 12GB+
echo Total download: ~50GB, time: 20-45 min depending on connection
echo.
pause

REM ----- Check prerequisites -----
echo.
echo [CHECK] Verifying prerequisites...

python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   ERROR: Python not found in PATH.
    echo   Install Python 3.10 from https://www.python.org/downloads/
    echo   IMPORTANT: Check "Add Python to PATH" during install.
    pause
    exit /b 1
)
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYVER=%%i
echo   Python %PYVER% OK

git --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   ERROR: Git not found in PATH.
    echo   Install Git from https://git-scm.com/download/win
    pause
    exit /b 1
)
echo   Git OK

nvcc --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   WARNING: nvcc ^(CUDA compiler^) not found.
    echo   You need CUDA Toolkit 12.4 from https://developer.nvidia.com/cuda-12-4-0-download-archive
    echo   Custom CUDA ops ^(texture generation^) will fail without it.
    echo.
    set /p CONTINUE="Continue anyway? (y/n) "
    if /i not "!CONTINUE!"=="y" exit /b 1
) else (
    echo   CUDA toolkit OK
)

REM ----- Create venv -----
echo.
echo [1/7] Creating Python virtual environment...
if exist venv (
    echo   venv already exists, skipping
) else (
    python -m venv venv
    if %ERRORLEVEL% NEQ 0 (
        echo   ERROR: venv creation failed
        pause
        exit /b 1
    )
)

REM ----- Activate venv -----
call venv\Scripts\activate.bat
if %ERRORLEVEL% NEQ 0 (
    echo   ERROR: could not activate venv
    pause
    exit /b 1
)

REM ----- Upgrade pip -----
echo.
echo [2/7] Upgrading pip...
python -m pip install --upgrade pip setuptools wheel

REM ----- Install PyTorch with CUDA -----
echo.
echo [3/7] Installing PyTorch with CUDA 12.4 support...
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
if %ERRORLEVEL% NEQ 0 (
    echo   ERROR: PyTorch install failed
    pause
    exit /b 1
)

REM ----- Install base requirements -----
echo.
echo [4/7] Installing base Python packages...
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo   ERROR: requirements.txt install failed
    pause
    exit /b 1
)

REM ----- Clone Hunyuan3D-2 -----
echo.
echo [5/7] Cloning Hunyuan3D-2 repository...
if exist Hunyuan3D-2 (
    echo   Hunyuan3D-2 already cloned, pulling latest...
    cd Hunyuan3D-2
    git pull
    cd ..
) else (
    git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git
    if %ERRORLEVEL% NEQ 0 (
        echo   ERROR: git clone failed
        pause
        exit /b 1
    )
)

REM ----- Install Hunyuan3D-2 deps -----
echo.
echo [6/7] Installing Hunyuan3D-2 Python dependencies...
cd Hunyuan3D-2
pip install -r requirements.txt
cd ..

REM ----- Build custom CUDA extensions -----
echo.
echo [7/7] Building custom CUDA ops (rasterizer + renderer)...
echo   This step often fails without a matching CUDA toolkit.
echo   If it fails, the shape model still works — only texture generation breaks.
echo.

cd Hunyuan3D-2\hy3dgen\texgen\custom_rasterizer
python setup.py install
if %ERRORLEVEL% NEQ 0 (
    echo   WARNING: custom_rasterizer build failed. Textures will not work.
) else (
    echo   custom_rasterizer built OK
)
cd ..\..\..\..

cd Hunyuan3D-2\hy3dgen\texgen\differentiable_renderer
python setup.py install
if %ERRORLEVEL% NEQ 0 (
    echo   WARNING: differentiable_renderer build failed. Textures will not work.
) else (
    echo   differentiable_renderer built OK
)
cd ..\..\..\..

echo.
echo ================================================================
echo   Setup complete!
echo ================================================================
echo.
echo   Run ^> run.bat
echo   Opens http://127.0.0.1:7860 in your browser
echo.
echo   First launch downloads ~10GB of model weights — be patient.
echo.
pause
