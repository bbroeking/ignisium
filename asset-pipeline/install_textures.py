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

# Pipeline:
#   1. Auto-detect the planet circle in the MJ marble (bright pixels
#      vs the black background).
#   2. Crop tight to the planet's bounding box -- removes the black
#      border that would otherwise wrap onto the back/poles of the
#      sphere when equirect-mapped.
#   3. Resize to TARGET_SIZE square, save as WebP.
# The result has planet content edge-to-edge, so equirect mapping in
# the shader covers the entire sphere with planet (no black caps, no
# black back).
TARGET_SIZE = 1024
WEBP_QUALITY = 95
# Brightness threshold above which a pixel counts as "planet content"
# (vs the black MJ background). Conservative so subtle limb gradients
# still register as planet.
PLANET_DETECT_THRESHOLD = 25

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


def crop_to_planet(img: Image.Image) -> Image.Image:
    """Crop a marble tight to its planet circle, removing the black border.

    Without this, equirect-mapping the marble onto a sphere would put the
    image's black corners at the back and poles -- producing a planet
    that's only "lit" on the front-facing side.

    Strategy: find all pixels brighter than PLANET_DETECT_THRESHOLD; that's
    the planet. Crop the bounding box of those pixels, then expand it to
    a square so the resulting image isn't anamorphic when stretched onto
    the sphere.
    """
    arr = np.asarray(img.convert("L"))
    mask = arr > PLANET_DETECT_THRESHOLD
    if mask.sum() < (arr.shape[0] * arr.shape[1] * 0.02):
        # Couldn't find a planet -- bail and use the full image.
        return img
    ys, xs = np.where(mask)
    left, right = int(xs.min()), int(xs.max()) + 1
    top, bottom = int(ys.min()), int(ys.max()) + 1
    # Expand the bbox to a square centered on the planet so the planet
    # doesn't get stretched horizontally vs. vertically when we resize.
    bw = right - left
    bh = bottom - top
    side = max(bw, bh)
    cx = (left + right) // 2
    cy = (top + bottom) // 2
    half = side // 2
    sq_left = max(0, cx - half)
    sq_top = max(0, cy - half)
    sq_right = min(img.width, sq_left + side)
    sq_bottom = min(img.height, sq_top + side)
    return img.crop((sq_left, sq_top, sq_right, sq_bottom))


def process(png_path: Path, out_path: Path) -> tuple[int, int]:
    """Crop tight to the planet circle, resize, save as WebP."""
    src_bytes = png_path.stat().st_size
    img = Image.open(png_path).convert("RGB")
    img = crop_to_planet(img)
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
