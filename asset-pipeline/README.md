# Ignisium Asset Pipeline

Local image-to-3D generation for Ignisium buildings. Drop a concept image in, get a GLB file out.

Uses **Hunyuan3D-2** (Tencent) for the actual generation. Wraps it in a simple Gradio web UI.

---

## What you'll be able to do

1. Generate concept art of a building in Midjourney/SDXL (prompts in `PROMPTS.md`)
2. Drop the image into the UI, click Generate
3. 30 seconds to a few minutes later, a GLB file appears in `output/`
4. Copy GLB into your game, load via `GLTFLoader`

---

## Windows Setup (Step-by-Step)

### Hardware requirements

- **NVIDIA GPU with 12GB+ VRAM** (16GB+ recommended)
  - RTX 3060 12GB, 3080, 4070, 4080, 4090 all work well
  - AMD GPUs: NOT supported (Hunyuan3D needs CUDA)
- **16GB+ system RAM**
- **60GB free disk space** (model weights are ~50GB)
- **Windows 10 or 11**

### Software prerequisites

Install these **in this order** before running the setup script:

#### 1. Python 3.10

Download from https://www.python.org/downloads/release/python-31011/

Scroll down, grab the "Windows installer (64-bit)".

**CRITICAL:** During install, check the box that says **"Add python.exe to PATH"**. If you miss this, uninstall and redo.

Verify in a new PowerShell window:
```
python --version
```
Should print `Python 3.10.x`.

> Why 3.10 specifically? Some Hunyuan3D deps don't build on 3.11/3.12 yet.

#### 2. Git for Windows

Download from https://git-scm.com/download/win

Accept all defaults during install.

Verify:
```
git --version
```

#### 3. CUDA Toolkit 12.4

Download from https://developer.nvidia.com/cuda-12-4-0-download-archive

- Select: Windows → x86_64 → 11 → exe (local)
- Run the installer, accept defaults (the "Express" install is fine)
- Reboot after install

Verify:
```
nvcc --version
```
Should print a CUDA 12.4 version line.

> CUDA 12.4 specifically matches the PyTorch wheel we install. If you have a different CUDA version already, you may need to match it in `setup_windows.bat`.

#### 4. Visual Studio Build Tools (for building CUDA extensions)

Download from https://visualstudio.microsoft.com/visual-cpp-build-tools/

Run the installer, select **"Desktop development with C++"** workload, click Install.

This is needed to compile Hunyuan3D's custom CUDA kernels. Without it, texture generation will fail at the build step.

### Run the setup script

1. **Copy the entire `asset-pipeline` folder** from this project to your Windows machine. You can zip it up on your Mac, transfer it however you like (USB, cloud drive, git clone the project).

2. Open PowerShell **as Administrator** (right-click PowerShell → Run as administrator).

3. `cd` into the folder:
   ```
   cd C:\path\to\asset-pipeline
   ```

4. Run the setup script:
   ```
   .\setup_windows.bat
   ```

5. The script will:
   - Verify prerequisites
   - Create a Python virtual environment
   - Install PyTorch with CUDA 12.4 support
   - Install Gradio and supporting libraries
   - Clone `Hunyuan3D-2` from GitHub
   - Install Hunyuan3D's Python dependencies
   - Build the custom CUDA ops (`custom_rasterizer`, `differentiable_renderer`)

6. Total time: **20–45 minutes**, mostly download time. Grab coffee.

7. When it finishes you'll see "Setup complete!".

---

## Using it

1. Double-click `run.bat` (or run it from PowerShell).

2. First launch downloads ~10GB of model weights from HuggingFace. This is a one-time thing.

3. When you see "Ready. Open http://127.0.0.1:7860", open that URL in your browser.

4. The UI has three inputs:
   - **Concept Image**: drag and drop a PNG
   - **Asset Name**: e.g. `command_center`, `shipyard`
   - **Generate PBR textures**: checked by default. Uncheck if texture generation fails.

5. Click **Generate 3D Model**. Wait 1–5 minutes.

6. When done, a GLB file appears in the right column. Click to download, or check the `output/` folder — it's saved with a timestamp (e.g., `command_center_20260409_143022.glb`).

---

## The full workflow for Ignisium buildings

```
┌─────────────────────────────────────────────────┐
│ 1. Write a prompt (see PROMPTS.md)              │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ 2. Generate concept art                         │
│    - Midjourney / SDXL / DALL-E                 │
│    - Pick the best variant                      │
│    - Save as PNG                                │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ 3. This tool (Hunyuan3D-2)                      │
│    - Upload image, name it, click generate      │
│    - Wait 1–5 min                               │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ 4. Cleanup in Blender (optional)                │
│    - Decimate to ~2000 tris                     │
│    - Fix normals                                │
│    - Re-export GLB                              │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ 5. Optimize with gltfpack                       │
│    - npx gltfpack -i in.glb -o out.glb -cc -tc  │
│    - Draco compression, smaller textures        │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ 6. Copy to game's assets folder                 │
│    - ../assets/models/buildings/command_center.glb │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ 7. Load in main.js                              │
│    - new GLTFLoader().load('assets/...', ...)   │
│    - Replace the primitive-based generator      │
└─────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "Python not found"
You didn't check "Add Python to PATH" during install. Reinstall Python, check the box.

### "nvcc not found" warning
CUDA Toolkit not installed or not in PATH. Reinstall from the link above and reboot.

### `custom_rasterizer` build fails
This is the most common issue. Causes:
- Visual Studio Build Tools not installed (install the C++ workload)
- CUDA Toolkit version mismatch with PyTorch (we use 12.4 — match it)
- Not running PowerShell as Administrator

If it fails, the tool **still works** — you just won't get PBR textures. Untextured meshes are fine; you can paint them in Blender.

### "CUDA out of memory" during generation
- Close other apps that use the GPU (browsers, games)
- Lower the generation resolution in `app.py` (Hunyuan3D-2 has a config for this)
- Upgrade to `Hunyuan3D-2mini` which uses less VRAM

### Generation takes forever
- Make sure you're using CUDA, not CPU. The app prints `CUDA available: True` at startup.
- First run is slower because model weights are downloading.

### UI won't open in browser
- Check the terminal for errors
- Manually go to http://127.0.0.1:7860
- If port 7860 is taken, edit `app.py` and change the port number at the bottom

---

## Alternative: Pinokio (easier, less control)

If the setup script is too much pain, use **Pinokio** instead:

1. Download from https://pinokio.computer
2. Install the app
3. Open it, go to Discover tab, search "Hunyuan3D-2"
4. Click Download, wait
5. Click Start — opens the same Gradio UI at http://127.0.0.1:7860

Pinokio handles all the Python/CUDA/dependency stuff automatically. The tradeoff is you don't have the custom wrapper — just Tencent's default UI. You still get GLB files out, you just have to manually copy them into your game.

---

## Files in this folder

| File | Purpose |
|------|---------|
| `README.md` | This file |
| `app.py` | Gradio UI + generation logic |
| `requirements.txt` | Base Python deps (before Hunyuan3D-2's own deps) |
| `setup_windows.bat` | One-time setup script |
| `run.bat` | Launcher |
| `PROMPTS.md` | Concept art prompts for every Ignisium building |
| `output/` | Generated GLB files land here |
| `Hunyuan3D-2/` | Created by setup script — the cloned repo |
| `venv/` | Created by setup script — Python environment |
