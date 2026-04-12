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

# Output is equirectangular (2:1 aspect) so it wraps onto a sphere correctly
# with standard sphere UV mapping. MJ outputs orthographic marbles -- we
# re-project them into equirect here. The "back hemisphere" of the planet
# becomes a mirror of the front (a tradeoff for getting a seamless wrap).
EQUIRECT_W = 2048
EQUIRECT_H = 1024
WEBP_QUALITY = 95
# How much of the source image is occupied by the planet orb (the rest
# is the black background MJ renders around it). MJ marbles per these
# prompts have orb_radius ~ 0.40 * image_width.
PLANET_RADIUS_FRAC = 0.45

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


def spherify(marble: Image.Image) -> Image.Image:
    """Reproject an orthographic-marble planet view into an equirectangular
    map (2:1 aspect ratio) suitable for standard sphere UV mapping.

    The marble is treated as an orthographic view of a unit sphere. For
    each output pixel (lat, lon) we compute the corresponding 3D point on
    the sphere, project it back to 2D image coords, and sample the marble
    there. Both hemispheres sample the same 2D point -- so the back of the
    planet is a horizontal mirror of the front. This is the right tradeoff:
    no visible seam, planet is recognizable from any angle.
    """
    src = np.asarray(marble.convert("RGB"))
    h_src, w_src, _ = src.shape
    cx, cy = w_src / 2.0, h_src / 2.0
    R = min(w_src, h_src) * PLANET_RADIUS_FRAC

    # Latitude/longitude grid for the equirect output.
    # Pixel (x, y) -> lon in (-pi, pi], lat in [-pi/2, pi/2].
    yy, xx = np.mgrid[0:EQUIRECT_H, 0:EQUIRECT_W]
    lat = (0.5 - yy / EQUIRECT_H) * np.pi          # +pi/2 (north) to -pi/2
    lon = (xx / EQUIRECT_W - 0.5) * 2.0 * np.pi    # -pi to +pi

    # 3D unit-sphere position for each output pixel.
    cos_lat = np.cos(lat)
    sx = cos_lat * np.sin(lon)
    sy = np.sin(lat)
    # sz = cos_lat * np.cos(lon)  # not needed -- both hemispheres mirror

    # Orthographic projection back into the marble's 2D coords.
    ix = (cx + sx * R).astype(np.int32)
    iy = (cy - sy * R).astype(np.int32)
    np.clip(ix, 0, w_src - 1, out=ix)
    np.clip(iy, 0, h_src - 1, out=iy)

    out = src[iy, ix]
    return Image.fromarray(out)


def process(png_path: Path, out_path: Path) -> tuple[int, int]:
    """Spherify the marble and save as WebP. Returns (src_bytes, out_bytes)."""
    src_bytes = png_path.stat().st_size
    img = Image.open(png_path).convert("RGB")
    # Center-crop to square if the source isn't already square (MJ outputs
    # are square so this is a no-op, but defensive).
    w, h = img.size
    if w != h:
        m = min(w, h)
        img = img.crop(((w - m) // 2, (h - m) // 2, (w + m) // 2, (h + m) // 2))
    # Reproject orthographic marble -> equirectangular (2:1).
    eq = spherify(img)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    eq.save(out_path, "WEBP", quality=WEBP_QUALITY, method=6)
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
    print(f"Format:   {EQUIRECT_W}x{EQUIRECT_H} equirectangular WebP "
          f"(quality {WEBP_QUALITY})")
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
