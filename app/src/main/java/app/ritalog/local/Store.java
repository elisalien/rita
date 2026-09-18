package app.ritalog.local;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

/**
 * The log, stored as one JSON string in SharedPreferences and shared by the web UI and the widget.
 * Shape: {"v":1,"days":{"2026-09-18":{"wake":"07:10","dose":"07:50","peak":"08:50",
 * "drop":"11:20","zero":"12:30","mg":10,"note":"..."}}}. Mirrors the rules in assets/www/app.js.
 */
final class Store {
    static final String[] STEPS = {"wake", "dose", "peak", "drop", "zero"};

    private static final String PREFS = "rita";
    private static final String KEY = "data";

    private Store() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized String loadRaw(Context c) {
        return prefs(c).getString(KEY, null);
    }

    static synchronized void saveRaw(Context c, String json) {
        prefs(c).edit().putString(KEY, json).apply();
    }

    static JSONObject load(Context c) {
        try {
            String raw = loadRaw(c);
            JSONObject o = raw == null ? new JSONObject() : new JSONObject(raw);
            if (!o.has("days")) o.put("days", new JSONObject());
            if (!o.has("v")) o.put("v", 1);
            return o;
        } catch (JSONException e) {
            try {
                return new JSONObject().put("v", 1).put("days", new JSONObject());
            } catch (JSONException impossible) {
                throw new IllegalStateException(impossible);
            }
        }
    }

    static String keyOf(Calendar cal) {
        return String.format(Locale.US, "%04d-%02d-%02d",
                cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
    }

    static String nowHM() {
        Calendar cal = Calendar.getInstance();
        return String.format(Locale.US, "%02d:%02d", cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE));
    }

    /** After midnight, taps still belong to yesterday until its "zero" is logged (until 5h). */
    static String activeKey(JSONObject data) {
        JSONObject days = data.optJSONObject("days");
        Calendar now = Calendar.getInstance();
        String k = keyOf(now);
        if (days != null && now.get(Calendar.HOUR_OF_DAY) < 5 && !days.has(k)) {
            Calendar y = (Calendar) now.clone();
            y.add(Calendar.DAY_OF_MONTH, -1);
            JSONObject yd = days.optJSONObject(keyOf(y));
            if (yd != null && yd.has("dose") && !yd.has("zero")) return keyOf(y);
        }
        return k;
    }

    static JSONObject day(JSONObject data, String key) {
        JSONObject days = data.optJSONObject("days");
        JSONObject d = days == null ? null : days.optJSONObject(key);
        return d == null ? new JSONObject() : d;
    }

    /** Logs `step` at the current time on the active day, unless it is already set. */
    static synchronized boolean logNow(Context c, String step) {
        JSONObject data = load(c);
        try {
            JSONObject days = data.getJSONObject("days");
            String k = activeKey(data);
            JSONObject d = days.optJSONObject(k);
            if (d == null) {
                d = new JSONObject();
                days.put(k, d);
            }
            if (d.has(step)) return false;
            d.put(step, nowHM());
            if ("dose".equals(step) && !d.has("mg")) {
                Object mg = lastMg(days, k);
                if (mg != null) d.put("mg", mg);
            }
            saveRaw(c, data.toString());
            return true;
        } catch (JSONException e) {
            return false;
        }
    }

    private static Object lastMg(JSONObject days, String beforeKey) {
        List<String> keys = sortedKeys(days);
        Collections.reverse(keys);
        for (String k : keys) {
            JSONObject d = days.optJSONObject(k);
            if (k.compareTo(beforeKey) < 0 && d != null && d.has("mg")) return d.opt("mg");
        }
        return null;
    }

    static List<String> sortedKeys(JSONObject days) {
        List<String> keys = new ArrayList<>();
        for (Iterator<String> it = days.keys(); it.hasNext(); ) keys.add(it.next());
        Collections.sort(keys);
        return keys;
    }

    static int toMin(String hm) {
        return Integer.parseInt(hm.substring(0, 2)) * 60 + Integer.parseInt(hm.substring(3, 5));
    }

    /** Minutes from a to b, assuming b follows a within 24h; -1 if either is missing. */
    static int span(String a, String b) {
        if (a == null || b == null) return -1;
        return ((toMin(b) - toMin(a)) % 1440 + 1440) % 1440;
    }

    static String addMin(String hm, int m) {
        int t = ((toMin(hm) + m) % 1440 + 1440) % 1440;
        return String.format(Locale.US, "%02d:%02d", t / 60, t % 60);
    }

    static String fmtHM(String hm) {
        if (hm == null) return "--h--";
        return Integer.parseInt(hm.substring(0, 2)) + "h" + hm.substring(3, 5);
    }

    static String fmtDur(int m) {
        if (m < 0) return "?";
        if (m < 60) return m + "min";
        return (m / 60) + "h" + String.format(Locale.US, "%02d", m % 60);
    }

    /** Average minutes from dose to `step` over the last 14 dosed days, or -1. */
    static int avgFromDose(JSONObject data, String step) {
        JSONObject days = data.optJSONObject("days");
        if (days == null) return -1;
        List<String> keys = sortedKeys(days);
        Collections.reverse(keys);
        int n = 0, sum = 0, used = 0;
        for (String k : keys) {
            JSONObject d = days.optJSONObject(k);
            if (d == null || !d.has("dose")) continue;
            if (used++ >= 14) break;
            int s = span(d.optString("dose", null), d.optString(step, null));
            if (s >= 0) {
                sum += s;
                n++;
            }
        }
        return n == 0 ? -1 : Math.round(sum / (float) n);
    }

    // ---------- moods: {"moods":{"2026-09-18":[{"t":"14:05","m":4,"e":3}]}} ----------

    static final int MOOD_MERGE_MIN = 5;

    static JSONArray moods(JSONObject data, String key) {
        JSONObject all = data.optJSONObject("moods");
        JSONArray arr = all == null ? null : all.optJSONArray(key);
        return arr == null ? new JSONArray() : arr;
    }

    /** Last entry of today if tapped under 5 min ago with one value still missing, else null. */
    static JSONObject openMood(JSONObject data) {
        JSONArray arr = moods(data, keyOf(Calendar.getInstance()));
        if (arr.length() == 0) return null;
        JSONObject last = arr.optJSONObject(arr.length() - 1);
        if (last == null || span(last.optString("t", null), nowHM()) > MOOD_MERGE_MIN) return null;
        return (!last.has("m") || !last.has("e")) ? last : null;
    }

    /** Same rule as logMood in app.js: complete or correct the open entry, else start a new one. */
    static synchronized void logMood(Context c, String kind, int value) {
        JSONObject data = load(c);
        try {
            if (!data.has("moods")) data.put("moods", new JSONObject());
            JSONObject all = data.getJSONObject("moods");
            String k = keyOf(Calendar.getInstance());
            JSONArray arr = all.optJSONArray(k);
            if (arr == null) {
                arr = new JSONArray();
                all.put(k, arr);
            }
            JSONObject open = openMood(data);
            if (open != null) open.put(kind, value);
            else arr.put(new JSONObject().put("t", nowHM()).put(kind, value));
            saveRaw(c, data.toString());
        } catch (JSONException ignored) {
            // nothing sensible to do from a widget tap
        }
    }

    static String get(JSONObject d, String step) {
        return d.has(step) ? d.optString(step, null) : null;
    }
}
