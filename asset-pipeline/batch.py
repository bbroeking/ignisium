"""
Batch CLI: process all images in an input folder into GLB models.

Usage:
    python batch.py [input_folder] [--no-texture] [--preset fast|balanced|high]

Defaults:
    input_folder = asset-pipeline/inbox/
    preset = balanced (octree 256, 30 steps, cfg 7.5)

For each image:
  1. Infers a short asset name from the filename
  2. Spawns worker.py to generate shape (+optional texture)
  3. Saves GLB to output/<asset_name>.glb
  4. Moves the source image to generated/<asset_name>.png
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
OUTPUT_DIR = SCRIPT_DIR / "output"
GENERATED_DIR = SCRIPT_DIR / "generated"
OUTPUT_DIR.mkdir(exist_ok=True)
GENERATED_DIR.mkdir(exist_ok=True)

PORTABLE_DIR = SCRIPT_DIR / "runtime" / "Hunyuan3D2_WinPortable"
PORTABLE_PY = PORTABLE_DIR / "python_standalone" / "python.exe"
WORKER_SCRIPT = SCRIPT_DIR / "worker.py"

PRESETS = {
    "fast":     {"octree_resolution": 256, "inference_steps": 20, "guidance_scale": 7.5, "decimate_faces": 80000},
    "balanced": {"octree_resolution": 256, "inference_steps": 30, "guidance_scale": 7.5, "decimate_faces": 80000},
    "high":     {"octree_resolution": 384, "inference_steps": 50, "guidance_scale": 8.5, "decimate_faces": 100000},
}

# Keywords to strip when simplifying filenames
STRIP_WORDS = {
    "a", "an", "the", "small", "sci", "fi", "scifi", "model", "building",
    "volcanic", "planet", "colony", "stylized", "qurtyyy", "pressurized",
    "reinforced", "fortified", "futuristic", "structure", "facility",
}
# Known asset types to match against. Order matters: longer / more
# specific names should come first so e.g. "colony_ship" matches before
# a stray "colony" elsewhere in the filename does.
KNOWN_BUILDINGS = [
    # Original 11
    "command_center", "thermal_extractor", "mineral_drill", "habitat_pod",
    "habitat_dome", "research_lab", "warehouse", "barracks", "defense_turret",
    "shipyard", "trade_depot", "shield_gen", "hangar",
    # New buildings
    "power_plant", "refinery", "sensor_tower", "repair_bay",
]
KNOWN_UNITS = [
    # Order: 2-word names first
    "colony_ship", "heavy_trooper", "engineer_drone", "scout_drone",
    "fighter", "transport", "marine",
]


def simplify_name(filename: str) -> str:
    """Turn a long MJ filename into a short snake_case asset name.

    Examples:
        qurtyyy_A_small_sci-fi_pressurized_habitat_dome_building_roun_546e... -> habitat_dome
        qurtyyy_A_small_sci-fi_command_center_building_model_fortifie_251f... -> command_center
        qurtyyy_Stylized_sci-fi_shipyard_hangar_volcanic_planet_colon_9aa6... -> shipyard_hangar
    """
    # Strip extension and UUID suffix
    stem = Path(filename).stem
    # Remove trailing UUID pattern (hex + underscore + digit)
    stem = re.sub(r'_[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(_\d+)?$', '', stem)
    # Remove leading "qurtyyy_" or similar username prefix
    stem = re.sub(r'^[a-zA-Z]+_', '', stem, count=1)

    # Split into words
    words = re.split(r'[_\s-]+', stem.lower())
    # Strip common filler words
    words = [w for w in words if w not in STRIP_WORDS and len(w) > 1]
    # Truncate long descriptions (keep first 3-4 meaningful words)
    words = words[:4]

    candidate = "_".join(words)

    # Try to match a known asset type. Units checked first because their
    # names are more specific (e.g. "colony_ship" should win over a stray
    # "ship" matching shipyard).
    for known in KNOWN_UNITS + KNOWN_BUILDINGS:
        if known in candidate or all(part in candidate for part in known.split("_")):
            return known

    return candidate or "asset"


def get_worker_env():
    env = os.environ.copy()
    env["HF_HUB_CACHE"] = str(PORTABLE_DIR / "HuggingFaceHub")
    env["HY3DGEN_MODELS"] = str(PORTABLE_DIR / "HuggingFaceHub")
    env["PYTHONPYCACHEPREFIX"] = str(PORTABLE_DIR / "pycache")
    env["PYTHONUNBUFFERED"] = "1"
    env["PATH"] = (str(PORTABLE_DIR / "MinGit" / "cmd") + ";" +
                   str(PORTABLE_DIR / "python_standalone" / "Scripts") + ";" +
                   env.get("PATH", ""))
    return env


def run_one(image_path: Path, asset_name: str, preset: dict,
            use_texture: bool = True) -> Path | None:
    """Run worker.py for a single image. Returns GLB path or None."""
    args_file = OUTPUT_DIR / f"_batch_args_{asset_name}.json"
    args_file.write_text(json.dumps({
        "image_path": str(image_path),
        "asset_name": asset_name,
        "use_texture": use_texture,
        "remove_background": True,
        "use_flashvdm": True,
        **preset,
    }), encoding="utf-8")

    proc = subprocess.Popen(
        [str(PORTABLE_PY), "-u", str(WORKER_SCRIPT), str(args_file)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, env=get_worker_env(), cwd=str(SCRIPT_DIR),
    )

    # Stream stderr to console
    while True:
        line = proc.stderr.readline()
        if not line and proc.poll() is not None:
            break
        if line:
            print(f"  {line.rstrip()}")

    stdout = proc.stdout.read().strip()
    retcode = proc.returncode

    try:
        args_file.unlink()
    except Exception:
        pass

    if retcode != 0:
        print(f"  ERROR: Worker exited with code {retcode}")
        return None

    try:
        result = json.loads(stdout)
        return Path(result["glb_path"]) if result.get("glb_path") else None
    except (json.JSONDecodeError, KeyError):
        print(f"  ERROR: Bad worker output")
        return None


def main():
    parser = argparse.ArgumentParser(description="Batch generate 3D models from images")
    parser.add_argument("input_folder", nargs="?", default=str(SCRIPT_DIR / "inbox"),
                        help="Folder of PNG images to process (default: inbox/)")
    parser.add_argument("--no-texture", action="store_true",
                        help="Shape only, skip PBR textures")
    parser.add_argument("--preset", choices=PRESETS.keys(), default="balanced",
                        help="Quality preset (default: balanced)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be processed without generating")
    args = parser.parse_args()

    input_dir = Path(args.input_folder)
    if not input_dir.exists():
        print(f"ERROR: Input folder not found: {input_dir}")
        sys.exit(1)

    images = sorted(input_dir.glob("*.png")) + sorted(input_dir.glob("*.jpg"))
    if not images:
        print(f"No images found in {input_dir}")
        sys.exit(0)

    preset = PRESETS[args.preset]

    print(f"Batch processing {len(images)} images")
    print(f"  Input:   {input_dir}")
    print(f"  Output:  {OUTPUT_DIR}")
    print(f"  Done:    {GENERATED_DIR}")
    print(f"  Preset:  {args.preset} ({preset})")
    print(f"  Texture: {'off' if args.no_texture else 'on'}")
    print()

    # Show plan
    for img_path in images:
        name = simplify_name(img_path.name)
        print(f"  {img_path.name}")
        print(f"    -> asset: {name}")
        print(f"    -> glb:   output/{name}_*.glb")
        print(f"    -> move:  generated/{name}{img_path.suffix}")
    print()

    if args.dry_run:
        print("Dry run — no generation performed.")
        return

    # Process
    results = []
    total_start = time.time()

    for i, img_path in enumerate(images, 1):
        name = simplify_name(img_path.name)
        print(f"[{i}/{len(images)}] {name} ({img_path.name})")
        print(f"  Generating...")

        t0 = time.time()
        glb_path = run_one(img_path, name, preset, use_texture=not args.no_texture)
        elapsed = time.time() - t0

        if glb_path and glb_path.exists():
            print(f"  OK: {glb_path.name} ({glb_path.stat().st_size/1e6:.1f} MB, {elapsed:.0f}s)")
            # Move source image to generated/
            dest = GENERATED_DIR / f"{name}{img_path.suffix}"
            if dest.exists():
                dest = GENERATED_DIR / f"{name}_{time.strftime('%H%M%S')}{img_path.suffix}"
            shutil.move(str(img_path), str(dest))
            print(f"  Moved: {img_path.name} -> generated/{dest.name}")
            results.append((name, elapsed, glb_path))
        else:
            print(f"  FAILED ({elapsed:.0f}s)")
            results.append((name, elapsed, None))
        print()

    # Summary
    total = time.time() - total_start
    ok = sum(1 for _, _, p in results if p)
    print("=" * 60)
    print(f"BATCH COMPLETE: {ok}/{len(results)} succeeded in {total:.0f}s")
    print("=" * 60)
    for name, elapsed, glb_path in results:
        status = f"{glb_path.name} ({elapsed:.0f}s)" if glb_path else f"FAILED ({elapsed:.0f}s)"
        print(f"  {name:30s}  {status}")


if __name__ == "__main__":
    main()
