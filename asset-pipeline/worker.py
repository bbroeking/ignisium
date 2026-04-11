"""
Subprocess worker for 3D generation.

Runs in a fresh Python process with a clean CUDA context every time.
Eliminates VRAM fragmentation that causes 100x slowdowns on sequential runs.

Called by app.py via subprocess. Communicates via JSON on stdout.
"""
import gc
import json
import sys
import time
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

HUNYUAN_DIR = SCRIPT_DIR / "runtime" / "Hunyuan3D2_WinPortable" / "Hunyuan3D-2"
if not HUNYUAN_DIR.exists():
    HUNYUAN_DIR = SCRIPT_DIR / "Hunyuan3D-2"
if HUNYUAN_DIR.exists():
    sys.path.insert(0, str(HUNYUAN_DIR))


def _log(msg, timings, log_lines):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    log_lines.append(line)
    print(line, file=sys.stderr, flush=True)


def main():
    args = json.loads(sys.argv[1])
    image_path = args["image_path"]
    asset_name = args["asset_name"]
    use_texture = args["use_texture"]
    octree_resolution = args["octree_resolution"]
    inference_steps = args["inference_steps"]
    guidance_scale = args["guidance_scale"]
    decimate_faces = args["decimate_faces"]
    remove_background = args["remove_background"]
    use_flashvdm = args.get("use_flashvdm", True)

    log_lines = []
    timings = {}
    start = time.time()

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    name = (asset_name or "asset").strip().replace(" ", "_")
    name = "".join(c for c in name if c.isalnum() or c in "_-") or "asset"
    out_path = OUTPUT_DIR / f"{name}_{timestamp}.glb"

    import torch
    from PIL import Image
    import numpy as np

    img = Image.open(image_path)

    # --- Background removal ---
    if remove_background:
        _log("Removing background...", timings, log_lines)
        t0 = time.time()
        from rembg import remove as _rembg_remove, new_session as _rembg_new_session
        session = None
        for model_name in ("birefnet-general", "isnet-general-use", "u2net"):
            try:
                session = _rembg_new_session(model_name)
                break
            except Exception:
                pass
        if session:
            src = img.convert("RGB")
            cut = _rembg_remove(src, session=session, bgcolor=[255, 255, 255, 0])
            if cut.mode != "RGBA":
                cut = cut.convert("RGBA")
            arr = np.array(cut)
            arr[:, :, 3][arr[:, :, 3] < 24] = 0
            cut = Image.fromarray(arr, "RGBA")
            bbox = cut.getbbox()
            if bbox:
                cropped = cut.crop(bbox)
                w, h = cropped.size
                side = int(max(w, h) * 1.12)
                canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
                canvas.paste(cropped, ((side - w) // 2, (side - h) // 2),
                             mask=cropped.split()[3])
                img = canvas
        timings["bg_removal"] = time.time() - t0
        _log(f"  Background removed ({timings['bg_removal']:.1f}s)", timings, log_lines)
        try:
            prep_path = OUTPUT_DIR / f"{name}_{timestamp}_preprocessed.png"
            img.save(prep_path)
        except Exception:
            pass

    # --- Shape ---
    _log("Loading shape model...", timings, log_lines)
    t0 = time.time()
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    shape_pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained("tencent/Hunyuan3D-2")

    if use_flashvdm:
        try:
            shape_pipe.enable_flashvdm(enabled=True)
            _log("  FlashVDM enabled (turbo VAE + GPU marching cubes)", timings, log_lines)
        except Exception as e:
            _log(f"  FlashVDM unavailable ({e}), using standard decoder", timings, log_lines)
            use_flashvdm = False

    timings["shape_load"] = time.time() - t0
    _log(f"  Model loaded ({timings['shape_load']:.1f}s)", timings, log_lines)

    _log(f"Generating shape (octree={octree_resolution}, steps={inference_steps}, "
         f"cfg={guidance_scale})...", timings, log_lines)
    t0 = time.time()
    mesh = shape_pipe(
        image=img,
        num_inference_steps=int(inference_steps),
        guidance_scale=float(guidance_scale),
        octree_resolution=int(octree_resolution),
        num_chunks=8000,
    )[0]
    timings["shape_gen"] = time.time() - t0
    _log(f"  Shape done ({timings['shape_gen']:.1f}s) — verts={len(mesh.vertices)}, "
         f"faces={len(mesh.faces)}", timings, log_lines)

    # Free shape VRAM
    del shape_pipe
    gc.collect()
    torch.cuda.synchronize()
    torch.cuda.empty_cache()

    # --- Mesh cleanup ---
    import trimesh
    t0 = time.time()
    if isinstance(mesh, trimesh.Trimesh):
        components = mesh.split(only_watertight=False)
        if len(components) > 1:
            mesh = max(components, key=lambda c: len(c.faces))
            _log(f"  Removed {len(components)-1} disconnected components", timings, log_lines)
    timings["mesh_cleanup"] = time.time() - t0

    # --- Texture ---
    if use_texture:
        target = int(decimate_faces)
        if len(mesh.faces) > target:
            t0 = time.time()
            mesh = mesh.simplify_quadric_decimation(face_count=target)
            timings["decimate"] = time.time() - t0
            _log(f"  Decimated to {len(mesh.faces)} faces ({timings['decimate']:.1f}s)",
                 timings, log_lines)

        _log("Loading texture model...", timings, log_lines)
        t0 = time.time()
        from hy3dgen.texgen import Hunyuan3DPaintPipeline
        tex_pipe = Hunyuan3DPaintPipeline.from_pretrained("tencent/Hunyuan3D-2")
        timings["tex_load"] = time.time() - t0
        _log(f"  Texture model loaded ({timings['tex_load']:.1f}s)", timings, log_lines)

        tex_pipe.enable_model_cpu_offload()
        _log("Baking PBR textures...", timings, log_lines)
        t0 = time.time()
        try:
            mesh = tex_pipe(mesh, image=img)
            timings["tex_gen"] = time.time() - t0
            _log(f"  Texture done ({timings['tex_gen']:.1f}s)", timings, log_lines)
        except Exception as e:
            timings["tex_gen"] = time.time() - t0
            _log(f"  Texture failed ({e}) — exporting untextured", timings, log_lines)

    # --- Export ---
    t0 = time.time()
    mesh.export(str(out_path))
    timings["export"] = time.time() - t0

    total = time.time() - start
    timings["total"] = total

    _log("", timings, log_lines)
    _log("=== TIMING SUMMARY ===", timings, log_lines)
    for phase, secs in timings.items():
        if phase != "total":
            _log(f"  {phase:20s}  {secs:6.1f}s", timings, log_lines)
    _log(f"  {'TOTAL':20s}  {total:6.1f}s", timings, log_lines)
    _log(f"Saved: {out_path}", timings, log_lines)

    # Append to timings CSV
    timing_csv = OUTPUT_DIR / "timings.csv"
    write_header = not timing_csv.exists()
    try:
        with open(timing_csv, "a") as f:
            if write_header:
                f.write("timestamp,asset,octree,steps,cfg,texture,flashvdm,"
                        + ",".join(timings.keys()) + "\n")
            f.write(f"{timestamp},{name},{octree_resolution},{inference_steps},"
                    f"{guidance_scale},{use_texture},{use_flashvdm},"
                    + ",".join(f"{v:.1f}" for v in timings.values()) + "\n")
    except Exception:
        pass

    # Output result as JSON on stdout
    print(json.dumps({
        "glb_path": str(out_path),
        "status": "\n".join(log_lines),
        "timings": timings,
    }))


if __name__ == "__main__":
    main()
