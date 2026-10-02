package app.ritalog.local;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Midday reminder: at the chosen time (13:00 by default), if a daily treatment due by then has not
 * been logged today, a notification asks "as-tu pris … ?". "Pris" logs it, "Dans 1 h" asks again.
 * Rescheduled after each run, whenever the app saves, and by ReminderBoot after a reboot or update.
 */
public class Reminder extends BroadcastReceiver {
    static final String ACTION_REMIND = "app.ritalog.local.REMIND";
    static final String ACTION_TAKEN = "app.ritalog.local.REMIND_TAKEN";
    static final String ACTION_LATER = "app.ritalog.local.REMIND_LATER";
    private static final String CHANNEL = "rappels";
    private static final int NOTIF_ID = 7;

    @Override
    public void onReceive(Context c, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REMIND.equals(action)) {
            remindIfNeeded(c);
            schedule(c);
        } else if (ACTION_TAKEN.equals(action)) {
            JSONObject data = Store.load(c);
            for (JSONObject m : pending(data)) {
                int missing = Store.dosesDueNow(m) - Store.takesToday(data, m.optString("id")).size();
                List<String> times = planned(m);
                int done = Store.takesToday(data, m.optString("id")).size();
                for (int i = 0; i < missing; i++) {
                    // Taken earlier: use the planned time when there is one, else now.
                    int k = done + i;
                    Store.logTake(c, m.optString("id"), k < times.size() ? times.get(k) : Store.nowHM());
                }
            }
            cancel(c);
            RitaWidget.updateAll(c);
        } else if (ACTION_LATER.equals(action)) {
            cancel(c);
            AlarmManager am = c.getSystemService(AlarmManager.class);
            if (am != null) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 3_600_000L, remindIntent(c, 61));
        }
    }

    /** Daily treatments with fewer takes today than planned doses already due. */
    static List<JSONObject> pending(JSONObject data) {
        List<JSONObject> out = new ArrayList<>();
        for (JSONObject m : Store.dailyMeds(data)) {
            if (Store.takesToday(data, m.optString("id")).size() < Store.dosesDueNow(m)) out.add(m);
        }
        return out;
    }

    private static List<String> planned(JSONObject m) {
        List<String> out = new ArrayList<>();
        JSONArray t = m.optJSONArray("times");
        if (t != null) for (int i = 0; i < t.length(); i++) out.add(t.optString(i));
        return out;
    }

    static void remindIfNeeded(Context c) {
        JSONObject data = Store.load(c);
        if (!Store.remindOn(data)) return;
        List<JSONObject> meds = pending(data);
        if (meds.isEmpty()) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Rappels de traitement", NotificationManager.IMPORTANCE_DEFAULT));

        StringBuilder names = new StringBuilder();
        for (int i = 0; i < meds.size(); i++) {
            if (i > 0) names.append(i == meds.size() - 1 ? " et " : ", ");
            names.append(meds.get(i).optString("name"));
        }
        Intent open = new Intent(c, MainActivity.class)
                .setAction("app.ritalog.local.OPEN.today")
                .putExtra(MainActivity.EXTRA_VIEW, "today")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif)
                .setColor(0xFFFF8FAE)
                .setContentTitle("Rita ♥")
                .setContentText("As-tu bien pris " + names + " ?")
                .setContentIntent(PendingIntent.getActivity(c, 62, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
                .setAutoCancel(true)
                .addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_notif), "Oui, pris",
                        self(c, ACTION_TAKEN, 63)).build())
                .addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_notif), "Dans 1 h",
                        self(c, ACTION_LATER, 64)).build())
                .build();
        try {
            nm.notify(NOTIF_ID, n);
        } catch (SecurityException noPermission) {
            // Notifications refused: nothing to show.
        }
    }

    private static void cancel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(NOTIF_ID);
    }

    private static PendingIntent self(Context c, String action, int requestCode) {
        Intent i = new Intent(c, Reminder.class).setAction(action);
        return PendingIntent.getBroadcast(c, requestCode, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent remindIntent(Context c, int requestCode) {
        return self(c, ACTION_REMIND, requestCode);
    }

    /** Next reminder time (today if still ahead, else tomorrow), or cancel when off or no daily treatment. */
    static void schedule(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        JSONObject data = Store.load(c);
        PendingIntent pi = remindIntent(c, 60);
        if (!Store.remindOn(data) || Store.dailyMeds(data).isEmpty()) {
            am.cancel(pi);
            return;
        }
        int t = Store.toMin(Store.remindTime(data));
        Calendar at = Calendar.getInstance();
        at.set(Calendar.HOUR_OF_DAY, t / 60);
        at.set(Calendar.MINUTE, t % 60);
        at.set(Calendar.SECOND, 0);
        at.set(Calendar.MILLISECOND, 0);
        if (at.getTimeInMillis() <= System.currentTimeMillis()) at.add(Calendar.DAY_OF_MONTH, 1);
        // Inexact but allowed in Doze: may come a few minutes late, needs no exact-alarm permission.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.getTimeInMillis(), pi);
    }
}
