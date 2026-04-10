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


# --- Non-generator wrapper for queue/programmatic use ---
def run_generation(image, asset_name, use_texture=True,
                   octree_resolution=256, inference_steps=30,
                   guidance_scale=7.5, decimate_faces=80000):
    """Blocking wrapper around generate_3d for use by pipeline_queue."""
    result = (None, "")
    for result in generate_3d(
        image, asset_name, use_texture,
        octree_resolution, inference_steps, guidance_scale,
        decimate_faces,
    ):
        pass  # drain the generator
    return result


# --- Animation helpers ---
def _inspect_glb(glb_file):
    """Load a GLB and return its node tree as a readable string."""
    if glb_file is None:
        return "Upload a GLB file to inspect its node tree."
    import trimesh
    try:
        scene = trimesh.load(glb_file.name if hasattr(glb_file, 'name') else str(glb_file))
    except Exception as e:
        return f"Failed to load GLB: {e}"
    lines = ["Node tree:", ""]

    if isinstance(scene, trimesh.Scene):
        for name, geom in scene.geometry.items():
            verts = len(geom.vertices) if hasattr(geom, 'vertices') else '?'
            faces = len(geom.faces) if hasattr(geom, 'faces') else '?'
            lines.append(f"  {name}  (verts={verts}, faces={faces})")
    elif isinstance(scene, trimesh.Trimesh):
        lines.append(f"  (single mesh)  verts={len(scene.vertices)}, faces={len(scene.faces)}")
    else:
        lines.append(f"  type: {type(scene).__name__}")

    lines.append("")
    lines.append("Game animate loop recognizes these node names:")
    lines.append("  drill-arm       -> continuous Y rotation (drilling)")
    lines.append("  drill-bit       -> continuous Z rotation")
    lines.append("  turret-barrel   -> sinusoidal Y rotation (scanning)")
    lines.append("  turret-light    -> pulsing scale")
    lines.append("  holo-display    -> opacity pulse + slow Y rotation")
    lines.append("  trade-pad       -> slow Y rotation")
    lines.append("  colony-shield   -> shield impact shader")
    lines.append("")
    lines.append("To use: rename nodes in Blender to match, re-export GLB.")
    lines.append("The game's normalizeBuildingGlb() auto-applies the stylized")
    lines.append("building shader to any mesh with a texture map.")
    return "\n".join(lines)


def _install_unirig():
    """Attempt to install UniRig for local auto-rigging."""
    import subprocess
    log = []
    log.append("Installing UniRig (SIGGRAPH 2025 auto-rigging)...")
    log.append("Repository: github.com/VAST-AI-Research/UniRig")
    log.append("")
    try:
        result = subprocess.run(
            ["pip", "install", "unirig"],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode == 0:
            log.append("UniRig installed successfully!")
            log.append(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)
        else:
            log.append("pip install unirig failed. Manual setup may be required:")
            log.append(result.stderr[-500:] if len(result.stderr) > 500 else result.stderr)
            log.append("")
            log.append("Manual install:")
            log.append("  git clone https://github.com/VAST-AI-Research/UniRig")
            log.append("  cd UniRig && pip install -e .")
    except FileNotFoundError:
        log.append("pip not found. Use the portable runtime's pip:")
        log.append("  runtime\\Hunyuan3D2_WinPortable\\python_standalone\\python.exe -m pip install unirig")
    except Exception as e:
        log.append(f"Error: {e}")
    return "\n".join(log)


# --- Gradio UI ---
CUSTOM_CSS = """
.gradio-container { max-width: 1200px !important; margin: 0 auto; }
#title { text-align: center; color: #00d4ff; font-family: monospace; }
#subtitle { text-align: center; color: #888; }
"""

with gr.Blocks(title="Ignisium Asset Pipeline", css=CUSTOM_CSS, theme=gr.themes.Base()) as app:
    gr.Markdown("# Ignisium Asset Pipeline", elem_id="title")
    gr.Markdown(
        "Image → 3D → Texture → Animate → Game. All local.",
        elem_id="subtitle",
    )

    with gr.Tabs():
        # ==============================================================
        # TAB 1: Generate (image-to-3D)
        # ==============================================================
        with gr.TabItem("Generate"):
            with gr.Row():
                with gr.Column(scale=1):
                    image_input = gr.Image(
                        type="pil",
                        label="Concept Image (PNG with transparent bg preferred)",
                        height=380,
                    )
                    asset_name_input = gr.Textbox(
                        label="Asset Name", value="command_center",
                        info="Alphanumeric + underscores. Timestamp auto-appended.",
                    )
                    texture_toggle = gr.Checkbox(
                        label="Generate PBR textures", value=True,
                        info="Adds ~90s. Shape-only takes ~20s.",
                    )
                    with gr.Accordion("Shape parameters", open=False):
                        octree_slider = gr.Slider(
                            minimum=128, maximum=512, value=256, step=64,
                            label="Octree resolution",
                            info="256=fast, 384=detailed, 512=max (slow).",
                        )
                        steps_slider = gr.Slider(
                            minimum=15, maximum=60, value=30, step=5,
                            label="Inference steps",
                            info="30=default, 50=higher quality.",
                        )
                        cfg_slider = gr.Slider(
                            minimum=3.0, maximum=12.0, value=7.5, step=0.5,
                            label="Guidance scale",
                            info="7.5=default, 9-10=sharper adherence.",
                        )
                    with gr.Accordion("Texture parameters", open=False):
                        decimate_slider = gr.Slider(
                            minimum=20000, maximum=200000, value=80000, step=10000,
                            label="Decimate target faces",
                            info="80K=fast (~1 min UV unwrap), 200K=detailed (~5 min).",
                        )
                    generate_btn = gr.Button("Generate 3D Model", variant="primary", size="lg")

                with gr.Column(scale=1):
                    file_output = gr.File(label="Generated GLB")
                    status_output = gr.Textbox(
                        label="Status (live updates)", lines=18, max_lines=30,
                        interactive=False,
                    )

            generate_btn.click(
                fn=generate_3d,
                inputs=[image_input, asset_name_input, texture_toggle,
                        octree_slider, steps_slider, cfg_slider, decimate_slider],
                outputs=[file_output, status_output],
            )

        # ==============================================================
        # TAB 2: Prompt Queue (Midjourney / Discord)
        # ==============================================================
        with gr.TabItem("Prompt Queue"):
            gr.Markdown(
                "### Prompt → Midjourney → 3D → Game\n"
                "Add a job: generates an MJ prompt from your subject text, "
                "submits to Midjourney via Discord, downloads the upscaled image, "
                "runs Hunyuan3D-2, and auto-installs the GLB into the game.\n\n"
                "Without `DISCORD_TOKEN` in `.env`, stops at 'prompt ready' — "
                "paste a PNG into `inbox/<job_id>.png` manually."
            )

            _queue_singleton = {"q": None}

            def _get_queue():
                if _queue_singleton["q"] is None:
                    from pipeline_queue import PipelineQueue
                    _queue_singleton["q"] = PipelineQueue.instance()
                return _queue_singleton["q"]

            _TERMINAL_STATES = {"done", "failed", "cancelled"}

            def _format_jobs_table(jobs):
                rows = []
                for j in jobs:
                    cancel_cell = "—" if j.state in _TERMINAL_STATES else "✕ Cancel"
                    rows.append([
                        cancel_cell, j.id, j.asset_name, j.preset, j.state,
                        j.subject[:60] + ("..." if len(j.subject) > 60 else ""),
                        Path(j.installed_path).name if j.installed_path else
                            (Path(j.glb_path).name if j.glb_path else ""),
                        j.error[:80] if j.error else "",
                    ])
                return rows

            def _refresh_queue_ui():
                return _format_jobs_table(_get_queue().list_jobs())

            def _add_queue_job(subject, asset_name, preset):
                if not subject.strip():
                    return _refresh_queue_ui(), "ERROR: subject text is empty"
                job = _get_queue().add_job(subject, asset_name, preset)
                return _refresh_queue_ui(), f"Added job {job.id} ({job.asset_name})"

            def _view_job_log(job_id):
                if not job_id.strip():
                    return "Enter a job id"
                job = _get_queue().get_job(job_id.strip())
                if job is None:
                    return f"No job with id {job_id}"
                return "\n".join([
                    f"id:        {job.id}", f"state:     {job.state}",
                    f"subject:   {job.subject}", f"asset:     {job.asset_name}",
                    f"preset:    {job.preset}", f"prompt:    {job.prompt}",
                    f"mj_image:  {job.mj_local_path}", f"glb:       {job.glb_path}",
                    f"installed: {job.installed_path}", f"error:     {job.error}",
                    "", "log:", *job.log,
                ])

            def _cancel_job(job_id):
                if not job_id.strip():
                    return _refresh_queue_ui(), "Enter a job id"
                _get_queue().cancel_job(job_id.strip())
                return _refresh_queue_ui(), f"Cancelled {job_id.strip()}"

            def _on_table_select(evt: gr.SelectData):
                if evt is None or evt.index is None:
                    return _refresh_queue_ui(), "", "", ""
                if isinstance(evt.index, (list, tuple)) and len(evt.index) >= 2:
                    row, col = evt.index[0], evt.index[1]
                else:
                    row, col = evt.index, -1
                jobs = _get_queue().list_jobs()
                if row is None or row >= len(jobs):
                    return _refresh_queue_ui(), "", "", ""
                job = jobs[row]
                if col == 0 and job.state not in _TERMINAL_STATES:
                    _get_queue().cancel_job(job.id)
                    return (_refresh_queue_ui(), job.id, _view_job_log(job.id),
                            f"Cancelled {job.id}")
                return (_refresh_queue_ui(), job.id, _view_job_log(job.id),
                        f"Selected {job.id}")

            from prompts import BUILDING_PROMPTS
            _BUILDING_CHOICES = ["(custom)"] + [
                f"{v['label']} ({k})" for k, v in BUILDING_PROMPTS.items()
            ]

            def _on_building_pick(choice):
                if not choice or choice == "(custom)":
                    return gr.update(), gr.update()
                if "(" in choice and choice.endswith(")"):
                    key = choice.rsplit("(", 1)[1].rstrip(")")
                else:
                    key = choice
                info = BUILDING_PROMPTS.get(key)
                if not info:
                    return gr.update(), gr.update()
                return gr.update(value=info["subject"]), gr.update(value=key)

            with gr.Row():
                with gr.Column(scale=1):
                    q_building_pick = gr.Dropdown(
                        choices=_BUILDING_CHOICES, value="(custom)",
                        label="Pick a building (or custom)",
                    )
                    q_subject = gr.Textbox(
                        label="Subject (short sentence)", lines=3,
                        placeholder="command center, four corner pylons, window slits",
                    )
                    q_asset_name = gr.Textbox(
                        label="Asset name (snake_case)", value="command_center",
                    )
                    q_preset = gr.Dropdown(
                        choices=["fast", "balanced", "high", "max"], value="high",
                        label="Quality preset",
                    )
                    q_add_btn = gr.Button("Add to queue", variant="primary")
                    q_add_status = gr.Textbox(label="Last action", interactive=False)

                    q_building_pick.change(
                        fn=_on_building_pick, inputs=q_building_pick,
                        outputs=[q_subject, q_asset_name],
                    )

                with gr.Column(scale=2):
                    q_table = gr.Dataframe(
                        headers=["", "id", "asset", "preset", "state",
                                 "subject", "result", "error"],
                        datatype=["str"] * 8, value=[], interactive=False,
                        wrap=True, row_count=(0, "dynamic"),
                        label="Jobs (click ✕ to cancel, click row to view log)",
                    )
                    with gr.Row():
                        q_refresh_btn = gr.Button("Refresh")
                        q_job_id = gr.Textbox(label="Job id", scale=1)
                        q_view_btn = gr.Button("View log")
                        q_cancel_btn = gr.Button("Cancel job", variant="stop")
                    q_log = gr.Textbox(
                        label="Job detail", lines=15, max_lines=30,
                        interactive=False,
                    )

            q_add_btn.click(fn=_add_queue_job,
                            inputs=[q_subject, q_asset_name, q_preset],
                            outputs=[q_table, q_add_status])
            q_refresh_btn.click(fn=_refresh_queue_ui, outputs=q_table)
            q_view_btn.click(fn=_view_job_log, inputs=q_job_id, outputs=q_log)
            q_cancel_btn.click(fn=_cancel_job, inputs=q_job_id,
                               outputs=[q_table, q_add_status])
            q_table.select(fn=_on_table_select,
                           outputs=[q_table, q_job_id, q_log, q_add_status])
            app.load(fn=_refresh_queue_ui, outputs=q_table)

        # ==============================================================
        # TAB 3: Animations
        # ==============================================================
        with gr.TabItem("Animations"):
            gr.Markdown(
                "### Local Animation Tooling\n"
                "Inspect GLB node trees, configure procedural building animations, "
                "and (optionally) auto-rig characters with UniRig."
            )

            with gr.Row():
                with gr.Column(scale=1):
                    gr.Markdown("#### GLB Node Inspector")
                    anim_glb_input = gr.File(
                        label="Upload a GLB to inspect",
                        file_types=[".glb", ".gltf"],
                    )
                    anim_inspect_btn = gr.Button("Inspect Nodes")
                    anim_node_tree = gr.Textbox(
                        label="Node tree & animation reference",
                        lines=20, max_lines=35, interactive=False,
                        value=_inspect_glb(None),
                    )
                    anim_inspect_btn.click(
                        fn=_inspect_glb, inputs=anim_glb_input,
                        outputs=anim_node_tree,
                    )

                with gr.Column(scale=1):
                    gr.Markdown("#### Building Animations (Procedural)")
                    gr.Markdown(
                        "Buildings use **transform-based** animations in Three.js — "
                        "no skeletal rig needed. The game's `animate()` loop checks "
                        "node names and applies:\n\n"
                        "| Node name | Animation |\n"
                        "|---|---|\n"
                        "| `drill-arm` | Continuous Y rotation |\n"
                        "| `drill-bit` | Continuous Z rotation |\n"
                        "| `turret-barrel` | Sinusoidal Y scan |\n"
                        "| `turret-light` | Pulsing scale |\n"
                        "| `holo-display` | Opacity pulse + slow rotation |\n"
                        "| `trade-pad` | Slow Y rotation |\n\n"
                        "**To add animations to a GLB:**\n"
                        "1. Open the GLB in Blender\n"
                        "2. Name movable parts using the names above\n"
                        "3. Re-export as GLB\n"
                        "4. Copy to `public/assets/models/buildings/`\n\n"
                        "The game auto-applies the stylized building shader "
                        "(toon lighting, panel lines, rim light, lava underlight) "
                        "to any textured GLB mesh."
                    )

                    gr.Markdown("#### Character Rigging (UniRig)")
                    gr.Markdown(
                        "For humanoid/creature units that need skeletal animation:\n\n"
                        "**UniRig** (SIGGRAPH 2025) auto-rigs arbitrary 3D shapes "
                        "locally on your GPU. Produces skeleton + skinning weights "
                        "that can be exported with animations to GLB.\n\n"
                        "Requires: Python, PyTorch, CUDA. "
                        "Your RTX 4080 + 96GB RAM can handle it."
                    )
                    unirig_install_btn = gr.Button("Install UniRig")
                    unirig_status = gr.Textbox(
                        label="UniRig install log", lines=10,
                        interactive=False,
                    )
                    unirig_install_btn.click(
                        fn=_install_unirig, outputs=unirig_status,
                    )


def _shutdown():
    """Clean up VRAM and save queue state on exit."""
    print("\nShutting down...")
    _free_vram()
    # Flush queue state if it was ever initialized
    try:
        if _queue_singleton.get("q") is not None:
            _queue_singleton["q"].store.save()
            print("    Queue state saved.")
    except Exception:
        pass
    print("    VRAM released. Goodbye.")


if __name__ == "__main__":
    import atexit
    import signal

    atexit.register(_shutdown)

    # Handle Ctrl+C and window-close (SIGBREAK on Windows)
    def _signal_handler(sig, frame):
        print(f"\nReceived signal {sig}, shutting down gracefully...")
        _shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)
    # SIGBREAK fires when a Windows console window is closed via the X button
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, _signal_handler)

    app.launch(
        server_name="127.0.0.1",
        server_port=7860,
        share=False,
        inbrowser=True,
    )
