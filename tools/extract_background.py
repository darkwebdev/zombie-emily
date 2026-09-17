#!/usr/bin/env python3
"""Cuts the parallax background layers out of the environment board and writes
tileable strips into src/assets/.

Like the character board, art/background-sheet.png is a labelled presentation
sheet, not a grid: rows of panels with captions, a palette, and prop sketches.
Each row is four panels butted together with a 1-2px divider line, and the
panels are *not* continuous with each other, so stitching a whole row produces
visible vertical breaks. Instead one good panel is taken per layer and made to
tile.

Three things this script does that the layers need to actually work in game:

1. **Mirror-tiling.** The panels aren't seamless left-to-right (measured wrap
   error is 3-5x the error between adjacent columns inside a panel), so a
   plain repeat shows a hard vertical seam. Appending a horizontally flipped
   copy makes the strip seamless by construction. The mirror symmetry would
   be obvious on a narrow tile, but these are 400-2000px wide against a 320px
   viewport, and the far layers move at a fraction of camera speed, so both
   halves are never on screen together. Layers that already wrap cleanly skip
   this.

2. **Top alpha fade.** Every panel is opaque and paints its own sky, so a
   nearer layer would completely hide the one behind it and its top edge
   would read as a hard horizontal line across the screen. Fading the top of
   each nearer layer to transparent dissolves that edge and lets the layer
   behind show through — which reads as distance haze, the effect these
   layers are meant to give.

3. **Per-layer scale.** The board draws its layers at wildly different
   implied scales: the fence panel is 117px for something ~2m tall, while the
   skyline panels are ~150px for a whole city. `art_scale` (source px per
   world px) is what reconciles them, so a fence post ends up fence-sized
   next to Emily. 3 means 1 texture pixel per screen pixel (as crisp as
   Emily, for the layers close to the camera); 1 means a chunkier 3x blow-up,
   which is what the distant layers need to cover the sky at all.

Usage:  python3 tools/extract_background.py [path-to-board.png]
Default source: art/background-sheet.png
"""

from pathlib import Path
import sys

from PIL import Image

# Panel boxes found by scanning the board for its divider lines. The boxes
# aim just inside each divider; auto_trim below cleans up whatever dark
# divider pixels are left, which matters more than it sounds — mirroring
# doubles a single stray dark edge column into a 2px black line straight down
# the middle of the layer.
LAYERS = {
    # Skyline. Padded upward so it covers the whole sky above the ground
    # line; the pad repeats its topmost row, which is flat night sky, so the
    # join is invisible.
    "far": {"box": (433, 49, 869, 205), "mirror": True, "fade_top": 0, "pad_top": 8},
    # City ruins. Faded hard at the top so the skyline reads behind it.
    "mid": {"box": (505, 231, 798, 379), "mirror": True, "fade_top": 48, "pad_top": 0},
    # Fence and roadside props. This panel already wraps cleanly (its wrap
    # error is *below* its own adjacent-column error), so it repeats as-is —
    # and a fence is the one thing that's supposed to look repetitive.
    "fence": {"box": (668, 404, 875, 521), "mirror": False, "fade_top": 30, "pad_top": 0},
    # Street surface. Only the top of the board's ground strip is used: it's
    # drawn at character scale, and there are only 16 world px between the
    # ground line and the bottom of the screen.
    "ground": {"box": (21, 566, 1090, 614), "mirror": True, "fade_top": 0, "pad_top": 0},
}


# How many columns auto_trim may eat off each edge before giving up. Dividers
# on the board are 1-4px; anything past that would be real art.
MAX_EDGE_TRIM = 6


def auto_trim(img):
    """Drops divider pixels left at a panel's edges — any edge column much
    darker than the art a few pixels inside it."""

    def column_mean(x):
        return sum(sum(img.getpixel((x, y))[:3]) for y in range(img.height)) / img.height

    left, right = 0, img.width
    for _ in range(MAX_EDGE_TRIM):
        if column_mean(left) >= column_mean(left + 3) * 0.8:
            break
        left += 1
    for _ in range(MAX_EDGE_TRIM):
        if column_mean(right - 1) >= column_mean(right - 4) * 0.8:
            break
        right -= 1
    return img.crop((left, 0, right, img.height))


def mirror_tile(img):
    """img + a flipped copy of it, sharing the edge columns, so the result
    wraps seamlessly onto itself."""
    flipped = img.transpose(Image.FLIP_LEFT_RIGHT).crop((1, 0, img.width - 1, img.height))
    out = Image.new("RGBA", (img.width + flipped.width, img.height), (0, 0, 0, 0))
    out.paste(img, (0, 0))
    out.paste(flipped, (img.width, 0))
    return out


def pad_top(img, rows):
    """Extends the image upward by repeating its topmost row."""
    out = Image.new("RGBA", (img.width, img.height + rows), (0, 0, 0, 0))
    out.paste(img.crop((0, 0, img.width, 1)).resize((img.width, rows)), (0, 0))
    out.paste(img, (0, rows))
    return out


def fade_top(img, rows):
    px = img.load()
    for y in range(rows):
        factor = y / rows
        for x in range(img.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, int(a * factor))
    return img


def main():
    root = Path(__file__).resolve().parent.parent
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "art" / "background-sheet.png"
    out_dir = root / "src" / "assets"
    out_dir.mkdir(parents=True, exist_ok=True)
    board = Image.open(src).convert("RGBA")

    for name, spec in LAYERS.items():
        img = auto_trim(board.crop(spec["box"]))
        if spec["pad_top"]:
            img = pad_top(img, spec["pad_top"])
        if spec["fade_top"]:
            img = fade_top(img, spec["fade_top"])
        if spec["mirror"]:
            img = mirror_tile(img)
        path = out_dir / f"bg-{name}.png"
        img.save(path)
        print(f"{path.name}: {img.width}x{img.height}")


if __name__ == "__main__":
    main()
