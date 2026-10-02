package app.ritalog.local;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Mini Rita widget (2x1 or 1x1): shows only the next step. A tap logs it now; once "zéro" is
 * logged, a tap opens the app. Refreshed by RitaWidget.updateAll and its tick.
 */
public class MiniWidget extends AppWidgetProvider {
    static final String ACTION_NEXT = "app.ritalog.local.MINI_NEXT";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
        RitaWidget.scheduleTick(c);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
        update(c, m, id);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (ACTION_NEXT.equals(intent.getAction())) {
            String step = intent.getStringExtra(RitaWidget.EXTRA_STEP);
            if (step != null) Store.logNow(c, step);
            RitaWidget.updateAll(c);
        }
    }

    static int[] ids(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, MiniWidget.class));
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : ids(c)) update(c, m, id);
    }

    private static void update(Context c, AppWidgetManager m, int id) {
        Bundle o = m.getAppWidgetOptions(id);
        int wDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        int hDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
        if (wDp <= 0) wDp = 150;
        if (hDp <= 0) hDp = 70;
        float density = c.getResources().getDisplayMetrics().density;

        JSONObject data = Store.load(c);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_mini);
        rv.setImageViewBitmap(R.id.art, MiniRenderer.render(c, data, Math.round(wDp * density), Math.round(hDp * density)));
        int next = MiniRenderer.next(Store.day(data, Store.activeKey(data)));
        PendingIntent tap;
        if (next >= 0) {
            Intent i = new Intent(c, MiniWidget.class).setAction(ACTION_NEXT).putExtra(RitaWidget.EXTRA_STEP, Store.STEPS[next]);
            tap = PendingIntent.getBroadcast(c, 3000 + id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        } else {
            Intent i = new Intent(c, MainActivity.class)
                    .setAction("app.ritalog.local.OPEN.home")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            tap = PendingIntent.getActivity(c, 4000 + id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        }
        rv.setOnClickPendingIntent(R.id.root, tap);
        m.updateAppWidget(id, rv);
    }
}
