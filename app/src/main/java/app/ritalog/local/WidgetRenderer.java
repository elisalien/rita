package app.ritalog.local;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.Map;

/**
 * Draws the whole widget as one pixel-art bitmap. Layout contract with res/layout/widget_rita.xml:
 * header = top quarter, then five equal columns (réveil, prise, pic, chute, zéro).
 * tools/widget_preview.py mirrors this drawing for the widget picker preview.
 */
final class WidgetRenderer {
    private static final int INK = 0xFF6B4F5C, INK2 = 0xFFA58C98, PINK = 0xFFFF8FAE;
    private static final int CREAM = 0xFFFFFAF0, SKY = 0xFFCDEAF6, GRASS = 0xFFBFE3B0, GRASS2 = 0xFFA6D49A;
    private static final int[] WOOD = {0xFFA8806C, 0xFFF2CDA4, 0xFFFDE9CC, 0xFFFFFAF0};
    private static final int[] OFF = {0xFFCDB9A8, 0xFFEFE3D3, 0xFFFFFAF0, 0xFFFFFAF0};
    private static final int[][] STEP_PAL = {
            {0xFFD9A54A, 0xFFFFE08A, 0xFFFFF4CF},
            {0xFFD47C98, 0xFFFFB8CB, 0xFFFFE6EE},
            {0xFF7FB86A, 0xFFBFE6A6, 0xFFEBF8E2},
            {0xFFD98B62, 0xFFFFC9A3, 0xFFFFEEDE},
            {0xFF9A84C9, 0xFFD3C4F3, 0xFFF1EBFF},
    };
    private static final String[] SPRITE = {"sun", "pill", "star", "leaf", "moon"};
    private static final String[] WEEKDAY = {"dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."};

    private static Typeface font;

    private WidgetRenderer() {}

    static Bitmap render(Context c, JSONObject data, int W, int H) {
        W = Math.max(W, 200);
        H = Math.max(H, 90);
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint();
        p.setAntiAlias(false);

        int headH = H / 4, colW = W / 5;
        int u = Math.max(1, Math.min((H - headH) / 31, colW / 34));

        String key = Store.activeKey(data);
        JSONObject d = Store.day(data, key);

        // frame + sky band + grass line
        frame(cv, p, 0, 0, W, H, u, WOOD[0], WOOD[1], WOOD[2], WOOD[3]);
        p.setColor(SKY);
        cv.drawRect(3 * u, 3 * u, W - 3 * u, headH, p);
        p.setColor(GRASS);
        cv.drawRect(3 * u, headH - 2 * u, W - 3 * u, headH, p);
        p.setColor(GRASS2);
        cv.drawRect(3 * u, headH - 2 * u, W - 3 * u, headH - u, p);

        // header text
        Paint tp = textPaint(c, u);
        int baseline = (3 * u + headH - 2 * u) / 2 + (7 * u) / 2;
        String left = "♥ " + dateLabel(key);
        String right = status(data, d);
        int room = W - 10 * u;
        float lw = tp.measureText(left), rw = tp.measureText(right);
        if (lw + rw + 3 * u > room) left = "";
        if (tp.measureText(right) > room) right = shortStatus(d);
        if (!left.isEmpty()) {
            tp.setColor(INK);
            cv.drawText(left, 5 * u, baseline, tp);
        }
        tp.setColor(INK);
        cv.drawText(right, W - 6 * u - tp.measureText(right) + u, baseline, tp);

        // five step cells
        Map<String, Sprites.Sprite> sprites = Sprites.get(c);
        int last = -1;
        for (int i = 0; i < 5; i++) if (d.has(Store.STEPS[i])) last = i;
        int next = last + 1;
        for (int i = 0; i < 5; i++) {
            String step = Store.STEPS[i];
            boolean done = d.has(step);
            int x0 = Math.max(i * colW + u, 4 * u), x1 = Math.min((i + 1) * colW - u, W - 4 * u);
            int y0 = headH + u, y1 = H - 4 * u;
            int cw = x1 - x0, ch = y1 - y0;
            int[] sp = STEP_PAL[i];
            if (done) frame(cv, p, x0, y0, cw, ch, u, sp[0], sp[1], sp[2], sp[2]);
            else if (i == next) frame(cv, p, x0, y0, cw, ch, u, sp[0], sp[1], CREAM, CREAM);
            else frame(cv, p, x0, y0, cw, ch, u, OFF[0], OFF[1], OFF[2], OFF[3]);

            int s = Math.max(1, Math.min((cw - 12 * u) / 16, (ch - 15 * u) / 16));
            int contentH = 16 * s + 2 * u + 7 * u;
            int top = y0 + (ch - contentH) / 2;
            Sprites.Sprite spr = sprites.get(SPRITE[i]);
            if (spr != null) drawSprite(cv, p, spr, x0 + (cw - spr.w * s) / 2, top, s, done || i == next ? 255 : 100);

            String t = Store.fmtHM(Store.get(d, step));
            tp.setColor(done ? INK : i == next ? INK : INK2);
            float tw = tp.measureText(t) - u;
            cv.drawText(t, x0 + (cw - tw) / 2f, top + 16 * s + 2 * u + 7 * u, tp);

            if (i == next) {
                tp.setColor(PINK);
                cv.drawText("♥", x1 - 11 * u, y0 + 11 * u, tp);
            }
        }
        return bmp;
    }

    private static Paint textPaint(Context c, int u) {
        if (font == null) {
            try {
                font = Typeface.createFromAsset(c.getAssets(), "www/pixel.ttf");
            } catch (RuntimeException e) {
                font = Typeface.MONOSPACE;
            }
        }
        Paint tp = new Paint();
        tp.setAntiAlias(false);
        tp.setTypeface(font);
        tp.setTextSize(8 * u); // RitaPixel: 1 em = 8 font pixels
        return tp;
    }

    private static String dateLabel(String key) {
        String[] parts = key.split("-");
        Calendar cal = Calendar.getInstance();
        cal.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, Integer.parseInt(parts[2]));
        return WEEKDAY[cal.get(Calendar.DAY_OF_WEEK) - 1] + " " + Integer.parseInt(parts[2]);
    }

    static String status(JSONObject data, JSONObject d) {
        String now = Store.nowHM();
        String wake = Store.get(d, "wake"), dose = Store.get(d, "dose");
        if (d.has("zero")) {
            int t = Store.span(dose, Store.get(d, "zero"));
            return t >= 0 ? "total " + Store.fmtDur(t) + " ♥" : "bonne nuit ♥";
        }
        if (dose != null) {
            String elapsed = "+" + Store.fmtDur(Store.span(dose, now));
            String target = d.has("drop") ? "zero" : d.has("peak") ? "drop" : "peak";
            String word = d.has("drop") ? "fin" : d.has("peak") ? "chute" : "pic";
            int avg = Store.avgFromDose(data, target);
            if (avg >= 0) return elapsed + " · " + word + " ~" + Store.fmtHM(Store.addMin(dose, avg));
            return elapsed + " · " + (d.has("drop") ? "ça descend" : d.has("peak") ? "au max" : "ça monte");
        }
        if (d.has("peak") || d.has("drop")) return shortStatus(d);
        if (wake != null) return "debout +" + Store.fmtDur(Store.span(wake, now));
        return "bon matin !";
    }

    private static String shortStatus(JSONObject d) {
        if (d.has("zero")) return "fini ♥";
        if (d.has("drop")) return "ça descend";
        if (d.has("peak")) return "au max ★";
        if (d.has("dose")) return "ça monte";
        if (d.has("wake")) return "debout";
        return "bon matin !";
    }

    static void frame(Canvas cv, Paint p, int x, int y, int w, int h, int u, int D, int Wc, int L, int C) {
        notched(cv, p, x, y, w, h, u, 2, D);
        notched(cv, p, x + u, y + u, w - 2 * u, h - 2 * u, u, 1, Wc);
        p.setColor(L);
        cv.drawRect(x + 2 * u, y + 2 * u, x + w - 2 * u, y + h - 2 * u, p);
        p.setColor(C);
        cv.drawRect(x + 3 * u, y + 3 * u, x + w - 3 * u, y + h - 3 * u, p);
    }

    /** A rectangle with stair-stepped corners, `n` pixels deep, like the 8x8 frame in app.js. */
    private static void notched(Canvas cv, Paint p, int x, int y, int w, int h, int u, int n, int color) {
        p.setColor(color);
        for (int i = 0; i <= n; i++) {
            cv.drawRect(x + (n - i) * u, y + i * u, x + w - (n - i) * u, y + h - i * u, p);
        }
    }

    private static void drawSprite(Canvas cv, Paint p, Sprites.Sprite s, int x, int y, int scale, int alpha) {
        for (int j = 0; j < s.h; j++) {
            for (int i = 0; i < s.w; i++) {
                int c = s.argb[j * s.w + i];
                if (c == 0) continue;
                p.setColor(c);
                p.setAlpha(alpha);
                cv.drawRect(x + i * scale, y + j * scale, x + (i + 1) * scale, y + (j + 1) * scale, p);
            }
        }
        p.setAlpha(255);
    }
}
