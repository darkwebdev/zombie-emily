#!/usr/bin/env python3
"""Cuts the modular character components out of art/modules-board.png.

Two boards exist and only this one supports layering. art/modules-prev-board.png
draws its "BASE BODY" already wearing a helmet, vest and knee pads — a finished
soldier, so stacking gear on it just smears armour over armour. This board's
base is captioned "MINIMAL CLOTHING" (tank top and shorts) and is the one
intended to be built on; it even prints the intended stacks in its LAYERING
EXAMPLES row.

What neither board gives is alignment. The base is a whole figure while every
component is a small item floating in its own labelled cell, with no anchor
relating the two. Cutting them is easy; knowing where each sits on the body is
the actual work, and it has to be hand-tuned.

So each component carries a hand-tuned placement in PLACEMENT below, expressed
as fractions of the emitted canvas, and is pasted onto a full-figure canvas at
that spot. That is what makes the output satisfy the layer contract the game
requires (see src/entities/characterLayers.ts): every layer is the same canvas
size as its base with the figure's feet on the bottom row, because
applyCharacterArt solves originY from each texture's own height. A tight crop
straight off the board would seat itself somewhere else entirely and the
character would float.

Everything is scaled by one factor, chosen so the base body lands on the same
114px height Emily and the existing enemies use (tools/extract_enemies.py),
which is what keeps a modular soldier the right size next to everyone else.

Usage:  python3 tools/extract_modules.py
"""

from pathlib import Path

from PIL import Image

BOARD = Path("art/modules-board.png")
# The layering board has no ARMS column at all — its categories run helmets,
# vests, chest/shoulder armor, pants, boots, backpacks, weapons, shields,
# accessories, and every torso piece is sleeveless. The earlier board does
# have one, drawn as a proper armoured sleeve with shoulder pad, forearm and
# glove, so the arms are cut from there instead.
#
# Its figures are drawn at a different size (a 346px base against this
# board's 210px), which used to make mixing boards impractical. It no longer
# matters: layers are positioned and scaled at runtime from CHARACTER_LAYERS,
# so each source only has to be internally consistent, and the fitting panel
# reconciles the rest.
ARMS_BOARD = Path("art/modules-prev-board.png")
ARMS_BG = (13, 10, 26)
ARMS_BASE_HEIGHT = 426 - 80  # that board's own base figure, for one shared scale

ARMS_COMPONENTS = {
    # Both arms are cut as one image — they are drawn as a separated left and
    # right pair, and a single sleeve layer composites far more simply than
    # two mirrored halves that would each need their own anchor.
    "arms-sleeves": (548, 98, 632, 183),
    "infected-arms": (548, 601, 632, 686),
}
OUT_DIR = Path("src/assets")

# Board background, and how far a pixel may stray from it and still count as
# background (summed per-channel difference).
BG = (4, 8, 22)
BG_TOL = 45

# Matches GRID_CHAR_HEIGHT in extract_sprites.py and HUMAN_HEIGHT in
# extract_enemies.py — one shared scale across every character in the game.
TARGET_HEIGHT = 114

# Source boxes on the board, found by scanning for content bands. Left/top/
# right/bottom, and deliberately stopping short of each figure's caption. The
# board prints "BASE BODY" and "(MINIMAL CLOTHING)" a few px under the feet,
# and a box that reaches them doesn't just paste type onto the sprite — it
# makes the caption the bottom row, so applyCharacterArt seats the character
# by its label and the figure floats above the ground line. The bounds below
# are the figures' own content runs (human 77-286, infected 407-625), found
# with a per-pixel scan; a coarser threshold silently merged figure and
# caption into one run, which is how this went wrong the first time.
HUMAN_BASE_BOX = (28, 77, 114, 287)
INFECTED_BASE_BOX = (28, 407, 114, 626)

COMPONENTS = {
    # name:           (box,                     placement key)
    "head-helmet": ((161, 84, 207, 123), "head"),
    "head-hood": ((161, 133, 207, 175), "head"),
    "torso-vest": ((244, 85, 289, 132), "torso"),
    # Row 2 of PANTS/LEG ARMOR, not row 1: row 1 is knee-length shorts with
    # pads, which over a base body already in shorts just reads as bare shins
    # in kneepads. Row 2 is the full-length trouser.
    "legs-pants": ((514, 156, 565, 229), "legs"),
    "rifle-assault": ((869, 106, 972, 140), "weapon"),
    "rifle-sniper": ((869, 181, 972, 213), "weapon"),
    "shield-riot": ((1011, 83, 1055, 146), "shield"),
}

INFECTED_COMPONENTS = {
    # The infected's ragged gear is in CHEST/SHOULDER ARMOR, not the VESTS
    # column — the latter holds the same intact plate carriers the humans wear.
    "infected-torso-torn": ((390, 605, 432, 655), "torso"),
    # Row 3, not row 2: row 2 of the infected pants column is a pair of bare
    # gored legs rather than a garment, which composites as a dark blob.
    "infected-legs": ((514, 585, 565, 655), "legs"),
}

# Retained only as the starting values now seeded into CHARACTER_LAYERS —
# positioning itself happens at runtime, so nothing here is baked into a PNG.
#
# Where each component sits on the body, and how big it has to be.
#
# cx is its centre and ty its top edge, both as fractions of the canvas. `scale`
# multiplies the shared base scale, and it is not optional padding: the board's
# cells are roughly uniform in size regardless of what body part they hold, so
# they are icons rather than body-proportioned layers. A helmet icon (46x39) is
# about right for a head on a 210px body, but a trouser icon (51x73) is ~25%
# short of the ~95px those legs need. Without a per-part scale the trousers
# render as knee pads and the shins stay bare.
#
# All of these are hand-tuned against the board's own assembled examples —
# nothing here can be derived, because the cells carry no anchor and no
# indication of intended size.
PLACEMENT = {
    "head": {"cx": 0.50, "ty": 0.00, "scale": 1.0},
    "torso": {"cx": 0.50, "ty": 0.21, "scale": 1.15},
    # Waist to boot-top: the tallest run on the figure, and the one the
    # icon-sized source art falls shortest of.
    "legs": {"cx": 0.50, "ty": 0.42, "scale": 1.45},
    # Held out to the figure's right, at chest height.
    "weapon": {"cx": 0.62, "ty": 0.33, "scale": 1.0},
    # Carried on the left arm, covering most of the torso.
    "shield": {"cx": 0.30, "ty": 0.26, "scale": 1.15},
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


def cut_arms() -> None:
    """Arms come from the other board (see ARMS_BOARD), so they need its own
    background colour and its own scale reference."""
    global BG
    board = Image.open(ARMS_BOARD).convert("RGB")
    saved, BG = BG, ARMS_BG
    try:
        scale = TARGET_HEIGHT / ARMS_BASE_HEIGHT
        for name, box in ARMS_COMPONENTS.items():
            part = cut(board, box)
            pw = max(1, round(part.width * scale))
            ph = max(1, round(part.height * scale))
            part.resize((pw, ph), Image.NEAREST).save(OUT_DIR / f"{name}.png")
            print(f"{name}.png  {pw}x{ph}  (from {ARMS_BOARD.name})")
    finally:
        BG = saved


def main() -> None:
    board = Image.open(BOARD).convert("RGB")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for base_name, base_box, extras in (
        ("human-base", HUMAN_BASE_BOX, COMPONENTS),
        ("infected-base", INFECTED_BASE_BOX, INFECTED_COMPONENTS),
    ):
        base = cut(board, base_box)
        scale = TARGET_HEIGHT / base.height
        cw = max(1, round(base.width * scale))
        base = base.resize((cw, TARGET_HEIGHT), Image.NEAREST)
        base.save(OUT_DIR / f"{base_name}.png")
        print(f"{base_name}.png  {base.size}")

        # Every layer lands on this same canvas, so the game can seat them all
        # with one originY — the contract characterLayers.ts depends on.
        for name, (box, key) in extras.items():
            part = cut(board, box)
            # One shared scale only — the per-part fitting scale lives in the
            # manifest, where it can be adjusted without re-cutting anything.
            pw = max(1, round(part.width * scale))
            ph = max(1, round(part.height * scale))
            part = part.resize((pw, ph), Image.NEAREST)

            # Emitted tight-cropped, NOT pasted onto a full-figure canvas.
            # Position and size are runtime data now (anchor/dx/dy/scale in
            # CHARACTER_LAYERS, dragged in the gear-fitting panel), so baking
            # them here would just freeze one guess into the PNG.
            part.save(OUT_DIR / f"{name}.png")
            print(f"{name}.png  {part.size}")


if __name__ == "__main__":
    main()
    cut_arms()
