"""Install celestial texture PNGs into the game's public/ folder.

Different from the building/unit pipeline: celestial assets are NOT
3D models. They are flat textures wrapped onto an existing
SphereGeometry in main.js. So this script skips Hunyuan3D entirely
and just resizes + WebP-compresses each PNG.

Workflow:
  1. Drop MJ outputs into asset-pipeline/input/ (any filename, the
     auto-detector matches keywords like "volcanic", "ice", "gas").
  2. Run install_textures.bat
  3. Compressed WebPs land in public/assets/textures/celestial/<key>.webp

Keyword -> celestial key mapping (matches keys in main.js PlanetDefs):
  volcanic                          -> ignisium
  crystal | ice                     -> crystara
  earth | temperate | earth-like    -> verdania
  gas | gas_giant                   -> nethara
  star | sun | photosphere          -> sun

Source PNGs are NOT moved (unlike batch.py). They stay in input/
so you can regenerate variants and re-run.
"""
import re
import shutil
import sys
from pathlib import Path
import numpy as np
from PIL import Image

SCRIPT_DIR = Path(__file__).parent.resolve()
INPUT_DIR = SCRIPT_DIR / "input"
TEXTURES_DIR = (SCRIPT_DIR.parent / "public" / "assets" / "textures" / "celestial").resolve()

# Plain pass-through: just resize MJ marbles to TARGET_SIZE square and
# WebP-compress. The shader (createPlanetShader in shaders.js) handles
# the sphere mapping with whichever mode (triplanar / equirect) is
# configured per planet in PlanetDefs.
TARGET_SIZE = 1024
WEBP_QUALITY = 95

# Keyword -> celestial key. First match wins; multi-word keywords with
# spaces will be checked against the lowercased filename with "_" -> " ".
CELESTIAL_KEYWORDS = [
    ("volcanic",     "ignisium"),
    ("crystal",      "crystara"),
    ("ice",          "crystara"),
    ("earth-like",   "verdania"),
    ("earth like",   "verdania"),
    ("temperate",    "verdania"),
    ("gas giant",    "nethara"),
    ("gas_giant",    "nethara"),
    ("photosphere",  "sun"),
    (" sun ",        "sun"),
    (" star ",       "sun"),
]


def detect_celestial(filename: str) -> str | None:
    name = " " + filename.lower().replace("_", " ").replace("-", " ") + " "
    for kw, key in CELESTIAL_KEYWORDS:
        if kw.replace("_", " ") in name:
            return key
    return None


def process(png_path: Path, out_path: Path) -> tuple[int, int]:
    """Resize and save as WebP. Returns (src_bytes, out_bytes)."""
    src_bytes = png_path.stat().st_size
    img = Image.open(png_path).convert("RGB")
    w, h = img.size
    if w != h:
        m = min(w, h)
        img = img.crop(((w - m) // 2, (h - m) // 2, (w + m) // 2, (h + m) // 2))
    if img.size != (TARGET_SIZE, TARGET_SIZE):
        img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "WEBP", quality=WEBP_QUALITY, method=6)
    out_bytes = out_path.stat().st_size
    return src_bytes, out_bytes


def main():
    if not INPUT_DIR.exists():
        print(f"ERROR: {INPUT_DIR} not found")
        sys.exit(1)

    pngs = sorted(INPUT_DIR.glob("*.png")) + sorted(INPUT_DIR.glob("*.jpg"))
    if not pngs:
        print(f"No PNG/JPG in {INPUT_DIR}")
        sys.exit(0)

    print(f"Scanning {len(pngs)} images in {INPUT_DIR}")
    print(f"Target:   {TEXTURES_DIR}")
    print(f"Format:   {TARGET_SIZE}x{TARGET_SIZE} WebP (quality {WEBP_QUALITY})")
    print()

    matched = []
    skipped = []
    for png in pngs:
        key = detect_celestial(png.name)
        if key is None:
            skipped.append(png)
            continue
        matched.append((png, key))

    if skipped:
        print(f"Skipped {len(skipped)} non-celestial image(s) (no keyword match):")
        for p in skipped:
            print(f"  {p.name}")
        print()

    if not matched:
        print("No celestial images matched.")
        sys.exit(0)

    total_src = 0
    total_out = 0
    for png, key in matched:
        out_path = TEXTURES_DIR / f"{key}.webp"
        src, out = process(png, out_path)
        total_src += src
        total_out += out
        print(f"  {key:10s}  {src/1e6:.2f} MB -> {out/1e3:.0f} KB  ({png.name})")

    print()
    print(f"Done: {len(matched)} textures installed.")
    print(f"Total: {total_src/1e6:.1f} MB -> {total_out/1e6:.2f} MB")


if __name__ == "__main__":
    main()
