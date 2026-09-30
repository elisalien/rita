package app.ritalog.local;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.List;

/**
 * Shown when the treatment widget is placed: pick which treatment the square logs. With a single
 * daily treatment it is picked straight away.
 */
public class MedConfigActivity extends Activity {
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        Bundle extras = getIntent().getExtras();
        if (extras != null) widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        List<JSONObject> meds = Store.dailyMeds(Store.load(this));
        if (meds.size() == 1) {
            choose(meds.get(0).optString("id"));
            return;
        }

        float d = getResources().getDisplayMetrics().density;
        Typeface font;
        try {
            font = Typeface.createFromAsset(getAssets(), "www/pixel.ttf");
        } catch (RuntimeException e) {
            font = Typeface.MONOSPACE;
        }
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        int pad = Math.round(20 * d);
        list.setPadding(pad, pad, pad, pad);
        list.setBackgroundColor(WidgetRenderer.CREAM);

        TextView title = text(meds.isEmpty() ? "Pas encore de traitement" : "Quel traitement ?", 24, font);
        list.addView(title);
        if (meds.isEmpty()) {
            TextView hint = text("Ajoute-le d'abord dans Rita : onglet rita, « + ajouter un autre traitement », "
                    + "choisis « tous les jours ». Puis remets le widget.", 16, font);
            hint.setTextColor(WidgetRenderer.INK2);
            list.addView(hint);
            TextView open = row("ouvrir Rita", null, font, d);
            open.setOnClickListener(v -> {
                startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                finish();
            });
            list.addView(open);
        }
        for (JSONObject m : meds) {
            LinearLayout r = new LinearLayout(this);
            r.setOrientation(LinearLayout.HORIZONTAL);
            r.setGravity(Gravity.CENTER_VERTICAL);
            r.setPadding(Math.round(10 * d), Math.round(8 * d), Math.round(10 * d), Math.round(8 * d));
            int col = Math.floorMod(m.optInt("col"), MedRenderer.PAL.length);
            r.setBackground(box(MedRenderer.PAL[col][2], MedRenderer.PAL[col][0], d));
            ImageView img = new ImageView(this);
            img.setImageBitmap(capsule(col, 4));
            r.addView(img);
            TextView name = text(m.optString("name"), 20, font);
            name.setPadding(Math.round(12 * d), 0, 0, 0);
            r.addView(name);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.topMargin = Math.round(12 * d);
            String id = m.optString("id");
            r.setOnClickListener(v -> choose(id));
            list.addView(r, lp);
        }
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(WidgetRenderer.CREAM);
        scroll.addView(list);
        setContentView(scroll);
    }

    private void choose(String medId) {
        MedWidget.setMed(this, widgetId, medId);
        MedWidget.update(this, AppWidgetManager.getInstance(this), widgetId);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }

    private TextView text(String s, int sp, Typeface font) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTypeface(font);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(WidgetRenderer.INK);
        t.setPadding(0, 0, 0, Math.round(8 * getResources().getDisplayMetrics().density));
        return t;
    }

    private TextView row(String s, Integer color, Typeface font, float d) {
        TextView t = text(s, 20, font);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, Math.round(10 * d), 0, Math.round(10 * d));
        t.setBackground(box(WidgetRenderer.CREAM, color == null ? WidgetRenderer.WOOD[0] : color, d));
        return t;
    }

    private static GradientDrawable box(int fill, int border, float d) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setStroke(Math.round(3 * d), border);
        return g;
    }

    private Bitmap capsule(int col, int scale) {
        Sprites.Sprite s = Sprites.get(this).get("caps" + col);
        if (s == null) return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        // Only rows 4-11 hold the capsule.
        Bitmap b = Bitmap.createBitmap(s.w * scale, 8 * scale, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        cv.translate(0, -4 * scale);
        WidgetRenderer.drawSprite(cv, new Paint(), s, 0, 0, scale, 255);
        return b;
    }
}
