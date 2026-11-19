package app.faithcompanion;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import java.util.Calendar;

/** One gentle notification a day at the time he picked (inexact, so no special permission and kind to the battery).
 *  Re-armed after each reminder, after a reboot and after an app update. */
public class Reminder extends BroadcastReceiver {
    private static final String PREFS = "reminder", FIRE = "app.faithcompanion.REMIND", CHANNEL = "daily";

    static void set(Context c, int hour, int minute) {
        c.getSharedPreferences(PREFS, 0).edit().putInt("h", hour).putInt("m", minute).apply();
        arm(c);
    }

    static long nextTime(long now, int hour, int minute) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= now + 30_000) cal.add(Calendar.DAY_OF_YEAR, 1);
        return cal.getTimeInMillis();
    }

    static void arm(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, 0);
        int h = p.getInt("h", -1), m = p.getInt("m", 0);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, new Intent(c, Reminder.class).setAction(FIRE),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        if (h < 0) return;
        long at = nextTime(System.currentTimeMillis(), h, m);
        am.setWindow(AlarmManager.RTC_WAKEUP, at, 10 * 60_000L, pi);
    }

    @Override public void onReceive(Context c, Intent i) {
        if (FIRE.equals(i.getAction())) show(c);
        arm(c); // boot, update, or after a reminder: schedule the next one
    }

    private static final String[] LINES = {
        "A quiet moment? Today's path is ready whenever you are.",
        "Two minutes with God, if there's space today.",
        "No pressure. Today's reading is waiting, whenever suits.",
        "Breathe. You're here, and God is here."
    };

    static void show(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Daily reminder", NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(c, MainActivity.class).putExtra("fromReminder", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String line = LINES[(int) ((System.currentTimeMillis() / 86_400_000L) % LINES.length)];
        Notification n = new Notification.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_note)
            .setContentTitle("Wellness")
            .setContentText(line)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build();
        try { nm.notify(1, n); } catch (SecurityException ignored) { }
    }
}
