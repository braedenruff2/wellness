package app.faithcompanion;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** To-do reminders: the page sends every coming reminder ("when<TAB>id<TAB>text" lines, soonest first) after each
 *  change; this keeps them and sets one exact alarm for the soonest. When it goes off: a notification (tap opens the
 *  list), then the alarm for the next one. Re-armed after a reboot and after an app update. */
public class TodoAlarm extends BroadcastReceiver {
    static final String FIRE = "app.faithcompanion.TODO", SNOOZE = "app.faithcompanion.TODO_SNOOZE", CHANNEL = "todo", PREFS = "todo";
    static final long SNOOZE_MS = 60 * 60 * 1000L;

    /** One reminder. */
    static final class Entry {
        final long when; final String id, text;
        Entry(long when, String id, String text) { this.when = when; this.id = id; this.text = text; }
    }

    /** The soonest reminder after `after` (ms) in the page's lines; null if none. Bad lines are skipped. */
    static Entry next(String lines, long after) {
        Entry best = null;
        for (Entry e : parse(lines)) if (e.when > after && (best == null || e.when < best.when)) best = e;
        return best;
    }

    /** Every good line ("when<TAB>id<TAB>text"); "#open<TAB>..." and junk lines are skipped. */
    static List<Entry> parse(String lines) {
        List<Entry> out = new ArrayList<>();
        if (lines == null) return out;
        for (String line : lines.split("\n")) {
            String[] p = line.split("\t", 3);
            if (p.length < 3) continue;
            long w;
            try { w = Long.parseLong(p[0].trim()); } catch (NumberFormatException e) { continue; }
            out.add(new Entry(w, p[1], p[2]));
        }
        return out;
    }

    /** All reminders set for exactly `when` (two tasks at 7 pm both show). */
    static List<Entry> at(String lines, long when) {
        List<Entry> out = new ArrayList<>();
        for (Entry e : parse(lines)) if (e.when == when) out.add(e);
        return out;
    }

    static String task(String id) { return id == null ? "" : id.replaceAll("@.*$", ""); }

    /** The page's "#open<TAB>id,id" line: open tasks that have a reminder time (a snooze stays only for those).
     *  null when the page sent no such line (older page: keep snoozes). */
    static Set<String> open(String lines) {
        if (lines == null) return null;
        for (String line : lines.split("\n")) {
            if (!line.startsWith("#open\t")) continue;
            Set<String> ids = new HashSet<>();
            for (String id : line.substring(6).split(",")) if (!id.trim().isEmpty()) ids.add(id.trim());
            return ids;
        }
        return null;
    }

    /** Snoozed reminders still worth keeping: in the future and (if the page said) for a task that is still open. */
    static String keepSnoozed(String snoozed, Set<String> open, long now) {
        StringBuilder b = new StringBuilder();
        for (Entry e : parse(snoozed)) {
            if (e.when <= now || (open != null && !open.contains(task(e.id)))) continue;
            b.append(line(e)).append('\n');
        }
        return b.toString();
    }

    /** Adds a snooze for task `id` (text from the reminder that just went off), replacing an older snooze of it. */
    static String addSnooze(String snoozed, String id, String text, long when, long now) {
        StringBuilder b = new StringBuilder();
        for (Entry e : parse(snoozed)) if (e.when > now && !task(e.id).equals(task(id))) b.append(line(e)).append('\n');
        return b.append(line(new Entry(when, task(id) + "@snooze", text))).append('\n').toString();
    }

    static String line(Entry e) { return e.when + "\t" + e.id.replaceAll("[\t\n]", " ") + "\t" + e.text.replaceAll("[\t\n]", " "); }

    /** The page's reminders plus the snoozed ones. */
    static String all(Context c) {
        android.content.SharedPreferences p = c.getSharedPreferences(PREFS, 0);
        return p.getString("lines", "") + "\n" + p.getString("snoozed", "");
    }

    static void set(Context c, String lines) {
        android.content.SharedPreferences p = c.getSharedPreferences(PREFS, 0);
        p.edit().putString("lines", lines == null ? "" : lines)
            .putString("snoozed", keepSnoozed(p.getString("snoozed", ""), open(lines), System.currentTimeMillis())).commit();
        arm(c, System.currentTimeMillis());
    }

    private static PendingIntent intent(Context c, Entry e) {
        Intent i = new Intent(c, TodoAlarm.class).setAction(FIRE);
        if (e != null) i.putExtra("when", e.when).putExtra("id", e.id).putExtra("text", e.text);
        return PendingIntent.getBroadcast(c, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Sets the alarm for the soonest reminder after `after`, or none. */
    static void arm(Context c, long after) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.cancel(intent(c, null));
        Entry e = next(all(c), after);
        if (e == null) return;
        PendingIntent pi = intent(c, e);
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.when, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.when, pi);
    }

    @Override public void onReceive(Context c, Intent i) {
        long now = System.currentTimeMillis();
        if (FIRE.equals(i.getAction())) {
            long when = i.getLongExtra("when", now);
            List<Entry> due = at(all(c), when);
            if (due.isEmpty()) show(c, i.getStringExtra("id"), i.getStringExtra("text"));
            for (Entry e : due) show(c, e.id, e.text);
            arm(c, Math.max(when, now - 1));
        } else if (SNOOZE.equals(i.getAction())) {
            // only for a task the page knows (this receiver is exported for boot; ignore made-up ids and text)
            String id = task(i.getStringExtra("id")), text = null;
            for (Entry e : parse(all(c))) if (task(e.id).equals(id)) text = e.text;
            Set<String> open = open(c.getSharedPreferences(PREFS, 0).getString("lines", ""));
            if (text == null && open != null && open.contains(id)) text = i.getStringExtra("text");
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(notifId(id));
            if (text == null || id.isEmpty()) return;
            android.content.SharedPreferences p = c.getSharedPreferences(PREFS, 0);
            p.edit().putString("snoozed", addSnooze(p.getString("snoozed", ""), id, text, now + SNOOZE_MS, now)).commit();
            arm(c, now);
        } else {
            arm(c, now); // boot or update: reminders whose time passed while the phone was off are skipped
        }
    }

    static void show(Context c, String id, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "To-do reminders", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(c, MainActivity.class).putExtra("openHash", "#todo")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 8, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String task = task(id);
        Intent sn = new Intent(c, TodoAlarm.class).setAction(SNOOZE).putExtra("id", task).putExtra("text", text);
        PendingIntent spi = PendingIntent.getBroadcast(c, notifId(task), sn, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CHANNEL).setSmallIcon(R.drawable.ic_note)
            .setContentTitle(text == null || text.isEmpty() ? "To do" : text).setContentText("To-do reminder")
            .setContentIntent(pi).setAutoCancel(true).setCategory(Notification.CATEGORY_REMINDER)
            .addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(c, R.drawable.ic_note), "Snooze 1 hour", spi).build())
            .build();
        // one notification per task (a new reminder for the same task replaces its old one)
        try { nm.notify(notifId(task), n); } catch (SecurityException ignored) { }
    }

    static int notifId(String task) { return 1000 + (task.hashCode() & 0xffff); }
}
