package app.ritalog.local;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Map;

/**
 * Draws the mood widget as one pixel-art bitmap. Layout contract with res/layout/widget_mood.xml:
 * header = top fifth, then a row of five moods and a row of five energy levels (two fifths each).
 * tools/widget_preview.py mirrors this drawing for the widget picker preview.
 */
final class MoodRenderer {
    private static final int[] MOOD_PAL = {0xFFCC6F8C, 0xFFFFB8CB, 0xFFFFE6EE};
    private static final int[] ENERGY_PAL = {0xFFC9A24E, 0xFFFFE08A, 0xFFFFF4CF};
    private static final int LILAC = 0xFFF1EBFF;
    private static final String[] MOOD_WORDS = {"", "très mal", "pas top", "bof", "bien", "super"};

    private MoodRenderer() {}

    static Bitmap render(Context c, JSONObject data, int W, int H) {
        W = Math.max(W, 200);
        H = Math.max(H, 90);
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint();
        p.setAntiAlias(false);

        int headH = H / 5, rowH = (H - headH) / 2, colW = W / 5;
        int u = Math.max(1, Math.min(headH / 11, colW / 30));

        int[] wood = WidgetRenderer.WOOD;
        WidgetRenderer.frame(cv, p, 0, 0, W, H, u, wood[0], wood[1], wood[2], wood[3]);
        p.setColor(LILAC);
        cv.drawRect(3 * u, 3 * u, W - 3 * u, headH, p);
        p.setColor(0xFFD3C4F3);
        cv.drawRect(3 * u, headH - u, W - 3 * u, headH, p);

        JSONObject open = Store.openMood(data);
        JSONArray today = Store.moods(data, Store.keyOf(Calendar.getInstance()));

        Paint tp = WidgetRenderer.textPaint(c, u);
        int baseline = (3 * u + headH - u) / 2 + (7 * u) / 2;
        String left = "♥ humeur";
        String right;
        if (open != null && !open.has("e")) right = MOOD_WORDS[open.optInt("m")] + " · et l'énergie ?";
        else if (open != null && !open.has("m")) right = "et l'humeur ?";
        else if (today.length() > 0) {
            JSONObject last = today.optJSONObject(today.length() - 1);
            right = today.length() + "x · " + Store.fmtHM(last == null ? null : last.optString("t", null));
        } else right = "comment ça va ?";
        int room = W - 10 * u;
        if (tp.measureText(left) + tp.measureText(right) + 3 * u > room) left = "";
        tp.setColor(WidgetRenderer.INK);
        if (!left.isEmpty()) cv.drawText(left, 5 * u, baseline, tp);
        cv.drawText(right, W - 6 * u - tp.measureText(right) + u, baseline, tp);

        Map<String, Sprites.Sprite> sprites = Sprites.get(c);
        drawRow(cv, p, sprites, "mood", "m", open, MOOD_PAL, headH, rowH, W, colW, u, false);
        drawRow(cv, p, sprites, "bat", "e", open, ENERGY_PAL, headH + rowH, H - headH - rowH, W, colW, u, true);
        return bmp;
    }

    private static void drawRow(Canvas cv, Paint p, Map<String, Sprites.Sprite> sprites, String prefix, String kind,
                                JSONObject open, int[] pal, int y, int h, int W, int colW, int u, boolean last) {
        int selected = open != null ? open.optInt(kind, 0) : 0;
        int[] off = WidgetRenderer.OFF;
        for (int i = 0; i < 5; i++) {
            int x0 = Math.max(i * colW + u, 4 * u), x1 = Math.min((i + 1) * colW - u, W - 4 * u);
            int y0 = y + u, y1 = y + h - (last ? 4 * u : 0);
            int cw = x1 - x0, ch = y1 - y0;
            boolean on = selected == i + 1;
            if (on) WidgetRenderer.frame(cv, p, x0, y0, cw, ch, u, pal[0], pal[1], pal[2], pal[2]);
            else WidgetRenderer.frame(cv, p, x0, y0, cw, ch, u, off[0], off[1], off[2], off[3]);
            Sprites.Sprite s = sprites.get(prefix + (i + 1));
            if (s == null) continue;
            int scale = Math.max(1, Math.min((cw - 6 * u) / s.w, (ch - 6 * u) / s.h));
            WidgetRenderer.drawSprite(cv, p, s, x0 + (cw - s.w * scale) / 2, y0 + (ch - s.h * scale) / 2, scale, 255);
        }
    }
}
