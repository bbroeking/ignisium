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
    """Crop a marble tight to its planet circle, removing the background.

    Without this, equirect-mapping the marble onto a sphere would put the
    image's background corners at the back and poles -- producing a planet
    that's "lit" only on the front-facing side and has the background
    color (white or black) showing on the rest of the sphere.

    Strategy: sample the four corners to detect the background color
    (could be black, white, or any solid color MJ chose to ignore the
    prompt). Find pixels whose color differs from that by more than
    BG_TOLERANCE -- that's the planet. Crop tight to the bbox, then
    expand to a square.
    """
    arr_rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    h, w, _ = arr_rgb.shape

    # Background = average of the 8x8 patches in each corner. Robust to
    # MJ choosing white, black, navy, or anything else for the corners.
    corners = np.stack([
        arr_rgb[0:8, 0:8].reshape(-1, 3),
        arr_rgb[0:8, w-8:w].reshape(-1, 3),
        arr_rgb[h-8:h, 0:8].reshape(-1, 3),
        arr_rgb[h-8:h, w-8:w].reshape(-1, 3),
    ])
    bg = corners.mean(axis=(0, 1))  # mean RGB across all corner samples

    # Distance of each pixel from the background colour. Anything > 30
    # away is "planet content". 30 is a Manhattan/L1 threshold tuned for
    # MJ's anti-aliasing fade -- planet limb gradients still register.
    BG_TOLERANCE = 30
    diff = np.abs(arr_rgb - bg).sum(axis=2)
    mask = diff > BG_TOLERANCE
    if mask.sum() < (h * w * 0.02):
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


def fill_background(img: Image.Image) -> Image.Image:
    """Replace all background-coloured pixels with the planet's average
    colour, so when this image is sphere-mapped no white/black background
    bleeds onto the planet.
    """
    arr = np.asarray(img.convert("RGB")).astype(np.int16)
    h, w, _ = arr.shape
    corners = np.stack([
        arr[0:8, 0:8].reshape(-1, 3),
        arr[0:8, w-8:w].reshape(-1, 3),
        arr[h-8:h, 0:8].reshape(-1, 3),
        arr[h-8:h, w-8:w].reshape(-1, 3),
    ])
    bg = corners.mean(axis=(0, 1))
    BG_TOLERANCE = 30
    diff = np.abs(arr - bg).sum(axis=2)
    bg_mask = diff <= BG_TOLERANCE
    planet_mask = ~bg_mask
    if planet_mask.sum() < 100:
        return img
    planet_avg = arr[planet_mask].mean(axis=0).astype(np.uint8)
    out = arr.astype(np.uint8).copy()
    out[bg_mask] = planet_avg
    return Image.fromarray(out)


def process(png_path: Path, out_path: Path) -> tuple[int, int]:
    """Crop tight to the planet, fill background, resize, save as WebP."""
    src_bytes = png_path.stat().st_size
    img = Image.open(png_path).convert("RGB")
    img = crop_to_planet(img)
    img = fill_background(img)
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
