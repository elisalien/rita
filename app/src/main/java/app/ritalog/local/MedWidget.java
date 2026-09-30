package app.ritalog.local;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Calendar;

/**
 * Small square widget for one other treatment (chosen in MedConfigActivity). A tap logs today's take;
 * once the day's doses are taken, a tap opens the app to check or correct it. Resets at midnight.
 */
public class MedWidget extends AppWidgetProvider {
    static final String ACTION_TAKE = "app.ritalog.local.TAKE";
    static final String ACTION_MIDNIGHT = "app.ritalog.local.MED_MIDNIGHT";
    static final String EXTRA_MED = "med";

    private static final String PREFS = "rita_medwidget"; // appWidgetId -> med id

    static void setMed(Context c, int widgetId, String medId) {
        prefs(c).edit().putString(String.valueOf(widgetId), medId).apply();
    }

    static String medOf(Context c, int widgetId) {
        return prefs(c).getString(String.valueOf(widgetId), null);
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
        scheduleMidnight(c);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
        update(c, m, id);
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        SharedPreferences.Editor e = prefs(c).edit();
        for (int id : ids) e.remove(String.valueOf(id));
        e.apply();
    }

    @Override
    public void onDisabled(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(midnightIntent(c));
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        String action = intent.getAction();
        if (ACTION_TAKE.equals(action)) {
            String med = intent.getStringExtra(EXTRA_MED);
            if (med != null) Store.logTake(c, med);
            RitaWidget.updateAll(c);
        } else if (ACTION_MIDNIGHT.equals(action)) {
            updateAll(c);
        }
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, MedWidget.class));
        for (int id : ids) update(c, m, id);
        if (ids.length > 0) scheduleMidnight(c);
    }

    static void update(Context c, AppWidgetManager m, int id) {
        Bundle o = m.getAppWidgetOptions(id);
        int wDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        int hDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
        if (wDp <= 0) wDp = 80;
        if (hDp <= 0) hDp = 80;
        float density = c.getResources().getDisplayMetrics().density;

        JSONObject data = Store.load(c);
        String medId = medOf(c, id);
        JSONObject med = Store.med(data, medId);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_med);
        rv.setImageViewBitmap(R.id.art, MedRenderer.render(c, data, medId, Math.round(wDp * density), Math.round(hDp * density)));

        boolean done = med != null && Store.takesToday(data, medId).size() >= Store.dosesPerDay(med);
        PendingIntent tap;
        if (med != null && !done) {
            Intent i = new Intent(c, MedWidget.class).setAction(ACTION_TAKE).putExtra(EXTRA_MED, medId);
            tap = PendingIntent.getBroadcast(c, 1000 + id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        } else {
            Intent i = new Intent(c, MainActivity.class)
                    .setAction("app.ritalog.local.OPEN.today")
                    .putExtra(MainActivity.EXTRA_VIEW, "today")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            tap = PendingIntent.getActivity(c, 2000 + id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        }
        rv.setOnClickPendingIntent(R.id.root, tap);
        m.updateAppWidget(id, rv);
    }

    private static PendingIntent midnightIntent(Context c) {
        Intent i = new Intent(c, MedWidget.class).setAction(ACTION_MIDNIGHT);
        return PendingIntent.getBroadcast(c, 90, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Next day: the square goes back to "à prendre". Non-wakeup, it fires when the screen is next on. */
    private static void scheduleMidnight(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_MONTH, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 30);
        am.set(AlarmManager.RTC, next.getTimeInMillis(), midnightIntent(c));
    }
}
