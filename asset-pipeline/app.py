"""
Ignisium Asset Pipeline
-----------------------
Gradio UI for generating 3D GLB assets from concept images using
Tencent's Hunyuan3D-2 model locally.

Each generation runs in a subprocess (worker.py) with a fresh CUDA
context, eliminating VRAM fragmentation that caused 100x slowdowns
on sequential runs. FlashVDM turbo decoder is enabled by default.
"""

import json
import os
import subprocess
import sys
import time
import threading
import queue as _queue_mod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import gradio as gr
from PIL import Image

# --- Setup paths ---
SCRIPT_DIR = Path(__file__).parent.resolve()
OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

PORTABLE_DIR = SCRIPT_DIR / "runtime" / "Hunyuan3D2_WinPortable"
PORTABLE_PY = PORTABLE_DIR / "python_standalone" / "python.exe"
WORKER_SCRIPT = SCRIPT_DIR / "worker.py"

# --- Startup checks ---
print("=" * 60)
print("Ignisium Asset Pipeline — starting up")
print("=" * 60)
print(f"Worker:  {WORKER_SCRIPT}")
print(f"Python:  {PORTABLE_PY}")
print(f"Output:  {OUTPUT_DIR}")

if not PORTABLE_PY.exists():
    print(f"WARNING: Portable Python not found at {PORTABLE_PY}")
    print("Falling back to system Python.")
    PORTABLE_PY = Path(sys.executable)

print("\n" + "=" * 60)
print("Ready. Open http://127.0.0.1:7860 in your browser.")
print("Each generation spawns a subprocess with a clean GPU context.")
print("=" * 60)


# --- Subprocess-based generation ---
def _get_worker_env():
    """Build env vars for the worker subprocess."""
    env = os.environ.copy()
    env["HF_HUB_CACHE"] = str(PORTABLE_DIR / "HuggingFaceHub")
    env["HY3DGEN_MODELS"] = str(PORTABLE_DIR / "HuggingFaceHub")
    env["PYTHONPYCACHEPREFIX"] = str(PORTABLE_DIR / "pycache")
    env["PYTHONUNBUFFERED"] = "1"
    env["PATH"] = (str(PORTABLE_DIR / "MinGit" / "cmd") + ";" +
                   str(PORTABLE_DIR / "python_standalone" / "Scripts") + ";" +
                   env.get("PATH", ""))
    return env


def generate_3d(
    image, asset_name, use_texture,
    octree_resolution, inference_steps, guidance_scale,
    decimate_faces, remove_background,
):
    """Spawn worker.py in a fresh subprocess with clean CUDA context."""
    if image is None:
        yield None, "ERROR: Please upload an image first."
        return

    name = (asset_name or "asset").strip().replace(" ", "_")
    name = "".join(c for c in name if c.isalnum() or c in "_-") or "asset"
    timestamp = time.strftime("%Y%m%d_%H%M%S")

    tmp_img = OUTPUT_DIR / f"_tmp_input_{timestamp}.png"
    image.save(str(tmp_img))

    args_json = json.dumps({
        "image_path": str(tmp_img),
        "asset_name": name,
        "use_texture": bool(use_texture),
        "octree_resolution": int(octree_resolution),
        "inference_steps": int(inference_steps),
        "guidance_scale": float(guidance_scale),
        "decimate_faces": int(decimate_faces),
        "remove_background": bool(remove_background),
        "use_flashvdm": True,
    })

    yield None, f"[{time.strftime('%H:%M:%S')}] Spawning worker (clean GPU context)..."

    proc = subprocess.Popen(
        [str(PORTABLE_PY), "-u", str(WORKER_SCRIPT), args_json],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, env=_get_worker_env(), cwd=str(SCRIPT_DIR),
    )

    log_lines = [f"[{time.strftime('%H:%M:%S')}] Worker started (PID {proc.pid})"]
    yield None, "\n".join(log_lines)

    while True:
        line = proc.stderr.readline()
        if not line and proc.poll() is not None:
            break
        if line:
            log_lines.append(line.rstrip())
            yield None, "\n".join(log_lines)

    stdout = proc.stdout.read().strip()
    retcode = proc.returncode

    try:
        tmp_img.unlink()
    except Exception:
        pass

    if retcode != 0:
        log_lines.append(f"\nERROR: Worker exited with code {retcode}")
        if stdout:
            log_lines.append(stdout[-500:])
        yield None, "\n".join(log_lines)
        return

    try:
        result = json.loads(stdout)
        glb_path = result.get("glb_path", "")
        log_lines.append(f"\nGPU memory fully released (subprocess exited).")
        yield glb_path, "\n".join(log_lines)
    except json.JSONDecodeError:
        log_lines.append(f"\nERROR: Bad worker output: {stdout[:200]}")
        yield None, "\n".join(log_lines)


def run_generation(image, asset_name, use_texture=True,
                   octree_resolution=256, inference_steps=30,
                   guidance_scale=7.5, decimate_faces=80000,
                   remove_background=True):
    """Blocking wrapper for queue/programmatic use."""
    result = (None, "")
    for result in generate_3d(
        image, asset_name, use_texture,
        octree_resolution, inference_steps, guidance_scale,
        decimate_faces, remove_background,
    ):
        pass
    return result


# --- Generation Queue ---
@dataclass
class GenJob:
    id: int
    image: Image.Image
    asset_name: str
    use_texture: bool
    octree_resolution: int
    inference_steps: int
    guidance_scale: float
    decimate_faces: int
    remove_background: bool
    state: str = "queued"
    glb_path: str = ""
    status_log: str = ""
    error: str = ""


class GenerationQueue:
    def __init__(self):
        self._jobs: list[GenJob] = []
        self._lock = threading.Lock()
        self._next_id = 1
        self._queue = _queue_mod.Queue()
        self._worker = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker.start()

    def add(self, image, asset_name, use_texture, octree, steps, cfg,
            decimate, remove_bg) -> GenJob:
        with self._lock:
            job = GenJob(
                id=self._next_id, image=image, asset_name=asset_name,
                use_texture=use_texture, octree_resolution=octree,
                inference_steps=steps, guidance_scale=cfg,
                decimate_faces=decimate, remove_background=remove_bg,
            )
            self._next_id += 1
            self._jobs.append(job)
        self._queue.put(job)
        return job

    def list_jobs(self) -> list[GenJob]:
        with self._lock:
            return list(self._jobs)

    def format_table(self) -> list[list[str]]:
        return [[str(j.id), j.asset_name, j.state,
                 Path(j.glb_path).name if j.glb_path else "",
                 j.error[:60] if j.error else ""]
                for j in self.list_jobs()]

    def _worker_loop(self):
        while True:
            job = self._queue.get()
            job.state = "running"
            try:
                glb_path, status = run_generation(
                    image=job.image, asset_name=job.asset_name,
                    use_texture=job.use_texture,
                    octree_resolution=job.octree_resolution,
                    inference_steps=job.inference_steps,
                    guidance_scale=job.guidance_scale,
                    decimate_faces=job.decimate_faces,
                    remove_background=job.remove_background,
                )
                job.status_log = status
                job.glb_path = glb_path or ""
                job.state = "done" if glb_path else "failed"
                if not glb_path:
                    job.error = "No GLB produced"
            except Exception as e:
                job.state = "failed"
                job.error = str(e)
            self._queue.task_done()


_gen_queue = GenerationQueue()


# --- Animation helpers ---
def _inspect_glb(glb_file):
    if glb_file is None:
        return "Upload a GLB file to inspect its node tree."
    import trimesh
    try:
        scene = trimesh.load(glb_file.name if hasattr(glb_file, 'name') else str(glb_file))
    except Exception as e:
        return f"Failed to load GLB: {e}"
    lines = ["Node tree:", ""]
    if isinstance(scene, trimesh.Scene):
        for n, g in scene.geometry.items():
            lines.append(f"  {n}  (verts={len(g.vertices) if hasattr(g,'vertices') else '?'}, "
                         f"faces={len(g.faces) if hasattr(g,'faces') else '?'})")
    elif isinstance(scene, trimesh.Trimesh):
        lines.append(f"  (single mesh)  verts={len(scene.vertices)}, faces={len(scene.faces)}")
    lines += ["", "Game animate loop node names:",
              "  drill-arm       -> continuous Y rotation",
              "  drill-bit       -> continuous Z rotation",
              "  turret-barrel   -> sinusoidal Y scan",
              "  turret-light    -> pulsing scale",
              "  holo-display    -> opacity pulse + slow rotation",
              "  trade-pad       -> slow Y rotation",
              "", "Rename nodes in Blender to match, re-export GLB."]
    return "\n".join(lines)


def _setup_unirig():
    log = []
    unirig_dir = SCRIPT_DIR / "runtime" / "UniRig"
    log.append("UniRig (SIGGRAPH 2025 — auto-rigging)")
    log.append("github.com/VAST-AI-Research/UniRig\n")
    if (unirig_dir / "requirements.txt").exists():
        log.append(f"[OK] Already cloned at {unirig_dir}")
    else:
        log.append(f"Cloning into {unirig_dir}...")
        try:
            r = subprocess.run(["git", "clone",
                                "https://github.com/VAST-AI-Research/UniRig",
                                str(unirig_dir)],
                               capture_output=True, text=True, timeout=120)
            log.append("[OK] Cloned." if r.returncode == 0
                       else f"[FAIL] {r.stderr.strip()}")
            if r.returncode != 0:
                return "\n".join(log)
        except Exception as e:
            log.append(f"[FAIL] {e}")
            return "\n".join(log)
    log += ["", "=" * 50, "MANUAL SETUP REQUIRED", "=" * 50, "",
            "UniRig needs Python 3.11 + CUDA packages (separate conda env):", "",
            f"  cd {unirig_dir}",
            "  conda create -n unirig python=3.11 -y",
            "  conda activate unirig",
            "  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124",
            "  pip install -r requirements.txt",
            "  pip install spconv-cu120", "",
            "To rig: python run.py --input mesh.glb --output rigged.glb"]
    return "\n".join(log)


# --- Gradio UI ---
CUSTOM_CSS = """
.gradio-container { max-width: 1200px !important; margin: 0 auto; }
#title { text-align: center; color: #00d4ff; font-family: monospace; }
#subtitle { text-align: center; color: #888; }
"""

with gr.Blocks(title="Ignisium Asset Pipeline", css=CUSTOM_CSS, theme=gr.themes.Base()) as app:
    gr.Markdown("# Ignisium Asset Pipeline", elem_id="title")
    gr.Markdown("Image → 3D → Texture → Animate → Game. All local.", elem_id="subtitle")

    with gr.Tabs():
        # === TAB 1: Generate ===
        with gr.TabItem("Generate"):
            with gr.Row():
                with gr.Column(scale=1):
                    image_input = gr.Image(type="pil", label="Concept Image", height=380)
                    asset_name_input = gr.Textbox(label="Asset Name", value="command_center")
                    bg_toggle = gr.Checkbox(label="Remove background", value=True,
                                           info="Strips background via rembg.")
                    texture_toggle = gr.Checkbox(label="Generate PBR textures", value=True,
                                                info="Adds ~90s. Shape-only ~20s.")
                    quality_preset = gr.Dropdown(
                        choices=["fast", "balanced", "high"], value="balanced",
                        label="Quality preset",
                    )
                    with gr.Accordion("Shape parameters", open=False):
                        octree_slider = gr.Slider(128, 512, 256, step=64, label="Octree resolution")
                        steps_slider = gr.Slider(15, 60, 30, step=5, label="Inference steps")
                        cfg_slider = gr.Slider(3.0, 12.0, 7.5, step=0.5, label="Guidance scale")
                    with gr.Accordion("Texture parameters", open=False):
                        decimate_slider = gr.Slider(20000, 200000, 80000, step=10000,
                                                    label="Decimate target faces")

                    PRESETS = {"fast": (256, 20, 7.5, 80000),
                               "balanced": (256, 30, 7.5, 80000),
                               "high": (256, 50, 8.5, 100000)}

                    def _apply_preset(p):
                        o, s, c, d = PRESETS[p]
                        return (gr.update(value=o), gr.update(value=s),
                                gr.update(value=c), gr.update(value=d))

                    quality_preset.change(fn=_apply_preset, inputs=quality_preset,
                                         outputs=[octree_slider, steps_slider,
                                                  cfg_slider, decimate_slider])

                    generate_btn = gr.Button("Generate 3D Model", variant="primary", size="lg")

                with gr.Column(scale=1):
                    file_output = gr.File(label="Generated GLB")
                    status_output = gr.Textbox(label="Status (live)", lines=20,
                                              max_lines=35, interactive=False)

            generate_btn.click(
                fn=generate_3d,
                inputs=[image_input, asset_name_input, texture_toggle,
                        octree_slider, steps_slider, cfg_slider,
                        decimate_slider, bg_toggle],
                outputs=[file_output, status_output],
            )

            # --- Generation Queue ---
            gr.Markdown("---\n### Generation Queue\nAdd multiple images — processed sequentially.")

            def _add_to_queue(image, asset_name, use_texture, octree, steps,
                              cfg, decimate, remove_bg):
                if image is None:
                    return _gen_queue.format_table(), "Upload an image first"
                job = _gen_queue.add(image, asset_name, use_texture,
                                    int(octree), int(steps), float(cfg),
                                    int(decimate), remove_bg)
                return _gen_queue.format_table(), f"Added job #{job.id} ({job.asset_name})"

            def _view_gen_job(evt: gr.SelectData):
                jobs = _gen_queue.list_jobs()
                if evt is None or evt.index is None:
                    return ""
                row = evt.index[0] if isinstance(evt.index, (list, tuple)) else evt.index
                if row >= len(jobs):
                    return ""
                j = jobs[row]
                return f"Job #{j.id} [{j.state}]\n{j.status_log}"

            with gr.Row():
                queue_add_btn = gr.Button("Add to Queue", variant="secondary")
                queue_refresh_btn = gr.Button("Refresh")
            queue_status = gr.Textbox(label="Queue action", interactive=False)
            queue_table = gr.Dataframe(
                headers=["#", "asset", "state", "result", "error"],
                datatype=["str"] * 5, value=[], interactive=False,
                row_count=(0, "dynamic"), label="Queued generations",
            )
            queue_log = gr.Textbox(label="Job log", lines=10, interactive=False)

            queue_add_btn.click(fn=_add_to_queue,
                                inputs=[image_input, asset_name_input, texture_toggle,
                                        octree_slider, steps_slider, cfg_slider,
                                        decimate_slider, bg_toggle],
                                outputs=[queue_table, queue_status])
            queue_refresh_btn.click(fn=lambda: _gen_queue.format_table(), outputs=queue_table)
            queue_table.select(fn=_view_gen_job, outputs=queue_log)

        # === TAB 2: Prompt Queue ===
        with gr.TabItem("Prompt Queue"):
            gr.Markdown("### Prompt → Midjourney → 3D → Game\n"
                        "Without `DISCORD_TOKEN` in `.env`, stops at 'prompt ready'.")

            _queue_singleton = {"q": None}

            def _get_queue():
                if _queue_singleton["q"] is None:
                    from pipeline_queue import PipelineQueue
                    _queue_singleton["q"] = PipelineQueue.instance()
                return _queue_singleton["q"]

            _TERMINAL = {"done", "failed", "cancelled"}

            def _fmt(jobs):
                return [["—" if j.state in _TERMINAL else "✕", j.id, j.asset_name,
                         j.preset, j.state, j.subject[:60],
                         Path(j.installed_path or j.glb_path or "").name,
                         (j.error or "")[:60]] for j in jobs]

            def _refresh():
                return _fmt(_get_queue().list_jobs())

            def _add_q(subject, asset_name, preset):
                if not subject.strip():
                    return _refresh(), "ERROR: empty subject"
                job = _get_queue().add_job(subject, asset_name, preset)
                return _refresh(), f"Added {job.id}"

            def _view_q(job_id):
                if not job_id.strip():
                    return "Enter a job id"
                j = _get_queue().get_job(job_id.strip())
                if not j:
                    return f"No job {job_id}"
                return "\n".join([f"{k}: {getattr(j, k)}" for k in
                                  ("id", "state", "subject", "asset_name", "preset",
                                   "prompt", "glb_path", "installed_path", "error")]
                                + ["", "log:"] + j.log)

            def _cancel_q(job_id):
                if not job_id.strip():
                    return _refresh(), ""
                _get_queue().cancel_job(job_id.strip())
                return _refresh(), f"Cancelled {job_id.strip()}"

            def _sel_q(evt: gr.SelectData):
                if evt is None or evt.index is None:
                    return _refresh(), "", "", ""
                row = evt.index[0] if isinstance(evt.index, (list, tuple)) else evt.index
                col = evt.index[1] if isinstance(evt.index, (list, tuple)) and len(evt.index) > 1 else -1
                jobs = _get_queue().list_jobs()
                if row >= len(jobs):
                    return _refresh(), "", "", ""
                j = jobs[row]
                if col == 0 and j.state not in _TERMINAL:
                    _get_queue().cancel_job(j.id)
                return _refresh(), j.id, _view_q(j.id), f"Selected {j.id}"

            from prompts import BUILDING_PROMPTS
            _BLDG = ["(custom)"] + [f"{v['label']} ({k})" for k, v in BUILDING_PROMPTS.items()]

            def _pick(c):
                if not c or c == "(custom)":
                    return gr.update(), gr.update()
                k = c.rsplit("(", 1)[1].rstrip(")") if "(" in c else c
                i = BUILDING_PROMPTS.get(k)
                return (gr.update(value=i["subject"]), gr.update(value=k)) if i else (gr.update(), gr.update())

            with gr.Row():
                with gr.Column(scale=1):
                    q_bldg = gr.Dropdown(choices=_BLDG, value="(custom)", label="Building")
                    q_subj = gr.Textbox(label="Subject", lines=3)
                    q_name = gr.Textbox(label="Asset name", value="command_center")
                    q_preset = gr.Dropdown(choices=["fast", "balanced", "high", "max"],
                                          value="high", label="Preset")
                    q_add = gr.Button("Add to queue", variant="primary")
                    q_stat = gr.Textbox(label="Action", interactive=False)
                    q_bldg.change(fn=_pick, inputs=q_bldg, outputs=[q_subj, q_name])
                with gr.Column(scale=2):
                    q_tbl = gr.Dataframe(
                        headers=["", "id", "asset", "preset", "state", "subject", "result", "error"],
                        datatype=["str"] * 8, value=[], interactive=False, wrap=True,
                        row_count=(0, "dynamic"))
                    with gr.Row():
                        q_ref = gr.Button("Refresh")
                        q_id = gr.Textbox(label="Job id", scale=1)
                        q_view = gr.Button("View log")
                        q_can = gr.Button("Cancel", variant="stop")
                    q_log = gr.Textbox(label="Detail", lines=15, interactive=False)

            q_add.click(fn=_add_q, inputs=[q_subj, q_name, q_preset], outputs=[q_tbl, q_stat])
            q_ref.click(fn=_refresh, outputs=q_tbl)
            q_view.click(fn=_view_q, inputs=q_id, outputs=q_log)
            q_can.click(fn=_cancel_q, inputs=q_id, outputs=[q_tbl, q_stat])
            q_tbl.select(fn=_sel_q, outputs=[q_tbl, q_id, q_log, q_stat])
            app.load(fn=_refresh, outputs=q_tbl)

        # === TAB 3: Animations ===
        with gr.TabItem("Animations"):
            gr.Markdown("### Local Animation Tooling")
            with gr.Row():
                with gr.Column(scale=1):
                    gr.Markdown("#### GLB Node Inspector")
                    anim_glb = gr.File(label="Upload GLB", file_types=[".glb", ".gltf"])
                    anim_btn = gr.Button("Inspect Nodes")
                    anim_tree = gr.Textbox(label="Nodes", lines=20, interactive=False,
                                          value=_inspect_glb(None))
                    anim_btn.click(fn=_inspect_glb, inputs=anim_glb, outputs=anim_tree)
                with gr.Column(scale=1):
                    gr.Markdown("#### Building Animations (Procedural)\n"
                                "Name child nodes in Blender to match the game's hooks:\n\n"
                                "| Node | Animation |\n|---|---|\n"
                                "| `drill-arm` | Y rotation |\n"
                                "| `turret-barrel` | Y scan |\n"
                                "| `holo-display` | Opacity pulse |\n"
                                "| `trade-pad` | Slow rotation |\n")
                    gr.Markdown("#### Character Rigging (UniRig)\n"
                                "Auto-rigs arbitrary shapes locally. Needs separate conda env.")
                    unirig_btn = gr.Button("Clone UniRig + Show Setup")
                    unirig_out = gr.Textbox(label="Setup", lines=18, interactive=False)
                    unirig_btn.click(fn=_setup_unirig, outputs=unirig_out)


if __name__ == "__main__":
    import signal

    def _signal_handler(sig, frame):
        print(f"\nReceived signal {sig}, shutting down...")
        sys.exit(0)

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, _signal_handler)

    app.launch(server_name="127.0.0.1", server_port=7860,
               share=False, inbrowser=True)
