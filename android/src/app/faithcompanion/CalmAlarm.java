package app.faithcompanion;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/** End-of-session bell for Calm meditation sits and the Quiet timer when the screen is locked or he's in another app
 *  (WebView pauses JS timers and Web Audio then): an exact alarm posts a gentle notification. When the app is on
 *  screen, the page's own Web Audio bell rings instead. */
public class CalmAlarm extends BroadcastReceiver {
    static final String FIRE = "app.faithcompanion.CALM_BELL", CHANNEL = "calm_bell";
    static final long MAX_DELAY_MS = 4L * 3600_000L;
    /** Its own ids: 7 and 8 belong to Updater / TodoAlarm (tests/android-ids.cjs). */
    static final int NOTIF_ID = 9, OPEN_CODE = 9, FIRE_CODE = 9;
    static volatile boolean appVisible;

    static long clampDelayMs(long ms) {
        if (ms <= 0) return 0;
        return Math.min(ms, MAX_DELAY_MS);
    }

    static boolean shouldNotify(String action, boolean visible) {
        return FIRE.equals(action) && !visible;
    }

    /** The screens a notification may open (only these, never a hash from elsewhere): MainActivity.openHash. */
    static String allowedHash(String h) { return "#workout".equals(h) || "#todo".equals(h) || "#calm".equals(h) ? h : null; }

    static String bodyFor(String label) {
        if (label == null) return "Time is up.";
        String t = label.trim();
        if (t.isEmpty()) return "Time is up.";
        return t.length() > 120 ? t.substring(0, 120) : t;
    }

    private static PendingIntent intent(Context c, String label) {
        Intent i = new Intent(c, CalmAlarm.class).setAction(FIRE);
        if (label != null) i.putExtra("label", label);
        return PendingIntent.getBroadcast(c, FIRE_CODE, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** ms from now; 0 or less cancels. */
    static void set(Context c, long ms, String label) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = intent(c, label);
        am.cancel(pi);
        long delay = clampDelayMs(ms);
        if (delay <= 0) { cancelShown(c); return; }
        long at = System.currentTimeMillis() + delay;
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    static void cancelShown(Context c) {
        try { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTIF_ID); } catch (Exception ignored) { }
    }

    @Override public void onReceive(Context c, Intent i) {
        if (i == null || !shouldNotify(i.getAction(), appVisible)) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Calm session bell", NotificationManager.IMPORTANCE_HIGH);
        ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 220});
        nm.createNotificationChannel(ch);
        Intent open = new Intent(c, MainActivity.class).putExtra("openHash", "#calm")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, OPEN_CODE, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CHANNEL).setSmallIcon(R.drawable.ic_note)
            .setContentTitle("Calm session complete").setContentText(bodyFor(i.getStringExtra("label")))
            .setContentIntent(pi).setAutoCancel(true).setTimeoutAfter(120_000).setCategory(Notification.CATEGORY_ALARM).build();
        try { nm.notify(NOTIF_ID, n); } catch (SecurityException ignored) { }
    }
}
