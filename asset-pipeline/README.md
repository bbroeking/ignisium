# Ignisium Asset Pipeline

Local AI-powered 3D asset generation for the Ignisium RTS game. Image to textured GLB in seconds. Everything runs on your GPU.

## Quick Start

```cmd
cd asset-pipeline

:: One image via Gradio UI
run.bat
:: -> opens http://127.0.0.1:7860

:: Batch process all images in inbox/ (default)
batch.bat

:: Batch process a custom input folder
batch.bat input/

:: Shape only, no textures (fastest)
batch.bat --no-texture

:: High quality (octree 384, 50 steps)
batch.bat --preset high

:: Dry run (show plan without generating)
batch.bat --dry-run

:: Combine options
batch.bat input/ --preset high --no-texture --dry-run

:: --- Post-batch pipeline ---

:: 1. Headless Blender cleanup + LODs (output/ -> processed/)
postprocess.bat

:: 2. Web compression: WebP textures + Draco mesh (processed/ -> processed/web/)
compress.bat
```

The full asset flow is:

```
inbox/ or input/   --batch.bat-->     output/*.glb   (~6 MB each, raw)
output/            --postprocess.bat--> processed/*.glb + processed/lods/  (cleaned, LODs)
processed/         --compress.bat-->   processed/web/*.glb              (~0.4 MB each)
processed/web/     --copy by hand-->   public/assets/models/buildings/  (game)
```

## Setup

### Prerequisites

- **Windows 10/11**
- **NVIDIA GPU** with 12GB+ VRAM (16GB recommended)
- **32GB+ RAM** (64GB+ recommended)
- **~40GB disk** for model weights
- **MSVC Build Tools 2022** (for texture C++ extensions)

### Step 1: Enable Windows Developer Mode

**Required** — HuggingFace downloads hard-fail without this.

Settings > Update & Security > For developers > Developer Mode > On

Verify:
```powershell
(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' AllowDevelopmentWithoutDevLicense).AllowDevelopmentWithoutDevLicense
# Should return: 1
```

### Step 2: Install Hunyuan3D-2 Portable Runtime

Download [YanWenKun/Hunyuan3D-2-WinPortable](https://github.com/YanWenKun/Hunyuan3D-2-WinPortable/releases/latest) (cu126 v4+). Extract so the structure is:

```
asset-pipeline/
  runtime/
    Hunyuan3D2_WinPortable/
      python_standalone/python.exe
      Hunyuan3D-2/hy3dgen/
      HuggingFaceHub/
```

### Step 3: Build Texture Extensions (one time)

```cmd
cd asset-pipeline
build_extensions.bat
```

Requires MSVC Build Tools 2022. Builds `custom_rasterizer` and `DifferentiableRenderer`.

### Step 4: Install Extra Dependencies (one time)

```cmd
runtime\Hunyuan3D2_WinPortable\python_standalone\python.exe -m pip install fast-simplification
```

### Step 5: First Run

```cmd
run.bat
```

First launch downloads ~20GB of model weights (one time). Subsequent launches use the cache.

### Step 6 (Optional): Discord / Midjourney Integration

Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `DISCORD_CHANNEL_ID` for automated Midjourney prompt submission.

## Usage

### Gradio Web UI (`run.bat`)

Three tabs at http://127.0.0.1:7860:

| Tab | What it does |
|---|---|
| **Generate** | Upload image, set params, generate GLB. Live progress. Batch queue at the bottom. |
| **Prompt Queue** | Subject text -> MJ prompt -> Discord -> download -> 3D -> auto-install GLB |
| **Animations** | GLB node inspector, procedural animation reference, UniRig setup |

### Batch CLI (`batch.bat`)

Process a folder of images in one command:

```cmd
batch.bat [input_folder] [options]
```

| Option | Default | Description |
|---|---|---|
| `input_folder` | `inbox/` | Folder of PNG/JPG images (e.g. `inbox/` or `input/`) |
| `--preset` | `balanced` | `fast` / `balanced` / `high` |
| `--no-texture` | off | Shape only (~10s), skip PBR textures |
| `--dry-run` | off | Show plan without generating |

**Workflow:**
1. Drop Midjourney PNGs into `inbox/` (or any folder)
2. Run `batch.bat` (or `batch.bat input/` for a custom folder)
3. GLBs appear in `output/`, source images move to `generated/` with simplified names

**Filename simplification:**
```
qurtyyy_A_small_sci-fi_pressurized_habitat_dome_building_roun_546e74eb-...  ->  habitat_dome
qurtyyy_A_small_sci-fi_command_center_building_model_fortifie_251fdb54-...  ->  command_center
qurtyyy_Stylized_sci-fi_shipyard_hangar_volcanic_planet_colon_9aa694dc-...  ->  shipyard
```

### Quality Presets

| Preset | Octree | Steps | CFG | Shape Time | Best for |
|---|---|---|---|---|---|
| `fast` | 256 | 20 | 7.5 | ~8s | Rapid iteration |
| `balanced` | 256 | 30 | 7.5 | ~11s | Default |
| `high` | 384 | 50 | 8.5 | ~18s | Final assets, sharp edges |

FlashVDM turbo decoder is enabled by default (45x faster VAE decode).

## Architecture

```
asset-pipeline/
  app.py              # Gradio UI (lightweight, no GPU — spawns workers)
  worker.py           # Subprocess worker (loads models, runs inference, exits)
  batch.py            # CLI batch processor
  pipeline_queue.py   # End-to-end queue: prompt -> MJ -> 3D -> install
  prompts.py          # Building prompt templates for Midjourney
  build_extensions.bat # One-time C++ extension build
  run.bat             # Launch script (env vars + portable Python)
  .env.example        # Discord/Ollama config template
  inbox/              # Drop images here for batch processing
  generated/          # Processed images move here (renamed)
  output/             # Generated GLBs + timing CSV

runtime/
  Hunyuan3D2_WinPortable/   # (not in git)
    python_standalone/       # Python 3.12 + PyTorch + CUDA
    Hunyuan3D-2/             # Model source code
    HuggingFaceHub/          # Model weight cache (~20GB)
```

### Subprocess Architecture

Each generation runs in a **fresh subprocess** (`worker.py`) with its own CUDA context. This eliminates VRAM fragmentation that caused 100x slowdowns on sequential runs. The Gradio process (`app.py`) stays lightweight — no AI models loaded, no GPU usage.

```
app.py (Gradio)                    worker.py (subprocess)
┌──────────────┐                   ┌──────────────────────┐
│ Save image   │──args.json───────>│ Load model           │
│ Spawn worker │                   │ Remove background    │
│ Stream stderr│<──live log────────│ Diffusion sampling   │
│ Read stdout  │<──result.json─────│ FlashVDM decode      │
│ Show GLB     │                   │ Mesh cleanup         │
└──────────────┘                   │ Texture baking       │
                                   │ Export GLB           │
                                   │ Exit (GPU released)  │
                                   └──────────────────────┘
```

## Generation Flow

```
Input Image
    │
    ▼
Background Removal (rembg birefnet-general)
    │
    ▼
Shape Diffusion (Hunyuan3D-2 DiT, 30-50 steps)
    │
    ▼
FlashVDM Volume Decode (turbo VAE, <0.1s)
    │
    ▼
GPU Marching Cubes (DMC, <0.1s)
    │
    ▼
Mesh Cleanup (remove disconnected components)
    │
    ├── [shape only] ──> Export GLB (~10s total)
    │
    ▼
Decimate (600K -> 80K faces)
    │
    ▼
Delight (remove lighting, 50 diffusion steps)
    │
    ▼
Multi-view Diffusion (6 views, 30 steps)
    │
    ▼
UV Unwrap (xatlas) + Texture Bake + Inpaint
    │
    ▼
Export Textured GLB (~2 min total)
```

## Game Integration

### Auto-loading GLBs

Copy to `public/assets/models/buildings/<type>.glb`:

```
command_center, thermal_extractor, mineral_drill, habitat_pod,
research_lab, warehouse, barracks, defense_turret, shipyard,
trade_depot, shield_gen
```

Game auto-loads at startup and swaps primitive placeholders.

### Building Shader

Imported GLBs get a stylized shader: toon diffuse, specular, procedural panel lines, weathering, rim light, lava underlight, team-color accent.

### Procedural Animations

Name child nodes in Blender to match:

| Node | Animation |
|---|---|
| `drill-arm` | Continuous Y rotation |
| `turret-barrel` | Sinusoidal Y scan |
| `holo-display` | Opacity pulse + slow rotation |
| `trade-pad` | Slow Y rotation |

## Performance

RTX 4080 16GB, FlashVDM enabled:

| Config | Shape Time | Total w/ Texture |
|---|---|---|
| oct256 / 30 steps (fast) | 8s | ~90s |
| oct256 / 30 steps (balanced) | 11s | ~95s |
| oct384 / 50 steps (high) | 18s | ~105s |
| Hunyuan3D-2mini + FlashVDM | 3.6s | ~80s |

## Troubleshooting

| Problem | Fix |
|---|---|
| `WinError 1314` on first run | Enable Windows Developer Mode (Setup step 1) |
| Second generation 100x slower | Should not happen with subprocess architecture. Restart `run.bat` if it does. |
| Machine unresponsive during texture | Normal — GPU at 100% for ~75s. Close Chrome/Discord to free GPU headroom. |
| `diffusion_pytorch_model.safetensors not found` | Cosmetic warning. Falls back to pickle. |
| `triton` not found | Cosmetic. Optional optimization, not required. |
| Shape hangs after Volume Decoding 100% | FlashVDM not enabled. Current `worker.py` enables it by default. |

## License

Pipeline code: MIT. Hunyuan3D-2 weights: [Tencent Hunyuan Community License](https://github.com/Tencent/Hunyuan3D-2/blob/main/LICENSE).
