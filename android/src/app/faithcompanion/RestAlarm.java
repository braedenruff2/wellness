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

/** The workout rest timer's end when the screen is off or he's in another app (the page's own beep can't sound then):
 *  an exact alarm, then a notification that beeps and vibrates. When the app is on screen, the page beeps instead. */
public class RestAlarm extends BroadcastReceiver {
    static final String FIRE = "app.faithcompanion.REST", CHANNEL = "rest";
    static volatile boolean appVisible;

    private static PendingIntent intent(Context c, String label) {
        Intent i = new Intent(c, RestAlarm.class).setAction(FIRE);
        if (label != null) i.putExtra("label", label);
        return PendingIntent.getBroadcast(c, 5, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** ms from now; 0 or less cancels. */
    static void set(Context c, long ms, String label) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = intent(c, label);
        am.cancel(pi);
        if (ms <= 0) { cancelShown(c); return; }
        long at = System.currentTimeMillis() + ms;
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    static void cancelShown(Context c) {
        try { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(5); } catch (Exception ignored) { }
    }

    @Override public void onReceive(Context c, Intent i) {
        if (!FIRE.equals(i.getAction()) || appVisible) return;          // on screen: the page beeps
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Workout rest timer", NotificationManager.IMPORTANCE_HIGH);
        ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 250, 120, 250});
        nm.createNotificationChannel(ch);
        Intent open = new Intent(c, MainActivity.class).putExtra("openHash", "#workout")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 6, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String label = i.getStringExtra("label");
        Notification n = new Notification.Builder(c, CHANNEL).setSmallIcon(R.drawable.ic_note)
            .setContentTitle("Rest's over: go!").setContentText(label == null || label.isEmpty() ? "Next set" : label)
            .setContentIntent(pi).setAutoCancel(true).setTimeoutAfter(60_000).setCategory(Notification.CATEGORY_ALARM).build();
        try { nm.notify(5, n); } catch (SecurityException ignored) { }
    }
}
