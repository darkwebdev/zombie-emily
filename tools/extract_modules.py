#!/usr/bin/env python3
"""Cuts the modular character components out of art/modules-prev-board.png.

WHICH BOARD, AND WHY IT CHANGED
-------------------------------
There are two boards and this script used to read the other one,
art/modules-board.png, whose base body is captioned "MINIMAL CLOTHING" — a
tank top and shorts, meant to be dressed from the catalogue printed beside it.
That decomposition was abandoned: dressing a near-naked body means every layer
is a body part that has to seam against its neighbours, and getting trousers
to cover shins without swallowing boots cost three rounds of hand-fitting on
its own. It also can't finish the job — that board has no arms column at all,
so every soldier read as a man in a tank top wearing a vest.

This board's base is instead a **fully clothed soldier**, and the pieces that
layer over it are small additions at known places: a hood, a weapon, a shield,
a belt item. Nothing has to seam, nothing can leave a gap, and the only things
still needing a fitted offset are the few pieces actually worn on top. That is
the whole reason the source moved.

Two consequences of the base being dressed, both deliberate:

- **The base already wears a helmet with goggles**, so STANDARD and SHIELD
  need no head layer at all — they are the base as drawn. Only RIFLEMAN
  replaces the head, with the hooded jacket that the board's own SNIPER
  example variant uses.
- **The infected keep their own base**, cut from this board's lower half, not
  derived from the human one. They take soldier *accessories* (the grenade and
  medkit from the EXTRA column) over that base — which is also why the
  accessory cuts are emitted once and used by both sides.

THE LAYER CONTRACT
------------------
Bases are emitted full-figure with the feet on the bottom row, because
applyCharacterArt solves originY from each texture's own height (see
src/entities/characterArt.ts). Gear is emitted **tight-cropped**: where each
piece sits and how big it is are runtime data now (anchor/dx/dy/scale in
CHARACTER_LAYERS, dragged in the gear-fitting panel — ?debug=1, Gear tab),
so baking a guess into the PNG would only freeze it.

Everything is scaled by its own base's factor, chosen so each base lands on
the 114px height Emily and the existing enemies use (tools/extract_enemies.py),
which is what keeps a modular soldier the right size next to everyone else.

Usage:  python3 tools/extract_modules.py
"""

from pathlib import Path

from PIL import Image

BOARD = Path("art/modules-prev-board.png")
OUT_DIR = Path("src/assets")

# Board background, and how far a pixel may stray from it and still count as
# background (summed per-channel difference).
BG = (13, 10, 26)
BG_TOL = 45

# Matches GRID_CHAR_HEIGHT in extract_sprites.py and HUMAN_HEIGHT in
# extract_enemies.py — one shared scale across every character in the game.
TARGET_HEIGHT = 114

# Left/top/right/bottom on the board, found by scanning for content bands and
# then narrowed per item. The boxes stop short of every printed caption: the
# board labels each column, and a box that reaches a caption doesn't merely
# paste type onto the sprite — for a base it makes the caption the bottom row,
# so applyCharacterArt seats the figure by its label and it floats above the
# ground line.
HUMAN_BASE_BOX = (41, 80, 174, 427)
INFECTED_BASE_BOX = (42, 581, 170, 906)

# Gear, all from the human half of the board. The infected share it (see the
# docstring): a soldier's grenade on a walking corpse is the point.
GEAR = {
    # The board's SNIPER variant is the base body in this hooded jacket, which
    # is why RIFLEMAN is the one kind that gets a head layer.
    "head-hood": (398, 317, 472, 402),
    "rifle-assault": (838, 121, 982, 170),
    "rifle-sniper": (839, 202, 983, 242),
    "pistol": (915, 352, 956, 385),
    "shield-riot": (915, 398, 973, 494),
    # First of each row in the EXTRA column; the rest are near-duplicates at
    # this size, and a belt item is ~4 world pixels tall.
    "acc-grenade": (1018, 242, 1040, 274),
    "acc-medkit": (1018, 293, 1045, 329),
}


def tight_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    """Content bounds inside a cut cell, so a component is positioned by where
    its art actually is rather than by however much padding its cell had."""
    px = img.convert("RGB").load()
    w, h = img.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if abs(r - BG[0]) + abs(g - BG[1]) + abs(b - BG[2]) > BG_TOL:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise ValueError("cell contained no content")
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def cut(board: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """Cuts a box, trims it to its content, and drops the board background to
    transparency. Flooding from the edges (rather than a global colour test)
    is what stops the very dark armour being eaten from the inside — same
    reasoning as tools/extract_enemies.py."""
    cell = board.crop(box)
    x0, y0, x1, y1 = tight_bbox(cell)
    cell = cell.crop((x0, y0, x1, y1)).convert("RGBA")

    px = cell.load()
    w, h = cell.size
    seen = set()
    stack = [(x, y) for x in range(w) for y in (0, h - 1)]
    stack += [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        if abs(r - BG[0]) + abs(g - BG[1]) + abs(b - BG[2]) > BG_TOL:
            continue
        px[x, y] = (0, 0, 0, 0)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return cell


def emit(img: Image.Image, name: str, scale: float) -> None:
    w = max(1, round(img.width * scale))
    h = max(1, round(img.height * scale))
    img.resize((w, h), Image.NEAREST).save(OUT_DIR / f"{name}.png")
    print(f"{name}.png  {w}x{h}")


def main() -> None:
    board = Image.open(BOARD).convert("RGB")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    human = cut(board, HUMAN_BASE_BOX)
    # The one scale every human-side piece shares, so a rifle stays rifle-sized
    # against the body it is held by.
    scale = TARGET_HEIGHT / human.height
    emit(human, "human-base", scale)

    infected = cut(board, INFECTED_BASE_BOX)
    # Solved separately: this figure is drawn shorter than the soldier (no
    # helmet), and both have to arrive 114px tall or one of them stands in a
    # hole. Their gear is shared, so gear keeps the human scale.
    emit(infected, "infected-base", TARGET_HEIGHT / infected.height)

    for name, box in GEAR.items():
        emit(cut(board, box), name, scale)


if __name__ == "__main__":
    main()
