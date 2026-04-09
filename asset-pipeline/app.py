"""
Ignisium Asset Pipeline
-----------------------
Simple Gradio UI for generating 3D GLB assets from concept images
using Tencent's Hunyuan3D-2 model locally.

Drop a concept image, name the asset, click generate. GLB lands in output/.
"""

import sys
import time
from pathlib import Path

import gradio as gr
from PIL import Image

# --- Setup paths ---
SCRIPT_DIR = Path(__file__).parent.resolve()
OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Make sure the cloned Hunyuan3D-2 repo is importable
HUNYUAN_DIR = SCRIPT_DIR / "Hunyuan3D-2"
if HUNYUAN_DIR.exists():
    sys.path.insert(0, str(HUNYUAN_DIR))

# --- Load models (happens once at startup) ---
print("=" * 60)
print("Ignisium Asset Pipeline — starting up")
print("=" * 60)

shape_pipeline = None
texture_pipeline = None

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

try:
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    print("\n[1/2] Loading shape generation model (~10 GB download first time)...")
    shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        "tencent/Hunyuan3D-2"
    )
    print("    Shape model loaded.")
except Exception as e:
    print(f"ERROR loading shape pipeline: {e}")
    print("Make sure you ran setup_windows.bat successfully.")
    sys.exit(1)

try:
    from hy3dgen.texgen import Hunyuan3DPaintPipeline
    print("\n[2/2] Loading texture generation model...")
    texture_pipeline = Hunyuan3DPaintPipeline.from_pretrained(
        "tencent/Hunyuan3D-2"
    )
    print("    Texture model loaded.")
except Exception as e:
    print(f"\nWARNING: Texture pipeline failed to load: {e}")
    print("You can still generate UNTEXTURED meshes. Fix texture deps later.")
    texture_pipeline = None

print("\n" + "=" * 60)
print("Ready. Open http://127.0.0.1:7860 in your browser.")
print("=" * 60)


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
    filename = f"{name}_{timestamp}.glb"
    out_path = OUTPUT_DIR / filename

    status = []
    start = time.time()

    # Step 1: shape
    progress(0.1, desc="Generating 3D shape...")
    status.append(f"[{time.strftime('%H:%M:%S')}] Generating shape from image...")
    try:
        mesh = shape_pipeline(image=image)[0]
    except Exception as e:
        return None, f"Shape generation failed: {e}"
    status.append(f"    Shape done in {time.time() - start:.1f}s")

    # Step 2: texture (optional)
    if use_texture and texture_pipeline is not None:
        progress(0.5, desc="Generating PBR textures...")
        tex_start = time.time()
        status.append(f"[{time.strftime('%H:%M:%S')}] Baking textures...")
        try:
            mesh = texture_pipeline(mesh, image=image)
            status.append(f"    Texture done in {time.time() - tex_start:.1f}s")
        except Exception as e:
            status.append(f"    WARNING: Texture failed ({e}) — exporting untextured")
    elif use_texture:
        status.append("    (Texture skipped — pipeline not available)")

    # Step 3: export
    progress(0.9, desc="Exporting GLB...")
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
                info="Slower. Requires working CUDA texture baker.",
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
                lines=12,
                max_lines=20,
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
