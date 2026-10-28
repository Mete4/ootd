"""
Makes the app icons from one t-shirt outline.

The icons are kept as generated files, not as hand-drawn binaries, so that a
change of colour or shape is a one line edit and a re-run.

Run it from the project root:

    python scripts/make_icons.py

It writes assets/icon.png, assets/adaptive-icon.png and assets/favicon.png.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# The app palette. See src/theme.ts.
BACKGROUND = (18, 18, 18)       # C.main
SHIRT = (0, 191, 165)           # C.accent

# Everything is drawn 4 times larger and then reduced, which is what gives the
# edges their smoothness. Pillow has no antialiased polygon fill.
SUPERSAMPLE = 4

# The outline is written in a 1000 by 1000 space and scaled to each output.
SPACE = 1000.0

# Corner rounding, in that same space. A t-shirt with sharp corners looks cut
# out rather than drawn.
CORNER_RADIUS = 13.0

# Clockwise from the left shoulder. `neckline` closes the top, and it owns both
# of its end points: writing them here as well left a segment a few units long
# at each shoulder, and a round join that wide over a segment that short draws a
# blob rather than a corner.
SHIRT_OUTLINE = [
    (296, 140),   # left shoulder
    (88, 300),    # left sleeve, top of the outer edge
    (166, 452),   # left sleeve, bottom of the outer edge
    (278, 404),   # left underarm
    (256, 900),   # bottom left of the hem
    (744, 900),   # bottom right of the hem
    (722, 404),   # right underarm
    (834, 452),   # right sleeve, bottom of the outer edge
    (912, 300),   # right sleeve, top of the outer edge
    (704, 140),   # right shoulder
]

NECK_LEFT_X = 385.0
NECK_RIGHT_X = 615.0
NECK_Y = 100.0

NECK_DEPTH = 72.0    # how far the neckline dips below the shoulder line
NECK_STEPS = 64      # how many points make the neckline curve

# How far in from the ends of a half ellipse the neckline starts, in radians.
#
# A full half ellipse arrives at each end travelling straight up, which almost
# reverses into the shoulder line. The round join then puts a visible nick on
# each side of the collar. Cutting the ends off the arc makes the two lines
# meet at an open angle instead.
NECK_END_ANGLE = 0.60


def neckline() -> list[tuple[float, float]]:
    """
    The curve from the right of the neck back to the left.

    Both x and y come from the same angle, which is what makes it an ellipse.
    Sweeping x evenly against a sine y gives a pointed V, not a crew neck.

    It is sampled rather than drawn with `Draw.arc`, because the whole outline
    has to be one polygon for the corner rounding to work.
    """
    centre_x = (NECK_LEFT_X + NECK_RIGHT_X) / 2

    # Widen and deepen the ellipse so that the part still in use spans the neck
    # opening exactly and dips by NECK_DEPTH.
    half_width = (NECK_RIGHT_X - NECK_LEFT_X) / 2
    radius_x = half_width / math.cos(NECK_END_ANGLE)
    radius_y = NECK_DEPTH / (1 - math.sin(NECK_END_ANGLE))
    lift = radius_y * math.sin(NECK_END_ANGLE)

    start = NECK_END_ANGLE
    end = math.pi - NECK_END_ANGLE

    points = []
    for step in range(NECK_STEPS + 1):
        angle = start + (end - start) * step / NECK_STEPS
        points.append((
            centre_x + radius_x * math.cos(angle),
            NECK_Y + radius_y * math.sin(angle) - lift,
        ))
    return points


def shirt_path() -> list[tuple[float, float]]:
    return SHIRT_OUTLINE + neckline()


def draw_shirt(canvas_px: int, shirt_px: float, background, shirt_colour,
               fit: str = "box"):
    """
    Draws one icon.

    `shirt_px` is the room the t-shirt is given in the finished image. With
    `fit="box"` that is the side of a square; with `fit="circle"` it is the
    diameter of a circle, and no part of the shirt crosses it.

    `background` of None leaves the image transparent, which is what the Android
    adaptive foreground needs: the launcher paints the colour behind it.
    """
    big = int(canvas_px * SUPERSAMPLE)
    mode = "RGBA" if background is None else "RGB"
    fill = (0, 0, 0, 0) if background is None else background
    image = Image.new(mode, (big, big), fill)
    draw = ImageDraw.Draw(image)

    path = shirt_path()
    min_x = min(p[0] for p in path)
    max_x = max(p[0] for p in path)
    min_y = min(p[1] for p in path)
    max_y = max(p[1] for p in path)

    if fit == "circle":
        # A square that fits a circle side-on still pushes its corners through
        # it. Measure the real reach of the shape from its middle instead.
        middle_x = (min_x + max_x) / 2
        middle_y = (min_y + max_y) / 2
        reach = max(math.hypot(x - middle_x, y - middle_y) for x, y in path)
        scale = (shirt_px * SUPERSAMPLE) / (reach * 2)
    else:
        # Scale so the wider of the two sides reaches `shirt_px`.
        scale = (shirt_px * SUPERSAMPLE) / max(max_x - min_x, max_y - min_y)
    offset_x = (big - (max_x - min_x) * scale) / 2 - min_x * scale
    offset_y = (big - (max_y - min_y) * scale) / 2 - min_y * scale
    placed = [(x * scale + offset_x, y * scale + offset_y) for x, y in path]

    colour = shirt_colour if background is not None else shirt_colour + (255,)
    draw.polygon(placed, fill=colour)

    # Filling gives sharp corners. Tracing the same outline with a thick round
    # jointed line grows the shape by the radius and rounds every corner.
    #
    # The trace runs one point past the start. Stopping exactly on the start
    # leaves the two end caps butted together, and that seam shows as a speck.
    # Carrying on into the next segment paints over it.
    stroke = max(1, int(round(CORNER_RADIUS * scale * 2)))
    draw.line(placed + [placed[0], placed[1]], fill=colour, width=stroke, joint="curve")

    return image.resize((canvas_px, canvas_px), Image.LANCZOS)


def main() -> None:
    # The store rejects an icon that carries transparency, so this one is RGB.
    # 72% leaves room for the rounded mask that iOS and Android both apply.
    draw_shirt(1024, 1024 * 0.72, BACKGROUND, SHIRT).save(ASSETS / "icon.png")

    # The Android adaptive foreground. A launcher may mask this to a circle of
    # the middle 66%, so the whole shirt has to sit inside that circle, with a
    # little to spare. The background colour comes from app.json, which is why
    # this layer is transparent.
    draw_shirt(1024, 1024 * 0.63, None, SHIRT, fit="circle").save(
        ASSETS / "adaptive-icon.png")

    # At 48 pixels a thin shape disappears, so the shirt takes more of the box.
    draw_shirt(48, 48 * 0.84, BACKGROUND, SHIRT).save(ASSETS / "favicon.png")

    for name in ("icon.png", "adaptive-icon.png", "favicon.png"):
        path = ASSETS / name
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
