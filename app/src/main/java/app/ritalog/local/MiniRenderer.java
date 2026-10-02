package app.ritalog.local;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;

import org.json.JSONObject;

/**
 * Draws the mini Rita widget: only the next step (sprite, name, a short hint), framed in its color.
 * Wide (2x1): sprite left, text right. Square (1x1): sprite on top, text below.
 * tools/widget_preview.py mirrors this drawing for the widget picker preview.
 */
final class MiniRenderer {
    static final String[] LABEL = {"Réveil", "Prise", "Pic", "Chute", "Zéro"};

    private MiniRenderer() {}

    /** Index of the step after the last one logged, or -1 once "zéro" is logged. */
    static int next(JSONObject d) {
        int last = -1;
        for (int i = 0; i < Store.STEPS.length; i++) if (d.has(Store.STEPS[i])) last = i;
        return last + 1 < Store.STEPS.length ? last + 1 : -1;
    }

    /** Short hint for the next step: predicted time when the averages allow it, else time elapsed. */
    static String hint(JSONObject data, JSONObject d, int next) {
        String now = Store.nowHM();
        if (next < 0) {
            int t = Store.span(Store.get(d, "dose"), Store.get(d, "zero"));
            return t >= 0 ? "total " + Store.fmtDur(t) : "bonne nuit";
        }
        if (next == 0) return "bon matin !";
        if (next == 1) return d.has("wake") ? "debout +" + Store.fmtDur(Store.span(Store.get(d, "wake"), now)) : "à prendre";
        String dose = Store.get(d, "dose");
        if (dose == null) return "touche ici";
        int avg = Store.avgFromDose(data, Store.STEPS[next]);
        if (avg >= 0) return "vers " + Store.fmtHM(Store.addMin(dose, avg));
        return "+" + Store.fmtDur(Store.span(dose, now));
    }

    static Bitmap render(Context c, JSONObject data, int W, int H) {
        W = Math.max(W, 80);
        H = Math.max(H, 80);
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint();
        p.setAntiAlias(false);

        JSONObject d = Store.day(data, Store.activeKey(data));
        int next = next(d);
        int i = next < 0 ? 4 : next;
        int[] sp = WidgetRenderer.STEP_PAL[i];
        String label = next < 0 ? "Fini ♥" : LABEL[next];
        String hint = hint(data, d, next);
        Sprites.Sprite spr = Sprites.get(c).get(WidgetRenderer.SPRITE[i]);
        boolean wide = W >= H * 8 / 5;
        int u = Math.max(1, Math.min(W, H) / 48);

        if (next < 0) WidgetRenderer.frame(cv, p, 0, 0, W, H, u, sp[0], sp[1], sp[2], sp[2]);
        else WidgetRenderer.frame(cv, p, 0, 0, W, H, u, sp[0], sp[1], WidgetRenderer.CREAM, WidgetRenderer.CREAM);

        if (wide) {
            int s = Math.max(1, (H - 12 * u) / 20);
            int sx = 6 * u, sy = (H - 16 * s) / 2;
            if (spr != null) WidgetRenderer.drawSprite(cv, p, spr, sx, sy, s, 255);
            int tx = sx + 16 * s + 4 * u, room = W - tx - 5 * u;
            Paint big = WidgetRenderer.textPaint(c, 2 * u), small = WidgetRenderer.textPaint(c, u);
            if (big.measureText(label) > room) big = WidgetRenderer.textPaint(c, Math.max(1, 3 * u / 2));
            int block = 14 * u + 4 * u + 7 * u;
            int top = (H - block) / 2;
            big.setColor(WidgetRenderer.INK);
            cv.drawText(label, tx, top + 14 * u, big);
            small.setColor(WidgetRenderer.INK2);
            cv.drawText(fit(small, hint, room), tx, top + block, small);
        } else {
            Paint tp = WidgetRenderer.textPaint(c, u);
            int s = Math.max(1, Math.min((W - 12 * u) / 16, (H - 32 * u) / 16));
            int block = 16 * s + 4 * u + 7 * u + 3 * u + 7 * u;
            int top = (H - block) / 2;
            if (spr != null) WidgetRenderer.drawSprite(cv, p, spr, (W - 16 * s) / 2, top, s, 255);
            int room = W - 10 * u;
            String l = fit(tp, label, room), h = fit(tp, hint, room);
            int b1 = top + 16 * s + 4 * u + 7 * u;
            tp.setColor(WidgetRenderer.INK);
            cv.drawText(l, (W - (tp.measureText(l) - u)) / 2f, b1, tp);
            tp.setColor(WidgetRenderer.INK2);
            cv.drawText(h, (W - (tp.measureText(h) - u)) / 2f, b1 + 10 * u, tp);
        }
        return bmp;
    }

    private static String fit(Paint tp, String s, int room) {
        if (tp.measureText(s) <= room) return s;
        while (s.length() > 1 && tp.measureText(s + ".") > room) s = s.substring(0, s.length() - 1);
        return s + ".";
    }
}
