#!/usr/bin/env python3
"""Cuts the enemy/follower sprites out of the hand-authored enemy board and
writes one PNG per character into src/assets/.

The board (art/enemies-board.png) draws each character twice — a front view
and a back view. The game is a side-scroller that only ever shows a character
from the front (mirrored by facing), so only the front of each pair is cut;
the back views are ignored on purpose, not missed.

Three things this has to get right, all of which are load-bearing:

1. **One shared scale, not one per character.** The board is captioned "same
   scale as Emily", so the relative heights it draws are deliberate: the
   Brute really is bulkier than a soldier. Normalising each figure to a fixed
   height would throw exactly that information away. Everything is therefore
   scaled by a single factor, chosen so the plain human soldier lands on
   HUMAN_HEIGHT — the same 114px Emily's own frames use (see
   tools/extract_sprites.py, GRID_CHAR_HEIGHT), which is what makes an enemy
   standing next to her read as the right size.

2. **Feet flush with the bottom edge.** Nothing here carries a bottom pad, so
   the game can put a character's feet on the ground line knowing the art's
   bottom row *is* its feet — see Soldier/Follower, which derive their origin
   from the loaded texture's height rather than from a tuned per-kind number.

3. **Background removal has to flood from the edges.** These characters are
   very dark (near-black armour on a near-black navy board), so a global
   "close to the background colour" test would eat holes out of their shaded
   sides. Flooding inward from the border only removes background actually
   connected to the outside.

The boxes below were found by scanning the board for content bands and are
pinned here so the output is reproducible.

Usage:  python3 tools/extract_enemies.py [path-to-board.png]
"""

from collections import deque
from pathlib import Path
import sys

from PIL import Image

BOARD = Path("art/enemies-board.png")
OUT_DIR = Path("src/assets")

# Board background, and how far a pixel may stray from it (sum of per-channel
# differences) and still count as background.
BG = (11, 15, 26)
BG_TOL = 34

# Emily's frames are cut 114px tall (tools/extract_sprites.py); matching that
# for the plain human soldier is what puts every character on one scale.
HUMAN_HEIGHT = 114
SCALE_REFERENCE = "enemy-standard"

# Front-view boxes on the board, generous enough to contain the figure with
# room to spare — the real bounds come from the content scan, not from these.
# Back views (the second figure of each captioned pair) are deliberately absent.
FIGURES = {
    "enemy-standard": (28, 234, 176, 529),  # HUMAN SOLDIER
    "follower-base": (536, 734, 176, 529),  # INFECTED SOLDIER
    "enemy-shield": (1020, 1235, 176, 529),  # SHIELD TROOPER
    "enemy-rifleman": (25, 250, 609, 970),  # RIFLEMAN
    "follower-brute": (654, 944, 609, 970),  # BRUTE INFECTED
}


def is_background(p):
    return abs(p[0] - BG[0]) + abs(p[1] - BG[1]) + abs(p[2] - BG[2]) <= BG_TOL


def cut(board, box):
    """Crops one figure and makes its background transparent, flooding inward
    from the crop's border so dark pixels *inside* the character survive."""
    x0, x1, y0, y1 = box
    img = board.crop((x0, y0, x1, y1)).convert("RGBA")
    w, h = img.size
    px = img.load()

    seen = [[False] * h for _ in range(w)]
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[x][y] and is_background(px[x, y]):
                seen[x][y] = True
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[x][y] and is_background(px[x, y]):
                seen[x][y] = True
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and is_background(px[nx, ny]):
                seen[nx][ny] = True
                queue.append((nx, ny))

    return img.crop(img.getbbox())


def main():
    board_path = Path(sys.argv[1]) if len(sys.argv) > 1 else BOARD
    board = Image.open(board_path).convert("RGB")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    cutouts = {name: cut(board, box) for name, box in FIGURES.items()}
    scale = HUMAN_HEIGHT / cutouts[SCALE_REFERENCE].height

    for name, img in sorted(cutouts.items()):
        w = max(1, round(img.width * scale))
        h = max(1, round(img.height * scale))
        out = img.resize((w, h), Image.NEAREST)
        out.save(OUT_DIR / f"{name}.png")
        print(f"{name}: {img.width}x{img.height} -> {w}x{h}")


if __name__ == "__main__":
    main()
