"""Extract dominant color palette from MJ planet concept art.

For each PNG in input/, isolate the planet (excluding the background),
find the N most-populated color buckets, sort by luminance, and print
them in the JS format used by main.js's PLANET_SHADER_CONFIGS so you
can paste straight into the config dict.

Usage:
    install_textures.bat extract_palette
    OR (direct):
    runtime/Hunyuan3D2_WinPortable/python_standalone/python.exe extract_palette.py [N_COLORS]

Workflow once you have new concept art:
    1. Drop new MJ marbles into asset-pipeline/input/
    2. Run this script -- it prints suggested colorStops for each
    3. Paste into PLANET_SHADER_CONFIGS in main.js
    4. Hot-reload picks up the change
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

SCRIPT_DIR = Path(__file__).parent.resolve()
INPUT_DIR = SCRIPT_DIR / "input"

# Quantize each RGB channel to BUCKET_BITS bits (4 bits = 16 levels per channel
# = 4096 total color buckets). Coarse enough that subtle variations cluster
# together; fine enough to preserve the distinct palette tones.
BUCKET_BITS = 4
BUCKET_SIZE = 1 << (8 - BUCKET_BITS)  # 16
BG_TOLERANCE = 30  # L1 distance from corner-sampled background to count as planet


def detect_background(arr: np.ndarray) -> np.ndarray:
    """Mean RGB of the four 8x8 corner patches of the image."""
    h, w, _ = arr.shape
    corners = np.stack([
        arr[0:8, 0:8].reshape(-1, 3),
        arr[0:8, w-8:w].reshape(-1, 3),
        arr[h-8:h, 0:8].reshape(-1, 3),
        arr[h-8:h, w-8:w].reshape(-1, 3),
    ])
    return corners.mean(axis=(0, 1))


def planet_pixels(img: Image.Image) -> np.ndarray:
    """Return Nx3 array of planet pixels (excluding the background)."""
    arr = np.asarray(img.convert("RGB")).astype(np.int16)
    bg = detect_background(arr)
    diff = np.abs(arr - bg).sum(axis=2)
    mask = diff > BG_TOLERANCE
    return arr[mask].astype(np.uint8)


def luminance(c: tuple[int, int, int]) -> float:
    """Perceptual luminance (Rec. 709)."""
    r, g, b = c
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def extract_palette(pixels: np.ndarray, n_colors: int = 6) -> list[tuple[int, int, int]]:
    """Bucket pixels into a coarse RGB grid, take the top-N most populated
    buckets, return their actual mean colors. Sorted by luminance ascending
    so the resulting ramp goes dark -> bright (matches the procedural
    shader's noise->color mapping convention).
    """
    if pixels.shape[0] < n_colors:
        return []
    # Quantize each channel into BUCKETS levels.
    quantized = (pixels // BUCKET_SIZE) * BUCKET_SIZE + BUCKET_SIZE // 2
    # Encode each pixel's bucket as a single int for fast counting.
    keys = (quantized[:, 0].astype(np.int32) << 16) \
         | (quantized[:, 1].astype(np.int32) << 8) \
         | quantized[:, 2].astype(np.int32)
    unique_keys, counts = np.unique(keys, return_counts=True)
    # Top-N buckets by population.
    top = np.argsort(-counts)[:n_colors]
    palette: list[tuple[int, int, int]] = []
    for idx in top:
        key = unique_keys[idx]
        r = (key >> 16) & 0xFF
        g = (key >> 8) & 0xFF
        b = key & 0xFF
        # Use the actual mean of the pixels in this bucket for a nicer
        # color than the quantized centroid.
        mask = keys == key
        mean = pixels[mask].mean(axis=0).astype(np.uint8)
        palette.append((int(mean[0]), int(mean[1]), int(mean[2])))
    palette.sort(key=luminance)
    return palette


def to_hex(c: tuple[int, int, int]) -> str:
    return f"0x{c[0]:02x}{c[1]:02x}{c[2]:02x}"


def planet_key(filename: str) -> str:
    """Same keyword detection as install_textures.py."""
    name = " " + filename.lower().replace("_", " ").replace("-", " ") + " "
    keywords = [
        ("volcanic", "ignisium"), ("crystal", "crystara"), ("ice", "crystara"),
        ("earth-like", "verdania"), ("earth like", "verdania"), ("temperate", "verdania"),
        ("gas giant", "nethara"), ("gas_giant", "nethara"),
        ("photosphere", "sun"), (" sun ", "sun"), (" star ", "sun"),
    ]
    for kw, key in keywords:
        if kw.replace("_", " ") in name:
            return key
    return Path(filename).stem


def render_color_stops(palette: list[tuple[int, int, int]]) -> str:
    """Format a palette as the colorStops array used in main.js."""
    n = len(palette)
    if n == 0:
        return "[]"
    lines = ["    colorStops: ["]
    for i, color in enumerate(palette):
        stop = i / (n - 1) if n > 1 else 0.5
        lines.append(f"      {{ stop: {stop:.2f}, color: {to_hex(color)} }},")
    lines.append("    ],")
    return "\n".join(lines)


def main():
    n_colors = 6
    if len(sys.argv) > 1:
        try:
            n_colors = int(sys.argv[1])
        except ValueError:
            pass

    pngs = sorted(INPUT_DIR.glob("*.png")) + sorted(INPUT_DIR.glob("*.jpg"))
    if not pngs:
        print(f"No PNG/JPG in {INPUT_DIR}")
        sys.exit(0)

    print(f"Extracting {n_colors}-color palettes from {len(pngs)} images.")
    print(f"Paste each block into PLANET_SHADER_CONFIGS in main.js.\n")

    for png in pngs:
        key = planet_key(png.name)
        img = Image.open(png).convert("RGB")
        pixels = planet_pixels(img)
        if pixels.shape[0] < n_colors * 10:
            print(f"// {key}: not enough planet pixels detected, skipping ({png.name})")
            continue
        palette = extract_palette(pixels, n_colors=n_colors)
        print(f"// {key}  (from {png.name})")
        print(f"  {key}: {{")
        print(f"    // ...keep your existing baseScale/octaves/etc...")
        print(render_color_stops(palette))
        print(f"  }},\n")


if __name__ == "__main__":
    main()
