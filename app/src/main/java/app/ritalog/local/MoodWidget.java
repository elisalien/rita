package app.ritalog.local;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Mood widget: a row of five moods and a row of five energy levels. Each tap logs immediately;
 * a mood and an energy tapped within 5 minutes form one entry (see Store.logMood).
 */
public class MoodWidget extends AppWidgetProvider {
    static final String ACTION_MOOD = "app.ritalog.local.MOOD";
    static final String ACTION_EXPIRE = "app.ritalog.local.MOOD_EXPIRE";
    static final String EXTRA_KIND = "kind";
    static final String EXTRA_VALUE = "value";

    private static final int[] MOOD_ZONES = {R.id.mood_1, R.id.mood_2, R.id.mood_3, R.id.mood_4, R.id.mood_5};
    private static final int[] ENERGY_ZONES = {R.id.energy_1, R.id.energy_2, R.id.energy_3, R.id.energy_4, R.id.energy_5};

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
        update(c, m, id);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        String action = intent.getAction();
        if (ACTION_MOOD.equals(action)) {
            String kind = intent.getStringExtra(EXTRA_KIND);
            int value = intent.getIntExtra(EXTRA_VALUE, 0);
            if (kind != null && value >= 1 && value <= 5) Store.logMood(c, kind, value);
            updateAll(c);
            scheduleExpire(c);
        } else if (ACTION_EXPIRE.equals(action)) {
            updateAll(c);
        }
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, MoodWidget.class))) update(c, m, id);
    }

    private static void update(Context c, AppWidgetManager m, int id) {
        Bundle o = m.getAppWidgetOptions(id);
        boolean landscape = c.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        int wDp = o.getInt(landscape ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        int hDp = o.getInt(landscape ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
        if (wDp <= 0) wDp = 300;
        if (hDp <= 0) hDp = 150;
        float density = c.getResources().getDisplayMetrics().density;

        JSONObject data = Store.load(c);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_mood);
        rv.setImageViewBitmap(R.id.art, MoodRenderer.render(c, data, Math.round(wDp * density), Math.round(hDp * density)));
        Intent open = new Intent(c, MainActivity.class)
                .setAction("app.ritalog.local.OPEN.mood")
                .putExtra(MainActivity.EXTRA_VIEW, "mood")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        rv.setOnClickPendingIntent(R.id.zone_head,
                PendingIntent.getActivity(c, 50, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        for (int i = 0; i < 5; i++) {
            rv.setOnClickPendingIntent(MOOD_ZONES[i], logIntent(c, "m", i + 1, 60 + i));
            rv.setOnClickPendingIntent(ENERGY_ZONES[i], logIntent(c, "e", i + 1, 70 + i));
        }
        m.updateAppWidget(id, rv);
    }

    private static PendingIntent logIntent(Context c, String kind, int value, int requestCode) {
        Intent i = new Intent(c, MoodWidget.class).setAction(ACTION_MOOD).putExtra(EXTRA_KIND, kind).putExtra(EXTRA_VALUE, value);
        return PendingIntent.getBroadcast(c, requestCode, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Clears the "waiting for the other value" highlight once the 5-minute merge window closes. */
    private static void scheduleExpire(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        Intent i = new Intent(c, MoodWidget.class).setAction(ACTION_EXPIRE);
        PendingIntent pi = PendingIntent.getBroadcast(c, 80, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        am.set(AlarmManager.RTC, System.currentTimeMillis() + (Store.MOOD_MERGE_MIN + 1) * 60_000L, pi);
    }
}
