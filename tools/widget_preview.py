"""Render the widget picker preview (res/drawable-nodpi/widget_preview.png).

Mirrors WidgetRenderer.java with sample data, so keep both in sync.
Usage: python tools/widget_preview.py [width height]  (pixels, default 840x360)
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, "app", "src", "main", "assets", "www")
OUT = os.path.join(ROOT, "app", "src", "main", "res", "drawable-nodpi", "widget_preview.png")

INK, INK2, PINK = "#6b4f5c", "#a58c98", "#ff8fae"
CREAM, SKY, GRASS, GRASS2 = "#fffaf0", "#cdeaf6", "#bfe3b0", "#a6d49a"
WOOD = ["#a8806c", "#f2cda4", "#fde9cc", "#fffaf0"]
OFF = ["#cdb9a8", "#efe3d3", "#fffaf0", "#fffaf0"]
STEP_PAL = [
    ["#d9a54a", "#ffe08a", "#fff4cf"],
    ["#d47c98", "#ffb8cb", "#ffe6ee"],
    ["#7fb86a", "#bfe6a6", "#ebf8e2"],
    ["#d98b62", "#ffc9a3", "#ffeede"],
    ["#9a84c9", "#d3c4f3", "#f1ebff"],
]
SPRITE = ["sun", "pill", "star", "leaf", "moon"]
SAMPLE = ["7h20", "8h00", "9h05", None, None]  # peak logged, drop is next
STATUS = "+2h10 · chute ~11h40"


def load_sprites():
    with open(os.path.join(WWW, "sprites.js"), encoding="utf-8") as f:
        js = f.read()
    return json.loads(js[js.index("{"):js.rindex("}") + 1])


def notched(d, x, y, w, h, u, n, color):
    for i in range(n + 1):
        d.rectangle([x + (n - i) * u, y + i * u, x + w - (n - i) * u - 1, y + h - i * u - 1], fill=color)


def frame(d, x, y, w, h, u, D, W, L, C):
    notched(d, x, y, w, h, u, 2, D)
    notched(d, x + u, y + u, w - 2 * u, h - 2 * u, u, 1, W)
    d.rectangle([x + 2 * u, y + 2 * u, x + w - 2 * u - 1, y + h - 2 * u - 1], fill=L)
    d.rectangle([x + 3 * u, y + 3 * u, x + w - 3 * u - 1, y + h - 3 * u - 1], fill=C)


def text(d, font, s, x, baseline, u, color):
    # PIL anchors at the ascender (9 font px above baseline); Android draws from the baseline.
    d.text((x, baseline), s, font=font, fill=color, anchor="ls")


def main():
    W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (840, 360)
    sprites = load_sprites()
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.fontmode = "1"
    head_h, col_w = H // 4, W // 5
    u = max(1, min((H - head_h) // 31, col_w // 34))
    font = ImageFont.truetype(os.path.join(WWW, "pixel.ttf"), 8 * u)

    frame(d, 0, 0, W, H, u, *WOOD)
    d.rectangle([3 * u, 3 * u, W - 3 * u - 1, head_h - 1], fill=SKY)
    d.rectangle([3 * u, head_h - 2 * u, W - 3 * u - 1, head_h - 1], fill=GRASS)
    d.rectangle([3 * u, head_h - 2 * u, W - 3 * u - 1, head_h - u - 1], fill=GRASS2)
    baseline = (3 * u + head_h - 2 * u) // 2 + (7 * u) // 2
    text(d, font, "♥ ven. 18", 5 * u, baseline, u, INK)
    text(d, font, STATUS, W - 6 * u - d.textlength(STATUS, font=font) + u, baseline, u, INK)

    last = max(i for i, t in enumerate(SAMPLE) if t)
    nxt = last + 1
    for i in range(5):
        done = SAMPLE[i] is not None
        x0, x1 = max(i * col_w + u, 4 * u), min((i + 1) * col_w - u, W - 4 * u)
        y0, y1 = head_h + u, H - 4 * u
        cw, ch = x1 - x0, y1 - y0
        sp = STEP_PAL[i]
        if done:
            frame(d, x0, y0, cw, ch, u, sp[0], sp[1], sp[2], sp[2])
        elif i == nxt:
            frame(d, x0, y0, cw, ch, u, sp[0], sp[1], CREAM, CREAM)
        else:
            frame(d, x0, y0, cw, ch, u, *OFF)
        s = max(1, min((cw - 12 * u) // 16, (ch - 15 * u) // 16))
        content_h = 16 * s + 2 * u + 7 * u
        top = y0 + (ch - content_h) // 2
        spr = sprites[SPRITE[i]]
        sx = x0 + (cw - len(spr["rows"][0]) * s) // 2
        alpha = 255 if done or i == nxt else 100
        for j, row in enumerate(spr["rows"]):
            for k, c in enumerate(row):
                if c == ".":
                    continue
                h = spr["palette"][c].lstrip("#")
                rgba = tuple(int(h[n:n + 2], 16) for n in (0, 2, 4)) + (alpha,)
                layer = Image.new("RGBA", (s, s), rgba)
                img.alpha_composite(layer, (sx + k * s, top + j * s))
        t = SAMPLE[i] or "--h--"
        tw = d.textlength(t, font=font) - u
        text(d, font, t, x0 + (cw - tw) / 2, top + 16 * s + 9 * u, u, INK if done or i == nxt else INK2)
        if i == nxt:
            text(d, font, "♥", x1 - 11 * u, y0 + 11 * u, u, PINK)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT)
    print("wrote", OUT, (W, H), "u =", u)


if __name__ == "__main__":
    main()
