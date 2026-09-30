package app.ritalog.local;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;

import org.json.JSONObject;

import java.util.List;
import java.util.Map;

/**
 * Draws the small treatment widget: one square with the name on top, the capsule in the middle and
 * "à prendre" / "pris 8h12" below. Framed in the treatment color once today's doses are taken.
 * tools/widget_preview.py mirrors this drawing for the widget picker preview.
 */
final class MedRenderer {
    // Same order as MED_PAL in app.js and CAPSULE_COLORS in tools/make_assets.py.
    static final int[][] PAL = {
            {0xFF6F8FC4, 0xFFA9C4F5, 0xFFDBE7FF}, {0xFF6FAE67, 0xFFB6E3A8, 0xFFE2F6DA},
            {0xFF9A84C9, 0xFFD3C4F3, 0xFFF1EBFF}, {0xFFC9A24E, 0xFFFFE08A, 0xFFFFF4CF},
            {0xFFD98B62, 0xFFFFC9A3, 0xFFFFEEDE}, {0xFF4F9E9A, 0xFF9FDCD5, 0xFFDCF5F2},
    };

    private MedRenderer() {}

    static Bitmap render(Context c, JSONObject data, String medId, int W, int H) {
        W = Math.max(W, 80);
        H = Math.max(H, 80);
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint();
        p.setAntiAlias(false);
        int u = Math.max(1, Math.min(W, H) / 64);

        JSONObject med = Store.med(data, medId);
        int col = med == null ? 0 : Math.floorMod(med.optInt("col"), PAL.length);
        int[] pal = PAL[col];
        List<String> taken = med == null ? java.util.Collections.emptyList() : Store.takesToday(data, medId);
        int need = med == null ? 1 : Store.dosesPerDay(med);
        boolean done = med != null && taken.size() >= need;

        int[] off = WidgetRenderer.OFF;
        if (done) WidgetRenderer.frame(cv, p, 0, 0, W, H, u, pal[0], pal[1], pal[2], pal[2]);
        else WidgetRenderer.frame(cv, p, 0, 0, W, H, u, off[0], off[1], off[2], off[3]);

        Paint tp = WidgetRenderer.textPaint(c, u);
        int room = W - 10 * u;
        String name = med == null ? "?" : med.optString("name", "?");
        name = fit(tp, name, room);
        String bottom;
        if (med == null) bottom = "à choisir";
        else if (done) bottom = "pris " + Store.fmtHM(taken.get(taken.size() - 1));
        else if (!taken.isEmpty()) bottom = taken.size() + "/" + need;
        else bottom = "à prendre";
        bottom = fit(tp, bottom, room);

        int topBase = 4 * u + 8 * u;
        int botBase = H - 6 * u;
        tp.setColor(WidgetRenderer.INK);
        cv.drawText(name, (W - (tp.measureText(name) - u)) / 2f, topBase, tp);
        tp.setColor(done ? WidgetRenderer.INK : WidgetRenderer.INK2);
        cv.drawText(bottom, (W - (tp.measureText(bottom) - u)) / 2f, botBase, tp);

        // The capsule only fills rows 4-11 of its 16x16 sprite: center that band between the texts.
        Map<String, Sprites.Sprite> sprites = Sprites.get(c);
        Sprites.Sprite s = sprites.get("caps" + col);
        if (s != null) {
            int bandTop = topBase + 3 * u, bandBot = botBase - 10 * u;
            int scale = Math.max(1, Math.min((W - 12 * u) / s.w, (bandBot - bandTop) / 8));
            int cy = (bandTop + bandBot) / 2;
            WidgetRenderer.drawSprite(cv, p, s, (W - s.w * scale) / 2, cy - 8 * scale, scale, done ? 255 : 150);
        }
        return bmp;
    }

    /** Cuts `s` with a final "." until it fits `room` pixels. */
    private static String fit(Paint tp, String s, int room) {
        if (tp.measureText(s) <= room) return s;
        while (s.length() > 1 && tp.measureText(s + ".") > room) s = s.substring(0, s.length() - 1);
        return s + ".";
    }
}
