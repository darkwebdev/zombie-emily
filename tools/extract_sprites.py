#!/usr/bin/env python3
"""Cuts Emily's animation frames out of the hand-authored character art and
writes uniform Phaser spritesheets into src/assets/.

There are two kinds of source art in art/, and a path for each:

1. The original character board (art/emily-sheet.png) — a presentation sheet
   with labelled rows, palette swatches and an in-game mockup, not a grid, on
   an opaque background. Frames there are located by scanning for content
   against the board's two background colours rather than by a fixed stride;
   the boxes below were found by that scan and are pinned here so the output
   is reproducible. See ROWS / build_row.
2. Per-animation sheets authored later as a proper uniform grid on a
   transparent background (art/emily-walk-sheet.png) — no scanning, no
   background removal, just a cell crop. See GRID_SHEETS / build_grid.

A grid sheet wins over a same-named row on the board, so re-authoring one
animation is a matter of dropping its sheet in art/ and adding an entry.

Usage:  python3 tools/extract_sprites.py [path-to-board.png]
Default board: art/emily-sheet.png. Grid sheets are always read from art/.
"""

from collections import deque
from pathlib import Path
import sys

from PIL import Image

# Board background colours (outer panel, inner panel).
BG = ((11, 14, 28), (17, 20, 37))
BG_TOLERANCE = 60  # sum-of-channel distance still considered background
# Cast shadows sit *darker* than the board, so a distance test alone leaves
# them behind as black blobs. Anything at or below the board's own brightness
# is board too; the character's dark outline is well above this and, being
# interior, is never reached by the flood fill anyway.
BG_DARK_SUM = 95

# Source-resolution frame box. Wide/tall enough for every pose in every row.
SRC_FRAME = 104
# Emily occupies a 40x40 box in the 320x180 world (~36px tall). Frames are
# authored at ART_SCALE times that, because the game runs at WORLD.zoom = 3:
# a 120px frame displayed in a 40px world box lands exactly 1 texture pixel
# per screen pixel, so she renders at the canvas's full resolution instead of
# as 3x3 nearest-neighbour blocks. Keep ART_SCALE == WORLD.zoom.
WORLD_FRAME = 40
ART_SCALE = 3
OUT_FRAME = WORLD_FRAME * ART_SCALE
# Padding under the feet (output pixels) — mirrored by EMILY_SPRITE in tuning.ts.
OUT_BOTTOM_PAD = 2 * ART_SCALE

# Grid sheets: uniform cells, transparent background, read left-to-right then
# top-to-bottom. Trailing cells past `frames` are blank padding.
GRID_SHEETS = {
    "walk": {"file": "emily-walk-sheet.png", "cell": 256, "cols": 5, "frames": 11},
}

# The grid path targets the same on-screen size and footing as the frames cut
# off the board — measured from them: 114px tall with the feet 3px above the
# frame's bottom edge. Matching these is what keeps Emily from changing size
# or hopping when an animation from one source hands over to the other.
GRID_CHAR_HEIGHT = 114
GRID_BOTTOM_PAD = 3

ROWS = {
    # "walk" is deliberately absent — it's re-authored as a grid sheet above.
    # The board's walk row is still in the committed board if it's ever needed.
    # The board's run row is deliberately absent too: Emily has one ground
    # speed and it reads as a walk, so a run cycle was cut rather than left as
    # an animation nothing could ever reach. The row is still in the committed
    # board if a sprint is ever added.
    # Row also holds the thrown arm and two soldier-impact frames; only Emily's
    # own poses are listed here. The sheet's second pose is skipped — its back
    # leg is drawn so dark in the source that it reads as a black blob once
    # separated from the board.
    "throw": (372, 483, [(568, 623), (801, 862), (1015, 1083), (1409, 1468)]),
    # The "arm returns" row poses are front-facing standing frames — they make
    # a better idle than any mid-stride walk frame.
    "idle": (542, 639, [(569, 623), (686, 741), (797, 853), (1133, 1189), (1245, 1299)]),
}

# The thrown arm, from the ATTACK row. Not a character frame — its own texture.
ARM_BOX = (879, 387, 980, 435)
ARM_OUT_WIDTH = 16 * ART_SCALE


def is_bg(p):
    if sum(p) <= BG_DARK_SUM:
        return True
    return min(sum(abs(a - b) for a, b in zip(p, c)) for c in BG) <= BG_TOLERANCE


def cut_background(img):
    """Flood-fills the board colour inward from the crop border so interior
    shadows and dark outlines survive."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        seen[y][x] = True
        if not is_bg(px[x, y][:3]):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img


def content_bounds(img):
    w, h = img.size
    px = img.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 16:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def downscale(img, size):
    """Premultiplied resize — plain RGBA resizing bleeds black into the edges."""
    return img.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def build_row(sheet, y0, y1, boxes):
    """Cuts one row into uniform frames: content centred horizontally and
    bottom-aligned, so the feet stay put when animations swap."""
    out = Image.new("RGBA", (OUT_FRAME * len(boxes), OUT_FRAME), (0, 0, 0, 0))
    scale = OUT_FRAME / SRC_FRAME
    for i, (x0, x1) in enumerate(boxes):
        cut = cut_background(sheet.crop((x0 - 6, y0 - 6, x1 + 6, y1 + 6)))
        content = cut.crop(content_bounds(cut))
        canvas = Image.new("RGBA", (SRC_FRAME, SRC_FRAME), (0, 0, 0, 0))
        canvas.paste(
            content,
            (
                (SRC_FRAME - content.width) // 2,
                SRC_FRAME - content.height - round(OUT_BOTTOM_PAD / scale),
            ),
        )
        out.paste(downscale(canvas, (OUT_FRAME, OUT_FRAME)), (i * OUT_FRAME, 0))
    return out


def build_grid(path, cell, cols, frames):
    """Cuts a uniform grid sheet into game frames.

    Unlike build_row, every frame is cut with the SAME source box rather than
    re-centred on its own content: a grid sheet is already drawn in register,
    so one shared box preserves exactly the motion the artist drew — the head
    bob, the stride, the lean — where per-frame centring would flatten it and
    make her slide sideways as the cycle plays.
    """
    sheet = Image.open(path).convert("RGBA")
    cells = []
    for i in range(frames):
        row, col = divmod(i, cols)
        cut = sheet.crop((col * cell, row * cell, (col + 1) * cell, (row + 1) * cell))
        bounds = cut.getbbox()
        if bounds is None:
            raise SystemExit(f"{path.name}: cell {i} is empty — check `frames`")
        cells.append((cut, bounds))

    top = min(b[1] for _, b in cells)
    bottom = max(b[3] for _, b in cells)
    # Horizontal centre is the MEDIAN frame's centre, not the centre of the
    # union box: a mid-stride frame's outstretched legs are much wider than
    # the body, and centring on those would park her off to one side.
    centres = sorted((b[0] + b[2]) / 2 for _, b in cells)
    centre = centres[len(centres) // 2]
    half = max(max(centre - b[0], b[2] - centre) for _, b in cells)
    box = (round(centre - half), top, round(centre + half), bottom)

    scale = GRID_CHAR_HEIGHT / (bottom - top)
    width = max(1, round((box[2] - box[0]) * scale))
    if width > OUT_FRAME:
        raise SystemExit(f"{path.name}: frames are {width}px wide, wider than the {OUT_FRAME}px frame")

    out = Image.new("RGBA", (OUT_FRAME * frames, OUT_FRAME), (0, 0, 0, 0))
    for i, (cut, _) in enumerate(cells):
        scaled = downscale(cut.crop(box), (width, GRID_CHAR_HEIGHT))
        out.paste(
            scaled,
            (i * OUT_FRAME + (OUT_FRAME - width) // 2, OUT_FRAME - GRID_CHAR_HEIGHT - GRID_BOTTOM_PAD),
        )
    return out


def build_arm(sheet):
    cut = cut_background(sheet.crop(ARM_BOX))
    cut = cut.crop(content_bounds(cut))
    h = max(1, round(cut.height * ARM_OUT_WIDTH / cut.width))
    return downscale(cut, (ARM_OUT_WIDTH, h))


def main():
    root = Path(__file__).resolve().parent.parent
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "art" / "emily-sheet.png"
    out_dir = root / "src" / "assets"
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(src).convert("RGB")

    for name, (y0, y1, boxes) in ROWS.items():
        img = build_row(sheet, y0, y1, boxes)
        path = out_dir / f"emily-{name}.png"
        img.save(path)
        print(f"{path.name}: {len(boxes)} frames of {OUT_FRAME}x{OUT_FRAME} (board)")

    for name, spec in GRID_SHEETS.items():
        img = build_grid(root / "art" / spec["file"], spec["cell"], spec["cols"], spec["frames"])
        path = out_dir / f"emily-{name}.png"
        img.save(path)
        print(f"{path.name}: {spec['frames']} frames of {OUT_FRAME}x{OUT_FRAME} ({spec['file']})")

    arm = build_arm(sheet)
    arm.save(out_dir / "emily-arm.png")
    print(f"emily-arm.png: {arm.width}x{arm.height}")


if __name__ == "__main__":
    main()
