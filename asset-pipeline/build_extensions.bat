@echo off
echo ================================================================
echo   Build Hunyuan3D-2.1 texture pipeline CUDA extensions
echo ================================================================
echo.
echo Compiles custom_rasterizer + DifferentiableRenderer from source
echo against the portable's Python so the texture (paint) pipeline
echo can load.
echo.
echo Requires:
echo   - MSVC Build Tools 2022 (cl.exe + Windows SDK)
echo     winget install Microsoft.VisualStudio.2022.BuildTools
echo     with the "Desktop development with C++" workload.
echo   - CUDA Toolkit on PATH (any 12.x is fine, we have 12.8).
echo   - The YanWenKun Hunyuan3D-2 portable extracted to runtime/.
echo.
echo Total build time: ~5 minutes.
echo.

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 (
    echo ERROR: vcvars64 failed. Is MSVC Build Tools installed?
    exit /b 1
)
set DISTUTILS_USE_SDK=1

set "PY=%~dp0runtime\Hunyuan3D2_WinPortable\python_standalone\python.exe"
set "HY21=%~dp0runtime\Hunyuan3D2_WinPortable\Hunyuan3D-2.1"

echo.
echo Python: %PY%
echo Source: %HY21%
where cl.exe
echo.

echo [1/2] Building custom_rasterizer...
"%PY%" -sm pip install --no-build-isolation "%HY21%\hy3dpaint\custom_rasterizer"
if errorlevel 1 ( echo ERROR building custom_rasterizer & exit /b 1 )

echo.
echo [2/2] Building mesh_inpaint_processor (DifferentiableRenderer)...
"%PY%" -sm pip install --no-build-isolation "%HY21%\hy3dpaint\DifferentiableRenderer"
if errorlevel 1 ( echo ERROR building DifferentiableRenderer & exit /b 1 )

echo.
echo ================================================================
echo   Build complete.
echo ================================================================
echo.
echo Restart asset-pipeline\run.bat to pick up the texture pipeline.
echo.
exit /b 0
