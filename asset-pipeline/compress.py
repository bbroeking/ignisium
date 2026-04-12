"""GLB compression pipeline using @gltf-transform/cli.

For each GLB in input folder (default: processed/), runs a pipeline:
  1. Resize textures to LOD-appropriate dimensions
  2. WebP-compress textures (default, ~3-5x smaller than PNG, no extra install)
     OR ETC1S/KTX2 with --ktx2 (requires ktx-software on PATH)
  3. Draco-compress mesh geometry (~10x) -- runs LAST so the Draco extension
     is preserved through any subsequent passes

LOD-based texture downscale (inferred from _lodN filename suffix):
  LOD0 (no suffix) -> 1024px
  LOD1             -> 512px
  LOD2             -> 256px
  LOD3             -> 128px

Outputs land in <input>/web/ mirroring subfolder layout.

Usage (via wrapper):
  compress.bat                       (process processed/, WebP textures)
  compress.bat processed/            (explicit input folder)
  compress.bat --ktx2                (use ETC1S; requires ktx-software)
  compress.bat --quality 70          (WebP quality, default 80)

Requires: Node + npx. First run downloads @gltf-transform/cli (~50MB).
"""
import argparse
import csv
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

LOD_TEXTURE_SIZES = {0: 1024, 1: 512, 2: 256, 3: 128}
DEFAULT_QUALITY = 80
GLTF_TRANSFORM = ["npx", "-y", "@gltf-transform/cli@latest"]


def lod_level(stem: str) -> int:
    m = re.search(r'_lod(\d+)$', stem)
    return int(m.group(1)) if m else 0


def run_gltf(args, cwd=None) -> tuple[int, str]:
    """Run a gltf-transform subcommand. Returns (returncode, combined_output)."""
    cmd = GLTF_TRANSFORM + args
    proc = subprocess.run(
        cmd, capture_output=True, text=True, cwd=cwd, shell=True,
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def compress_one(glb_in: Path, glb_out: Path, use_ktx2: bool, quality: int) -> dict:
    """Run resize -> draco -> texture-compress pipeline on one GLB.
    Returns stats dict."""
    glb_out.parent.mkdir(parents=True, exist_ok=True)

    lod = lod_level(glb_in.stem)
    target_size = LOD_TEXTURE_SIZES.get(lod, 1024)
    src_bytes = glb_in.stat().st_size

    # Use a per-asset tmp file in the output folder to avoid clobbering.
    tmp_a = glb_out.with_suffix(".tmp_a.glb")
    tmp_b = glb_out.with_suffix(".tmp_b.glb")

    try:
        # Step 1: resize textures to LOD-appropriate dimensions
        rc, out = run_gltf([
            "resize", str(glb_in), str(tmp_a),
            "--width", str(target_size), "--height", str(target_size),
        ])
        if rc != 0:
            raise RuntimeError(f"resize failed:\n{out}")

        # Step 2: texture compression. Run BEFORE Draco so a textureless
        # file doesn't have its Draco extension stripped by a later pass.
        if use_ktx2:
            rc, out = run_gltf(["etc1s", str(tmp_a), str(tmp_b)])
            tex_step = "etc1s"
        else:
            rc, out = run_gltf([
                "webp", str(tmp_a), str(tmp_b),
                "--quality", str(quality),
            ])
            tex_step = f"webp(q={quality})"
        if rc != 0:
            raise RuntimeError(f"{tex_step} failed:\n{out}")

        # Step 3: Draco mesh compression (last so the extension survives)
        rc, out = run_gltf(["draco", str(tmp_b), str(glb_out)])
        if rc != 0:
            raise RuntimeError(f"draco failed:\n{out}")

        out_bytes = glb_out.stat().st_size
        return {
            "ok": True,
            "asset": glb_in.name,
            "lod": lod,
            "target_size": target_size,
            "src_bytes": src_bytes,
            "out_bytes": out_bytes,
            "ratio": out_bytes / src_bytes if src_bytes else 0,
            "tex_step": tex_step,
        }
    finally:
        for tmp in (tmp_a, tmp_b):
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass


def find_inputs(input_dir: Path) -> list[Path]:
    """All GLBs under input_dir, excluding the web/ output subfolder itself."""
    glbs = []
    for p in sorted(input_dir.rglob("*.glb")):
        # Skip anything under the output folder so re-runs don't recurse
        rel = p.relative_to(input_dir)
        if rel.parts and rel.parts[0] == "web":
            continue
        glbs.append(p)
    return glbs


def main():
    parser = argparse.ArgumentParser(description="Compress GLBs (Draco + WebP/KTX2)")
    parser.add_argument("input_folder", nargs="?", default="processed",
                        help="Folder of GLBs to compress (default: processed/)")
    parser.add_argument("--ktx2", action="store_true",
                        help="Use KTX2/ETC1S textures (requires ktx-software on PATH)")
    parser.add_argument("--quality", type=int, default=DEFAULT_QUALITY,
                        help=f"WebP quality 0-100 (default {DEFAULT_QUALITY}). Ignored with --ktx2.")
    args = parser.parse_args()

    here = Path(__file__).parent.resolve()
    input_dir = Path(args.input_folder)
    if not input_dir.is_absolute():
        input_dir = here / input_dir
    if not input_dir.exists():
        print(f"ERROR: Input folder not found: {input_dir}")
        sys.exit(1)

    glbs = find_inputs(input_dir)
    if not glbs:
        print(f"No GLBs found in {input_dir}")
        sys.exit(0)

    out_root = input_dir / "web"
    out_root.mkdir(exist_ok=True)

    print(f"Compressing {len(glbs)} GLB(s)")
    print(f"  Input:    {input_dir}")
    print(f"  Output:   {out_root}")
    print(f"  Textures: {'KTX2 ETC1S' if args.ktx2 else f'WebP (q={args.quality})'}")
    print()

    # Sanity check: gltf-transform reachable? First call is slow because npx
    # downloads the package. Probe with --help so the user sees download
    # progress only once.
    print("Checking gltf-transform availability (first run downloads ~50MB)...")
    rc, out = run_gltf(["--version"])
    if rc != 0:
        print("ERROR: Could not invoke @gltf-transform/cli via npx")
        print(out)
        sys.exit(2)
    print(f"  gltf-transform {out.strip()}")
    print()

    results = []
    total_start = time.time()
    for i, glb in enumerate(glbs, 1):
        rel = glb.relative_to(input_dir)
        out_path = out_root / rel
        print(f"[{i}/{len(glbs)}] {rel}")
        t0 = time.time()
        try:
            r = compress_one(glb, out_path, use_ktx2=args.ktx2, quality=args.quality)
            elapsed = time.time() - t0
            r["elapsed"] = elapsed
            results.append(r)
            print(f"   {r['src_bytes']/1e6:.2f} MB -> {r['out_bytes']/1e6:.2f} MB "
                  f"({r['ratio']*100:.0f}%, tex={r['target_size']}px, {elapsed:.1f}s)")
        except Exception as e:
            elapsed = time.time() - t0
            print(f"   FAILED ({elapsed:.1f}s): {e}")
            results.append({
                "ok": False, "asset": glb.name, "lod": lod_level(glb.stem),
                "target_size": LOD_TEXTURE_SIZES.get(lod_level(glb.stem), 1024),
                "src_bytes": glb.stat().st_size, "out_bytes": 0, "ratio": 0,
                "tex_step": "fail", "elapsed": elapsed,
            })

    total = time.time() - total_start

    # Report
    report = out_root / "_compress_report.csv"
    with open(report, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["asset", "lod", "target_px", "src_MB", "out_MB",
                    "ratio_pct", "tex_step", "elapsed_s", "ok"])
        for r in results:
            w.writerow([
                r["asset"], r["lod"], r["target_size"],
                f"{r['src_bytes']/1e6:.2f}", f"{r['out_bytes']/1e6:.2f}",
                f"{r['ratio']*100:.0f}", r["tex_step"],
                f"{r['elapsed']:.1f}", r["ok"],
            ])

    ok_count = sum(1 for r in results if r["ok"])
    src_total = sum(r["src_bytes"] for r in results)
    out_total = sum(r["out_bytes"] for r in results if r["ok"])

    print()
    print("=" * 60)
    print(f"Done: {ok_count}/{len(results)} succeeded in {total:.0f}s")
    print(f"Total size: {src_total/1e6:.1f} MB -> {out_total/1e6:.1f} MB "
          f"({out_total/src_total*100 if src_total else 0:.0f}%)")
    print(f"Report: {report}")


if __name__ == "__main__":
    main()
