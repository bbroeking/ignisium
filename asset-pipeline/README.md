# Ignisium Asset Pipeline

Local AI-powered 3D asset generation for the Ignisium RTS game. Generates textured GLB models from concept images using Hunyuan3D-2, with an optional Midjourney prompt queue for automated concept art generation.

**Everything runs locally on your GPU.** No cloud APIs required for core functionality.

## Features

- **Image to 3D** -- Drop a concept image, get a textured GLB in ~2 minutes
- **PBR Textures** -- Automatic texture baking with delight, multi-view diffusion, and UV unwrapping
- **Prompt Queue** -- Generate Midjourney prompts, submit via Discord, auto-download and convert to 3D
- **Animation Tools** -- GLB node inspector, procedural animation reference, UniRig integration for character rigging
- **Game Integration** -- Auto-installs GLBs into the game's asset folder; stylized building shader applied automatically
- **Tunable Parameters** -- Octree resolution, inference steps, guidance scale, decimation target all exposed in UI

## Requirements

### Hardware

- **GPU:** NVIDIA RTX 4080 16GB (or similar; 12GB minimum, 16GB recommended)
- **RAM:** 32GB minimum, 96GB recommended (model weights stream from RAM to VRAM)
- **Storage:** ~40GB for model weights + runtime

### Software

- **Windows 10/11** with Developer Mode enabled (Settings > Update & Security > For developers)
- **NVIDIA drivers** with CUDA 12.x support
- **MSVC Build Tools 2022** (for texture pipeline C++ extensions)

## Setup

### 1. Install the Hunyuan3D-2 Portable Runtime

Download [YanWenKun/Hunyuan3D-2-WinPortable](https://github.com/YanWenKun/Hunyuan3D-2-WinPortable/releases/latest) (cu126 v4 or later) and extract it so the directory structure is:

```
asset-pipeline/
  runtime/
    Hunyuan3D2_WinPortable/
      python_standalone/
        python.exe
      Hunyuan3D-2/
        hy3dgen/
      HuggingFaceHub/
      ...
```

### 2. Enable Windows Developer Mode

**Required** -- HuggingFace model downloads will hard-fail without this.

Settings > Update & Security > For developers > Developer Mode > On

Verify in PowerShell:

```powershell
(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' AllowDevelopmentWithoutDevLicense).AllowDevelopmentWithoutDevLicense
```

Should return `1`.

### 3. Build Texture Extensions (one time)

The texture pipeline needs C++ extensions compiled against the portable's Python/PyTorch:

```cmd
asset-pipeline\build_extensions.bat
```

Requires MSVC Build Tools 2022. Builds `custom_rasterizer` and `DifferentiableRenderer` into the portable's site-packages.

### 4. Install Fast Simplification (one time)

```cmd
runtime\Hunyuan3D2_WinPortable\python_standalone\python.exe -m pip install fast-simplification
```

### 5. (Optional) Discord / Midjourney Integration

Copy `.env.example` to `.env` and fill in:

```
DISCORD_TOKEN=your_discord_self_bot_token
DISCORD_CHANNEL_ID=channel_where_midjourney_bot_lives
OLLAMA_MODEL=llama3.1    # optional, for AI-generated MJ prompts
```

Without these, the Prompt Queue tab still works -- it generates prompts and waits for you to manually paste a PNG into `inbox/<job_id>.png`.

## Usage

### Launch

```cmd
cd asset-pipeline
run.bat
```

Opens at http://127.0.0.1:7860 with three tabs.

### Tab 1: Generate

1. Upload a concept image (PNG with transparent background works best)
2. Name the asset (e.g., `command_center`)
3. Adjust parameters if needed:
   - **Octree resolution**: 256 (fast, ~20s) / 384 (detailed) / 512 (max, slow)
   - **Inference steps**: 30 (default) / 50 (higher quality)
   - **Guidance scale**: 7.5 (default) / 9-10 (sharper adherence to input)
   - **Decimate faces**: 80K (fast UV unwrap) / 200K (more detail, slower)
4. Check "Generate PBR textures" for textured output (~90s extra)
5. Click Generate -- live status updates in the right panel

Output GLBs land in `asset-pipeline/output/`.

### Tab 2: Prompt Queue

End-to-end pipeline: describe a building in plain text, get a game-ready GLB.

1. Pick a building from the dropdown (auto-fills subject + asset name) or write custom
2. Choose quality preset (fast / balanced / high / max)
3. Click "Add to queue"

The queue runs: generate MJ prompt > submit to Discord > wait for upscale > download image > run Hunyuan3D-2 > install GLB into game.

Without Discord token: stops at "prompt ready". Copy the prompt to Midjourney manually, then drop the resulting PNG into `inbox/<job_id>.png`.

### Tab 3: Animations

- **GLB Inspector**: Upload a GLB to see its node tree and which nodes the game animates
- **Building Animations**: Procedural (no rig needed) -- name child nodes in Blender to match the game's animation hooks
- **Character Rigging**: Install UniRig (SIGGRAPH 2025) for local GPU-based auto-rigging

## Game Integration

### Auto-loading GLBs

Copy a GLB to `public/assets/models/buildings/<type>.glb` where `<type>` matches a key in `BUILDING_GLBS` in `main.js`:

```
command_center, thermal_extractor, mineral_drill, habitat_pod,
research_lab, warehouse, barracks, defense_turret, shipyard,
trade_depot, shield_gen
```

The game auto-loads these at startup and swaps primitive placeholder meshes in-place.

### Stylized Building Shader

Imported GLBs automatically get a custom shader matching the game's visual style:

- 3-band toon diffuse lighting
- Toon specular highlights
- Procedural panel lines
- Noise-based weathering
- Rim light
- Lava underlight (volcanic planet surface)
- Team-color accent channel

### Building Animations

The game's render loop auto-animates nodes by name:

| Node Name | Animation |
|---|---|
| `drill-arm` | Continuous Y rotation |
| `drill-bit` | Continuous Z rotation |
| `turret-barrel` | Sinusoidal Y scan |
| `turret-light` | Pulsing scale |
| `holo-display` | Opacity pulse + slow rotation |
| `trade-pad` | Slow Y rotation |

Name your GLB's child objects in Blender to match these, re-export, and the animations happen automatically.

## Architecture

```
asset-pipeline/
  app.py              # Gradio UI (3 tabs: Generate, Queue, Animations)
  pipeline_queue.py   # End-to-end queue: prompt -> MJ -> 3D -> install
  prompts.py          # Building prompt templates for Midjourney
  build_extensions.bat # One-time C++ extension build for texture pipeline
  run.bat             # Launch script (sets up env vars + portable Python)
  .env.example        # Discord/Ollama config template
  inbox/              # Drop PNGs here for manual queue jobs
  output/             # Generated GLBs land here

runtime/
  Hunyuan3D2_WinPortable/   # YanWenKun portable (not in git)
    python_standalone/       # Embedded Python 3.12 + PyTorch + CUDA
    Hunyuan3D-2/             # Hunyuan3D-2.0 model source
    HuggingFaceHub/          # HF model weight cache
```

## Performance

Benchmarks on RTX 4080 16GB / 96GB RAM / Windows 10:

| Step | Time |
|---|---|
| Shape generation (octree 256, 30 steps) | ~20s |
| Mesh decimation (600K -> 80K faces) | <1s |
| Texture pipeline load | ~15s |
| PBR texture baking (delight + multiview + UV + bake) | ~75s |
| **Total (shape + texture)** | **~2 min** |
| Shape only (no texture) | ~20s |

## Known Issues & Troubleshooting

### "WinError 1314: A required privilege is not held"

Enable Windows Developer Mode. See Setup step 2.

### Shape generation hangs after "Volume Decoding: 100%"

Octree resolution too high. Use 256 (default). Marching cubes at 384+ is CPU-bound and very slow with no progress bar.

### Texture generation seems stuck (GPU at 1%)

The texture pipeline must run on GPU via `enable_model_cpu_offload()` (called by default). If GPU stays at 1% for >2 min during texture gen, restart the app.

### Texture pipeline VAE warning

`diffusion_pytorch_model.safetensors not found` -- cosmetic. Falls back to pickle format successfully.

### First run is slow

Downloads ~20GB of model weights into `HuggingFaceHub/`. Subsequent runs use the cache.

### mmgp profile thrashing (if using Hunyuan3D-2.1)

Default profile 5 with 2200 MB budget is too aggressive for 16GB GPUs. Change to profile 3 or budget 8000 MB. Not applicable to the current 2.0-based pipeline.

## License

Asset pipeline code is MIT. Hunyuan3D-2 model weights are under the [Tencent Hunyuan Community License](https://github.com/Tencent/Hunyuan3D-2/blob/main/LICENSE).
