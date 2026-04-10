"""
Ignisium Asset Pipeline
-----------------------
Gradio UI for generating 3D GLB assets from concept images using
Tencent's Hunyuan3D-2 model locally.

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

print("\n" + "=" * 60)
print("Ready. Open http://127.0.0.1:7860 in your browser.")
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


# --- Generation function (yields status updates for real-time progress) ---
def generate_3d(
    image, asset_name, use_texture,
    octree_resolution, inference_steps, guidance_scale,
    decimate_faces,
):
    if image is None:
        yield None, "ERROR: Please upload an image first."
        return

    name = (asset_name or "asset").strip().replace(" ", "_")
    name = "".join(c for c in name if c.isalnum() or c in "_-") or "asset"
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    out_path = OUTPUT_DIR / f"{name}_{timestamp}.glb"

    log = []
    def _status(msg):
        log.append(f"[{time.strftime('%H:%M:%S')}] {msg}")
        return "\n".join(log)

    start = time.time()

    # --- Shape ---
    yield None, _status("Loading shape model...")
    _free_vram()
    shape_pipe = _load_shape()

    yield None, _status(f"Generating shape (octree={octree_resolution}, steps={inference_steps}, cfg={guidance_scale})...")
    try:
        mesh = shape_pipe(
            image=image,
            num_inference_steps=int(inference_steps),
            guidance_scale=float(guidance_scale),
            octree_resolution=int(octree_resolution),
            num_chunks=8000,
        )[0]
    except Exception as e:
        yield None, _status(f"ERROR: Shape generation failed: {e}")
        return
    yield None, _status(f"  Shape done in {time.time()-start:.1f}s — verts={len(mesh.vertices)}, faces={len(mesh.faces)}")

    del shape_pipe
    _free_vram()

    # --- Texture ---
    if use_texture:
        target = int(decimate_faces)
        if len(mesh.faces) > target:
            yield None, _status(f"Decimating {len(mesh.faces)} → {target} faces...")
            mesh = mesh.simplify_quadric_decimation(face_count=target)
            yield None, _status(f"  Decimated: verts={len(mesh.vertices)}, faces={len(mesh.faces)}")

        yield None, _status("Loading texture model...")
        tex_pipe = _load_texture()
        if tex_pipe is not None:
            tex_pipe.enable_model_cpu_offload()
            yield None, _status("Baking PBR textures (delight → UV unwrap → multiview → bake)...")
            tex_start = time.time()
            try:
                mesh = tex_pipe(mesh, image=image)
                yield None, _status(f"  Texture done in {time.time()-tex_start:.1f}s")
            except Exception as e:
                import traceback; traceback.print_exc()
                yield None, _status(f"  WARNING: Texture failed ({e}) — exporting untextured")
            del tex_pipe
            _free_vram()
        else:
            yield None, _status("  (Texture pipeline not available)")

    # --- Export ---
    yield None, _status("Exporting GLB...")
    try:
        mesh.export(str(out_path))
    except Exception as e:
        yield None, _status(f"ERROR: Export failed: {e}")
        return

    total = time.time() - start
    _status(f"Done in {total:.1f}s")
    _status(f"Saved: {out_path}")
    yield str(out_path), "\n".join(log)


# --- Gradio UI ---
CUSTOM_CSS = """
.gradio-container { max-width: 1200px !important; margin: 0 auto; }
#title { text-align: center; color: #00d4ff; font-family: monospace; }
#subtitle { text-align: center; color: #888; }
"""

with gr.Blocks(title="Ignisium Asset Pipeline", css=CUSTOM_CSS, theme=gr.themes.Base()) as app:
    gr.Markdown("# Ignisium Asset Pipeline", elem_id="title")
    gr.Markdown(
        "Upload a concept image → 3D GLB model. Hunyuan3D-2 shape + optional PBR textures.",
        elem_id="subtitle",
    )

    with gr.Row():
        # --- Left: inputs ---
        with gr.Column(scale=1):
            image_input = gr.Image(
                type="pil",
                label="Concept Image (PNG with transparent bg preferred)",
                height=380,
            )
            asset_name_input = gr.Textbox(
                label="Asset Name",
                value="command_center",
                info="Alphanumeric + underscores. Timestamp auto-appended.",
            )
            texture_toggle = gr.Checkbox(
                label="Generate PBR textures",
                value=True,
                info="Adds ~90s. Shape-only takes ~20s.",
            )

            with gr.Accordion("Shape parameters", open=False):
                octree_slider = gr.Slider(
                    minimum=128, maximum=512, value=256, step=64,
                    label="Octree resolution",
                    info="Marching-cubes grid. 256=fast (20s), 384=detailed (slower), 512=max (very slow).",
                )
                steps_slider = gr.Slider(
                    minimum=15, maximum=60, value=30, step=5,
                    label="Inference steps",
                    info="Diffusion steps. 30=default, 50=higher quality, 60=diminishing returns.",
                )
                cfg_slider = gr.Slider(
                    minimum=3.0, maximum=12.0, value=7.5, step=0.5,
                    label="Guidance scale",
                    info="How strictly to follow the input. 7.5=default, 9-10=sharper adherence.",
                )

            with gr.Accordion("Texture parameters", open=False):
                decimate_slider = gr.Slider(
                    minimum=20000, maximum=200000, value=80000, step=10000,
                    label="Decimate target faces",
                    info="Mesh is decimated before UV unwrap. 80K=fast (~1 min), 200K=detailed (~5 min).",
                )

            generate_btn = gr.Button(
                "Generate 3D Model",
                variant="primary",
                size="lg",
            )

        # --- Right: outputs ---
        with gr.Column(scale=1):
            file_output = gr.File(label="Generated GLB")
            status_output = gr.Textbox(
                label="Status (live updates)",
                lines=18,
                max_lines=30,
                interactive=False,
            )

    generate_btn.click(
        fn=generate_3d,
        inputs=[
            image_input, asset_name_input, texture_toggle,
            octree_slider, steps_slider, cfg_slider,
            decimate_slider,
        ],
        outputs=[file_output, status_output],
    )

    gr.Markdown(
        """
        ---
        ### Workflow
        1. Generate concept art with Midjourney/SDXL (see `PROMPTS.md`)
        2. Upload here, tweak params, click Generate
        3. GLB saved to `output/` — copy to `public/assets/models/buildings/<type>.glb`
        4. Game auto-loads GLBs on startup and swaps primitive placeholders
        """
    )


if __name__ == "__main__":
    app.launch(
        server_name="127.0.0.1",
        server_port=7860,
        share=False,
        inbrowser=True,
    )
