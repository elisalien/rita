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


FACE = [
    ".....oooooo.....",
    "...oohhhbbboo...",
    "..ohhbbbbbbbbo..",
    ".ohbbbbbbbbbbbo.",
    ".ohbbbbbbbbbbbo.",
    "ohbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    ".obbbbbbbbbbbbo.",
    ".obbbbbbbbbbbbo.",
    "..obbbbbbbbbbo..",
    "...oobbbbbboo...",
    ".....oooooo.....",
]
DOT_EYES = [(5, 6), (5, 7), (10, 6), (10, 7)]
# mood 1..5: palette, then feature pixels as (x, y, color key)
MOODS = {
    1: ({"o": "#7d8cc4", "b": "#c8d3f7", "h": "#e6ebff", "t": "#8ec5ff"},
        [(4, 6, "o"), (5, 7, "o"), (11, 6, "o"), (10, 7, "o"), (4, 8, "t"), (4, 9, "t"), (11, 8, "t"), (11, 9, "t"),
         (5, 12, "o"), (6, 11, "o"), (7, 10, "o"), (8, 10, "o"), (9, 11, "o"), (10, 12, "o")]),
    2: ({"o": "#8e97ab", "b": "#d6ddea", "h": "#eef1f6"},
        [(x, y, "o") for x, y in DOT_EYES] + [(6, 11, "o"), (7, 10, "o"), (8, 10, "o"), (9, 11, "o")]),
    3: ({"o": "#c9a24e", "b": "#ffe8a8", "h": "#fff6d6"},
        [(x, y, "o") for x, y in DOT_EYES] + [(6, 10, "o"), (7, 10, "o"), (8, 10, "o"), (9, 10, "o")]),
    4: ({"o": "#6fae67", "b": "#c6ecc0", "h": "#e6f8e2", "k": "#ffb0c0"},
        [(x, y, "o") for x, y in DOT_EYES] + [(3, 9, "k"), (12, 9, "k"),
                                              (6, 10, "o"), (7, 11, "o"), (8, 11, "o"), (9, 10, "o")]),
    5: ({"o": "#cc6f8c", "b": "#ffc2d4", "h": "#ffe4ec", "k": "#ff8fae", "r": "#ff7096"},
        [(4, 7, "o"), (5, 6, "o"), (6, 7, "o"), (9, 7, "o"), (10, 6, "o"), (11, 7, "o"), (3, 9, "k"), (12, 9, "k"),
         (5, 9, "o"), (6, 9, "o"), (7, 9, "o"), (8, 9, "o"), (9, 9, "o"), (10, 9, "o"),
         (6, 10, "o"), (7, 10, "r"), (8, 10, "r"), (9, 10, "o"), (7, 11, "o"), (8, 11, "o")]),
}
BATTERY_COLORS = {1: "#ff9f9f", 2: "#ffb98a", 3: "#ffd86b", 4: "#a8dc98", 5: "#7fcf8a"}


def gen_mood_sprites():
    out = {}
    for level, (pal, feats) in MOODS.items():
        grid = [list(r) for r in FACE]
        for x, y, c in feats:
            grid[y][x] = c
        out[f"mood{level}"] = {"palette": pal, "rows": ["".join(r) for r in grid]}
    for level, fill in BATTERY_COLORS.items():
        rows = ["................", "......oooo......", "....oooooooo...."]
        for seg in range(5, 0, -1):  # segment 5 at the top, 1 at the bottom
            c = "f" if seg <= level else "w"
            rows += ["....ow" + c * 4 + "wo...."] * 2
        rows += ["....owwwwwwo....", "....oooooooo....", "................"]
        out[f"bat{level}"] = {"palette": {"o": "#8a7080", "w": "#fffaf0", "f": fill}, "rows": rows}
    out.update(gen_crisis_sprites())
    out.update(gen_capsules())
    return out


HEART = [
    "................",
    "..oooo....oooo..",
    ".ohhffo..offffo.",
    "ohhffffooffffffo",
    "ohfffffffffffffo",
    "offffffffffffffo",
    "offffffffffffffo",
    ".offffffffffffo.",
    "..offffffffffo..",
    "...offffffffo...",
    "....offffffo....",
    ".....offffo.....",
    "......offo......",
    ".......oo.......",
    "................",
    "................",
]
# anxiety 1..5: a heart that goes from calm lilac to racing red, with shake marks at 4 and 5
ANXIETY = {
    1: ("#9a84c9", "#e6dcff", "#f6f1ff"),
    2: ("#b58aa8", "#ffd6e0", "#fff0f4"),
    3: ("#c9788f", "#ffb3c1", "#ffe0e7"),
    4: ("#c0607a", "#ff8a9e", "#ffc7d2"),
    5: ("#a8445e", "#f0607a", "#ffa8b8"),
}
ANX_FACE = {
    1: [(5, 6), (10, 6), (6, 9), (7, 10), (8, 10), (9, 9)],
    2: [(5, 6), (10, 6), (6, 9), (7, 9), (8, 9), (9, 9)],
    3: [(5, 5), (5, 6), (10, 5), (10, 6), (6, 9), (7, 8), (8, 9), (9, 8)],
    4: [(5, 5), (5, 6), (10, 5), (10, 6), (6, 9), (7, 8), (8, 9), (9, 8), (10, 9)],
    5: [(4, 5), (5, 6), (11, 5), (10, 6), (6, 9), (7, 8), (8, 9), (9, 8), (10, 9)],
}
SHAKE = {4: [(0, 8), (0, 9), (15, 8), (15, 9)],
         5: [(0, 8), (0, 9), (15, 8), (15, 9), (1, 11), (14, 11), (2, 12), (13, 12)]}
BOLT = [
    "................",
    ".......oooo.....",
    "......oyyyo.....",
    ".....oyyyo......",
    "....oyyyo.......",
    "...oyyyyoooo....",
    "..oyYYYYyyyo....",
    "..ooooyyyyo.....",
    ".....oyyyo......",
    "....oyyyo.......",
    "...oyyo.........",
    "..oyo...........",
    "..oo............",
    "................",
    "................",
    "................",
]


def gen_crisis_sprites():
    out = {"bolt": {"palette": {"o": "#8a6fc0", "y": "#d3c4f3", "Y": "#f1ebff"}, "rows": BOLT}}
    for level, (o, f, h) in ANXIETY.items():
        grid = [list(r) for r in HEART]
        for x, y in ANX_FACE[level]:
            grid[y][x] = "o"
        for x, y in SHAKE.get(level, []):
            grid[y][x] = "m"
        out[f"anx{level}"] = {"palette": {"o": o, "f": f, "h": h, "m": o}, "rows": ["".join(r) for r in grid]}
    return out


CAPSULE = [
    "................",
    "................",
    "................",
    "................",
    "....oooooooo....",
    "...oAAAAwwwwo...",
    "..oAaaaawwwwwo..",
    "..oaaaaawwwwwo..",
    "..oaaaaawwwwwo..",
    "..oaaaaawwwwwo..",
    "...oaaaawwwwo...",
    "....oooooooo....",
    "................",
    "................",
    "................",
    "................",
]
# one capsule per treatment color (index = med.col in app.js)
CAPSULE_COLORS = [
    ("#6f8fc4", "#a9c4f5", "#dbe7ff"),
    ("#6fae67", "#b6e3a8", "#e2f6da"),
    ("#9a84c9", "#d3c4f3", "#f1ebff"),
    ("#c9a24e", "#ffe08a", "#fff4cf"),
    ("#d98b62", "#ffc9a3", "#ffeede"),
    ("#4f9e9a", "#9fdcd5", "#dcf5f2"),
]


def gen_capsules():
    out = {}
    for i, (o, a, A) in enumerate(CAPSULE_COLORS):
        out[f"caps{i}"] = {"palette": {"o": o, "a": a, "A": A, "w": "#fffaf0"}, "rows": CAPSULE}
    return out


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


def build_shortcut_icon(sprites):
    """Launcher shortcut "crise": the lilac bolt on a round pale-lilac badge (drawable-nodpi, 192 px)."""
    size = 192
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    from PIL import ImageDraw
    ImageDraw.Draw(img).ellipse((0, 0, size - 1, size - 1), fill=(241, 235, 255, 255))
    spr = sprite_image(sprites["bolt"], 7)
    img.paste(spr, ((size - spr.width) // 2 + 4, (size - spr.height) // 2 + 12), spr)
    folder = os.path.join(RES, "drawable-nodpi")
    os.makedirs(folder, exist_ok=True)
    img.save(os.path.join(folder, "ic_shortcut_crise.png"))


def build_notif_icon(sprites):
    """Status-bar icon: the pill as a white silhouette (Android tints it), 96 px in drawable-nodpi."""
    spr = sprite_image(sprites["pill"], 6)
    alpha = spr.getchannel("A")
    white = Image.new("RGBA", spr.size, (255, 255, 255, 255))
    white.putalpha(alpha)
    folder = os.path.join(RES, "drawable-nodpi")
    os.makedirs(folder, exist_ok=True)
    white.save(os.path.join(folder, "ic_notif.png"))


def main():
    os.makedirs(WWW, exist_ok=True)
    build_font(os.path.join(WWW, "pixel.ttf"))
    sprites = load_sprites()
    sprites.update(gen_mood_sprites())
    with open(os.path.join(WWW, "sprites.js"), "w", encoding="utf-8") as f:
        f.write("window.SPRITES=" + json.dumps(sprites, separators=(",", ":")) + ";\n")
    build_icons(sprites)
    build_shortcut_icon(sprites)
    build_notif_icon(sprites)
    print("ok:", len(G), "glyphs,", len(sprites), "sprites")


if __name__ == "__main__":
    main()
