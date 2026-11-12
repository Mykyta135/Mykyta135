"""One-off: turn a photo into a coloured ASCII portrait for the neofetch card.

usage: python3 tools/portrait.py <image> <out.json> [cols] [x0,y0,x1,y1]

Writes {"cols", "rows", "lines": [[[char, "#rrggbb"], ...], ...]}.
The photo itself is not committed; only the resulting JSON is.
"""
import json
import sys

from PIL import Image, ImageEnhance, ImageOps

RAMP = " .,:;i1tfLCG08@"
LUM_GAMMA = 0.6
COLOUR_GAMMA = 0.45
CHAR_ASPECT = 0.83  # cell width / line height of the portrait in the card (ART_CW / ART_LH)


def main() -> None:
    src, out = sys.argv[1], sys.argv[2]
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    im = Image.open(src).convert("RGB")
    if len(sys.argv) > 4:
        im = im.crop(tuple(int(v) for v in sys.argv[4].split(",")))

    rows = max(1, round(cols * im.height / im.width * CHAR_ASPECT))
    small = im.resize((cols, rows), Image.LANCZOS)
    # the photo is very dark: stretch levels for the glyph choice, boost colour for the fill
    lum = ImageOps.autocontrast(small.convert("L"), cutoff=1)
    lum = lum.point(lambda v: int(255 * (v / 255) ** LUM_GAMMA))
    # gamma (not a linear gain) so the dark hair and sweater stay visible next to the lamp
    colour = ImageEnhance.Color(small).enhance(1.5).point(lambda v: int(255 * (v / 255) ** COLOUR_GAMMA))

    lines = []
    for y in range(rows):
        line = []
        for x in range(cols):
            v = lum.getpixel((x, y)) / 255
            ch = RAMP[min(len(RAMP) - 1, int(v * len(RAMP)))]
            r, g, b = colour.getpixel((x, y))
            line.append([ch, f"#{r:02x}{g:02x}{b:02x}"])
        lines.append(line)

    with open(out, "w") as f:
        json.dump({"cols": cols, "rows": rows, "lines": lines}, f, separators=(",", ":"))
    for line in lines:
        print("".join(c for c, _ in line))


if __name__ == "__main__":
    main()
