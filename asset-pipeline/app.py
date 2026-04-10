"""
Ignisium Asset Pipeline
-----------------------
Simple Gradio UI for generating 3D GLB assets from concept images
using Tencent's Hunyuan3D-2 model locally.

Drop a concept image, name the asset, click generate. GLB lands in output/.

Pipelines are loaded on demand and freed between phases so that the shape
and texture models don't fight for VRAM on a 16 GB card.
"""

import gc
import sys
import time
from pathlib import Path

import gradio as gr
from PIL import Image

# --- Setup paths ---
SCRIPT_DIR = Path(__file__).parent.resolve()
OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Make sure the cloned Hunyuan3D-2 repo is importable.
# It lives inside the YanWenKun portable runtime now, not directly under
# asset-pipeline/, so check both locations.
HUNYUAN_DIR = SCRIPT_DIR / "runtime" / "Hunyuan3D2_WinPortable" / "Hunyuan3D-2"
if not HUNYUAN_DIR.exists():
    HUNYUAN_DIR = SCRIPT_DIR / "Hunyuan3D-2"
if HUNYUAN_DIR.exists():
    sys.path.insert(0, str(HUNYUAN_DIR))

# --- Startup checks ---
print("=" * 60)
print("Ignisium Asset Pipeline — starting up")
print("=" * 60)

try:
    import torch
    print(f"PyTorch: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"CUDA device: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
except ImportError:
    print("ERROR: PyTorch not installed. Run setup_windows.bat first.")
    sys.exit(1)

# Verify imports are available (but don't load weights yet)
try:
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    print("Shape pipeline (hy3dgen.shapegen): importable")
except ImportError as e:
    print(f"ERROR: Shape pipeline not importable: {e}")
    sys.exit(1)

_tex_available = False
try:
    from hy3dgen.texgen import Hunyuan3DPaintPipeline
    print("Texture pipeline (hy3dgen.texgen): importable")
    _tex_available = True
except ImportError as e:
    print(f"WARNING: Texture pipeline not importable: {e}")
    print("Shape-only generation will still work.")

print("\n" + "=" * 60)
print("Ready. Open http://127.0.0.1:7860 in your browser.")
print("Pipelines load on demand — first generation takes ~15s extra.")
print("=" * 60)


def _free_vram():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _load_shape():
    print("\nLoading shape pipeline...")
    pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained("tencent/Hunyuan3D-2")
    print("    Shape pipeline ready.")
    return pipe


def _load_texture():
    if not _tex_available:
        return None
    print("\nLoading texture pipeline...")
    pipe = Hunyuan3DPaintPipeline.from_pretrained("tencent/Hunyuan3D-2")
    print("    Texture pipeline ready.")
    return pipe


# --- Generation function ---
def generate_3d(image, asset_name, use_texture, progress=gr.Progress()):
    if image is None:
        return None, "ERROR: Please upload an image first."

    # Sanitize filename
    name = (asset_name or "asset").strip().replace(" ", "_")
    name = "".join(c for c in name if c.isalnum() or c in "_-")
    if not name:
        name = "asset"

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    out_path = OUTPUT_DIR / f"{name}_{timestamp}.glb"

    status = []
    start = time.time()

    # Step 1: shape
    progress(0.05, desc="Loading shape model...")
    status.append(f"[{time.strftime('%H:%M:%S')}] Loading shape model...")
    _free_vram()
    shape_pipe = _load_shape()

    progress(0.15, desc="Generating 3D shape...")
    status.append(f"[{time.strftime('%H:%M:%S')}] Generating shape from image...")
    try:
        mesh = shape_pipe(
            image=image,
            num_inference_steps=30,
            guidance_scale=7.5,
            octree_resolution=256,
            num_chunks=8000,
        )[0]
    except Exception as e:
        return None, f"Shape generation failed: {e}"
    shape_time = time.time() - start
    status.append(f"    Shape done in {shape_time:.1f}s (verts={len(mesh.vertices)})")

    # Free shape VRAM before texture
    del shape_pipe
    _free_vram()

    # Step 2: texture (optional)
    if use_texture:
        # Decimate mesh for texture baking — xatlas UV unwrap is O(n^2) on
        # face count and takes 30+ min at 600K+ faces. 80K faces is fast
        # (~1 min) and doesn't hurt texture quality since the 2048x2048
        # texture map is the resolution bottleneck, not vertex density.
        TARGET_FACES = 80000
        if len(mesh.faces) > TARGET_FACES:
            progress(0.45, desc="Decimating mesh for UV unwrap...")
            status.append(f"[{time.strftime('%H:%M:%S')}] Decimating {len(mesh.faces)} -> {TARGET_FACES} faces...")
            mesh = mesh.simplify_quadric_decimation(face_count=TARGET_FACES)
            status.append(f"    Decimated: verts={len(mesh.vertices)}, faces={len(mesh.faces)}")

        progress(0.50, desc="Loading texture model...")
        status.append(f"[{time.strftime('%H:%M:%S')}] Loading texture model...")
        tex_pipe = _load_texture()
        if tex_pipe is not None:
            tex_pipe.enable_model_cpu_offload()
            progress(0.60, desc="Baking PBR textures...")
            tex_start = time.time()
            status.append(f"[{time.strftime('%H:%M:%S')}] Baking textures...")
            try:
                mesh = tex_pipe(mesh, image=image)
                status.append(f"    Texture done in {time.time() - tex_start:.1f}s")
            except Exception as e:
                import traceback; traceback.print_exc()
                status.append(f"    WARNING: Texture failed ({e}) — exporting untextured")
            del tex_pipe
            _free_vram()
        else:
            status.append("    (Texture pipeline not available)")

    # Step 3: export
    progress(0.90, desc="Exporting GLB...")
    status.append(f"[{time.strftime('%H:%M:%S')}] Exporting GLB...")
    try:
        mesh.export(str(out_path))
    except Exception as e:
        return None, f"Export failed: {e}"

    total = time.time() - start
    status.append(f"\nDone in {total:.1f}s")
    status.append(f"Saved: {out_path}")

    return str(out_path), "\n".join(status)


# --- Gradio UI ---
CUSTOM_CSS = """
.gradio-container { max-width: 1100px !important; margin: 0 auto; }
#title { text-align: center; color: #00d4ff; font-family: monospace; }
#subtitle { text-align: center; color: #888; }
"""

with gr.Blocks(title="Ignisium Asset Pipeline", css=CUSTOM_CSS, theme=gr.themes.Base()) as app:
    gr.Markdown("# Ignisium Asset Pipeline", elem_id="title")
    gr.Markdown(
        "Upload a concept image of a building or unit. Generates a 3D GLB model.",
        elem_id="subtitle",
    )

    with gr.Row():
        with gr.Column(scale=1):
            image_input = gr.Image(
                type="pil",
                label="Concept Image (PNG with transparent bg preferred)",
                height=400,
            )
            asset_name_input = gr.Textbox(
                label="Asset Name",
                value="command_center",
                info="Alphanumeric, underscores OK. Timestamp auto-appended.",
            )
            texture_toggle = gr.Checkbox(
                label="Generate PBR textures",
                value=True,
                info="Adds ~2-5 min for texture baking. Untextured shape-only takes ~20s.",
            )
            generate_btn = gr.Button(
                "Generate 3D Model",
                variant="primary",
                size="lg",
            )

        with gr.Column(scale=1):
            file_output = gr.File(label="Generated GLB")
            status_output = gr.Textbox(
                label="Status",
                lines=15,
                max_lines=25,
                interactive=False,
            )

    generate_btn.click(
        fn=generate_3d,
        inputs=[image_input, asset_name_input, texture_toggle],
        outputs=[file_output, status_output],
    )

    gr.Markdown(
        """
        ---
        ### Workflow
        1. Generate concept art with Midjourney/SDXL (see `PROMPTS.md`)
        2. Upload here, click Generate
        3. GLB file saved to `output/` — copy into your game's assets folder
        4. Load in Three.js with `GLTFLoader`
        """
    )


if __name__ == "__main__":
    app.launch(
        server_name="127.0.0.1",
        server_port=7860,
        share=False,
        inbrowser=True,
    )
