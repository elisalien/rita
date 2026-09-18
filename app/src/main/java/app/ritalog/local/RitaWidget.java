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
 * Home-screen widget. An empty step cell logs "now" in one tap; a filled cell opens the app to edit it.
 */
public class RitaWidget extends AppWidgetProvider {
    static final String ACTION_LOG = "app.ritalog.local.LOG";
    static final String ACTION_TICK = "app.ritalog.local.TICK";
    static final String EXTRA_STEP = "step";

    private static final int[] ZONES = {R.id.zone_wake, R.id.zone_dose, R.id.zone_peak, R.id.zone_drop, R.id.zone_zero};

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
        scheduleTick(c);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
        update(c, m, id);
    }

    @Override
    public void onDisabled(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(tickIntent(c));
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        String action = intent.getAction();
        if (ACTION_LOG.equals(action)) {
            String step = intent.getStringExtra(EXTRA_STEP);
            if (step != null) Store.logNow(c, step);
            updateAll(c);
        } else if (ACTION_TICK.equals(action)) {
            updateAll(c);
        }
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, RitaWidget.class));
        for (int id : ids) update(c, m, id);
        if (ids.length > 0) scheduleTick(c);
    }

    private static void update(Context c, AppWidgetManager m, int id) {
        Bundle o = m.getAppWidgetOptions(id);
        boolean landscape = c.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        int wDp = o.getInt(landscape ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        int hDp = o.getInt(landscape ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
        if (wDp <= 0) wDp = 300;
        if (hDp <= 0) hDp = 130;
        float density = c.getResources().getDisplayMetrics().density;

        JSONObject data = Store.load(c);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_rita);
        rv.setImageViewBitmap(R.id.art, WidgetRenderer.render(c, data, Math.round(wDp * density), Math.round(hDp * density)));
        rv.setOnClickPendingIntent(R.id.zone_head, openApp(c, null, 10));
        JSONObject d = Store.day(data, Store.activeKey(data));
        for (int i = 0; i < ZONES.length; i++) {
            String step = Store.STEPS[i];
            rv.setOnClickPendingIntent(ZONES[i], d.has(step) ? openApp(c, step, 20 + i) : logIntent(c, step, 30 + i));
        }
        m.updateAppWidget(id, rv);
    }

    private static PendingIntent openApp(Context c, String step, int requestCode) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction("app.ritalog.local.OPEN." + (step == null ? "home" : step))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (step != null) i.putExtra(EXTRA_STEP, step);
        return PendingIntent.getActivity(c, requestCode, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent logIntent(Context c, String step, int requestCode) {
        Intent i = new Intent(c, RitaWidget.class).setAction(ACTION_LOG).putExtra(EXTRA_STEP, step);
        return PendingIntent.getBroadcast(c, requestCode, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent tickIntent(Context c) {
        Intent i = new Intent(c, RitaWidget.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(c, 40, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Refreshes elapsed times: every 5 min while a dose is running, else every 30 min (day rollover). */
    private static void scheduleTick(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        JSONObject data = Store.load(c);
        JSONObject d = Store.day(data, Store.activeKey(data));
        boolean active = (d.has("dose") && !d.has("zero")) || (d.has("wake") && !d.has("dose"));
        long delay = (active ? 5 : 30) * 60_000L;
        // Non-wakeup alarm: it fires when the screen is next on, which is when the widget is visible anyway.
        am.set(AlarmManager.RTC, System.currentTimeMillis() + delay, tickIntent(c));
    }
}
