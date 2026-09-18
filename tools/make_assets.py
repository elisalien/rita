"""Generate Rita's pixel assets from design/ sources.

Outputs:
  app/src/main/assets/www/pixel.ttf   RitaPixel, a 5x7 pixel font (1 em = 8 font pixels)
  app/src/main/assets/www/sprites.js  window.SPRITES, shared by the web UI and the widget
  app/src/main/res/mipmap-*/          adaptive launcher icon layers

Run from the project root:  python tools/make_assets.py
"""
import json
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, "app", "src", "main", "assets", "www")
RES = os.path.join(ROOT, "app", "src", "main", "res")

PX = 125  # font units per pixel; 1000 units per em -> 8 pixels per em
CAP = 7   # cap height in pixels

# Each glyph: rows from the cap line downward ('#' = ink). Rows 7-8 are descenders.
# A (top, rows) tuple starts `top` rows above the cap line (accented capitals).
G = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": ["###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
    "J": ["..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".###.", "#...#", "#....", ".###.", "....#", "#...#", ".###."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "a": [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
    "b": ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
    "c": [".....", ".....", ".###.", "#....", "#....", "#....", ".###."],
    "d": ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
    "e": [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
    "f": ["..##", ".#..", "####", ".#..", ".#..", ".#..", ".#.."],
    "g": [".....", ".....", ".####", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
    "h": ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
    "i": ["#", ".", "#", "#", "#", "#", "#"],
    "j": ["..#", "...", "..#", "..#", "..#", "..#", "..#", "#.#", ".#."],
    "k": ["#...", "#...", "#..#", "#.#.", "##..", "#.#.", "#..#"],
    "l": ["#.", "#.", "#.", "#.", "#.", "#.", ".#"],
    "m": [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
    "n": [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
    "o": [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
    "p": [".....", ".....", "####.", "#...#", "#...#", "#...#", "####.", "#....", "#...."],
    "q": [".....", ".....", ".####", "#...#", "#...#", "#...#", ".####", "....#", "....#"],
    "r": ["....", "....", "#.##", "##..", "#...", "#...", "#..."],
    "s": [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
    "t": [".#..", ".#..", "####", ".#..", ".#..", ".#..", "..##"],
    "u": [".....", ".....", "#...#", "#...#", "#...#", "#...#", ".####"],
    "v": [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "w": [".....", ".....", "#...#", "#...#", "#.#.#", "#.#.#", ".#.#."],
    "x": [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
    "y": [".....", ".....", "#...#", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
    "z": [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": [".#.", "##.", ".#.", ".#.", ".#.", ".#.", "###"],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    ".": [".", ".", ".", ".", ".", ".", "#"],
    ",": ["..", "..", "..", "..", "..", "..", ".#", "#."],
    ":": [".", ".", "#", ".", ".", "#", "."],
    ";": ["..", "..", ".#", "..", "..", ".#", "#."],
    "!": ["#", "#", "#", "#", "#", ".", "#"],
    "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
    "'": ["#", "#"],
    "’": ["#", "#"],
    '"': ["#.#", "#.#"],
    "-": ["....", "....", "....", "####"],
    "–": ["....", "....", "....", "####"],
    "—": [".....", ".....", ".....", "#####"],
    "+": [".....", "..#..", "..#..", "#####", "..#..", "..#.."],
    "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
    "(": [".#", "#.", "#.", "#.", "#.", "#.", ".#"],
    ")": ["#.", ".#", ".#", ".#", ".#", ".#", "#."],
    "[": ["##", "#.", "#.", "#.", "#.", "#.", "##"],
    "]": ["##", ".#", ".#", ".#", ".#", ".#", "##"],
    "%": ["##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##"],
    "*": ["...", "#.#", ".#.", "#.#"],
    "=": ["....", "....", "####", "....", "####"],
    "<": ["...", "..#", ".#.", "#..", ".#.", "..#"],
    ">": ["...", "#..", ".#.", "..#", ".#.", "#.."],
    "_": [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
    "~": ["....", "....", ".#.#", "#.#."],
    "°": [".#.", "#.#", ".#."],
    "·": [".", ".", ".", "#"],
    "…": [".....", ".....", ".....", ".....", ".....", ".....", "#.#.#"],
    "♥": [".......", ".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."],
    "★": ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", ".#...#."],
    "→": [".....", "...#.", "....#", "#####", "....#", "...#."],
}

ACUTE, GRAVE, CIRC, DIAER = ["...#.", "..#.."], [".#...", "..#.."], ["..#..", ".#.#."], [".#.#.", "....."]


def accented(base, mark):
    return mark + G[base][2:]


for ch, base, mark in [
    ("é", "e", ACUTE), ("è", "e", GRAVE), ("ê", "e", CIRC), ("ë", "e", DIAER),
    ("à", "a", GRAVE), ("â", "a", CIRC), ("ù", "u", GRAVE), ("û", "u", CIRC),
    ("ô", "o", CIRC),
]:
    G[ch] = accented(base, mark)
G["î"] = [".#.", "#.#", ".#.", ".#.", ".#.", ".#.", ".#."]
G["ï"] = ["#.#", "...", ".#.", ".#.", ".#.", ".#.", ".#."]
G["ç"] = G["c"] + ["..#..", ".#..."]
G["Ç"] = G["C"] + ["..#..", ".#..."]
for ch, base, mark in [("É", "E", ACUTE), ("È", "E", GRAVE),
                       ("Ê", "E", CIRC), ("À", "A", GRAVE)]:
    G[ch] = (2, mark + G[base])

TABULAR = set("0123456789")
DIGIT_W = 5


def glyph_name(ch):
    return "uni%04X" % ord(ch)


def build_font(path):
    order, cmap, glyphs, metrics = [".notdef", "space"], {32: "space"}, {}, {}
    glyphs[".notdef"] = TTGlyphPen(None).glyph()
    metrics[".notdef"] = (6 * PX, 0)
    glyphs["space"] = TTGlyphPen(None).glyph()
    metrics["space"] = (3 * PX, 0)
    cmap[0xA0] = "space"
    cmap[0x202F] = "space"  # narrow no-break space, used by fr-FR date formatting

    for ch, spec in G.items():
        top, rows = spec if isinstance(spec, tuple) else (0, spec)
        width = max(len(r) for r in rows)
        offset = (DIGIT_W - width) // 2 if ch in TABULAR else 0
        advance = (DIGIT_W + 1) if ch in TABULAR else width + 1
        # merge horizontal runs that repeat on consecutive rows into one rectangle
        rects, open_runs = [], {}
        for i, row in enumerate(rows):
            r = i - top
            runs, x = [], 0
            while x < len(row):
                if row[x] == "#":
                    s = x
                    while x < len(row) and row[x] == "#":
                        x += 1
                    runs.append((s, x))
                else:
                    x += 1
            nxt = {}
            for run in runs:
                if run in open_runs:
                    rect = open_runs[run]
                    rect[3] = r
                else:
                    rect = [run[0], run[1], r, r]
                    rects.append(rect)
                nxt[run] = rect
            open_runs = nxt
        pen = TTGlyphPen(None)
        xmin = None
        for x0, x1, r0, r1 in rects:
            X0, X1 = (x0 + offset) * PX, (x1 + offset) * PX
            Y1, Y0 = (CAP - r0) * PX, (CAP - r1 - 1) * PX
            pen.moveTo((X0, Y0))
            pen.lineTo((X0, Y1))
            pen.lineTo((X1, Y1))
            pen.lineTo((X1, Y0))
            pen.closePath()
            xmin = X0 if xmin is None else min(xmin, X0)
        name = glyph_name(ch)
        order.append(name)
        cmap[ord(ch)] = name
        glyphs[name] = pen.glyph()
        metrics[name] = (advance * PX, xmin or 0)

    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=9 * PX, descent=-2 * PX)
    fb.setupNameTable({"familyName": "RitaPixel", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=9 * PX, sTypoDescender=-2 * PX, sTypoLineGap=0,
                usWinAscent=9 * PX, usWinDescent=2 * PX, sxHeight=5 * PX, sCapHeight=CAP * PX)
    fb.setupPost()
    fb.save(path)


def load_sprites():
    with open(os.path.join(ROOT, "design", "sprites.json"), encoding="utf-8") as f:
        sprites = json.load(f)
    for name, s in sprites.items():
        widths = {len(r) for r in s["rows"]}
        assert len(widths) == 1, f"{name}: uneven rows {widths}"
        for r in s["rows"]:
            for c in r:
                assert c == "." or c in s["palette"], f"{name}: unknown color {c!r}"
    return sprites


def hex_rgba(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def sprite_image(s, scale):
    rows = s["rows"]
    img = Image.new("RGBA", (len(rows[0]), len(rows)), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c != ".":
                px[x, y] = hex_rgba(s["palette"][c])
    return img.resize((img.width * scale, img.height * scale), Image.NEAREST)


def build_icons(sprites):
    densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for d, k in densities.items():
        size = int(108 * k)
        folder = os.path.join(RES, f"mipmap-{d}")
        os.makedirs(folder, exist_ok=True)
        # foreground: the kawaii pill, centered inside the 66dp safe zone
        scale = max(1, int(size * 0.58) // 16)
        spr = sprite_image(sprites["pill"], scale)
        fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        fg.paste(spr, ((size - spr.width) // 2, (size - spr.height) // 2), spr)
        fg.save(os.path.join(folder, "ic_launcher_foreground.png"))
        # background: pastel checkerboard, like an old farm-game menu
        cell = max(2, int(6 * k))
        bg = Image.new("RGBA", (size, size), (255, 226, 234, 255))
        bpx = bg.load()
        for y in range(size):
            for x in range(size):
                if ((x // cell) + (y // cell)) % 2:
                    bpx[x, y] = (255, 237, 242, 255)
        bg.save(os.path.join(folder, "ic_launcher_background.png"))


def main():
    os.makedirs(WWW, exist_ok=True)
    build_font(os.path.join(WWW, "pixel.ttf"))
    sprites = load_sprites()
    with open(os.path.join(WWW, "sprites.js"), "w", encoding="utf-8") as f:
        f.write("window.SPRITES=" + json.dumps(sprites, separators=(",", ":")) + ";\n")
    build_icons(sprites)
    print("ok:", len(G), "glyphs,", len(sprites), "sprites")


if __name__ == "__main__":
    main()
