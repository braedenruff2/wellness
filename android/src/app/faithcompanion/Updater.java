package app.faithcompanion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.os.Build;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Keeps the app up to date by itself, like Loudbook: it looks for a newer dist/Wellness.apk (on his PC through the
 * PC link at home, else in the public GitHub repo once lesson updates are on), downloads it in the background and
 * installs it when he leaves the app (never during a guided session). On Android 12+ that needs no tap once
 * "Install unknown apps" is allowed for Wellness. Android only installs it if it's signed with the same key.
 */
final class Updater {
    static final String PREFS = "update";
    static final String GITHUB = "https://raw.githubusercontent.com/braedenruff2/wellness/main/dist/";
    private static final long CHECK_EVERY_MS = 30 * 60 * 1000L;
    static volatile boolean busy;

    interface Listener { void onUpdateState(); }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static long installedCode(Context c) {
        try {
            PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
        } catch (Exception e) { return 0; }
    }
    static String installedName(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }

    /** The downloaded version waiting to be installed (0 if none). */
    static int readyCode(Context c) {
        int code = prefs(c).getInt("readyCode", 0);
        if (code <= installedCode(c) || !apk(c, code).exists()) return 0;
        return code;
    }
    static File apk(Context c, int code) { return new File(c.getCacheDir(), "update-" + code + ".apk"); }
    static boolean mayInstall(Context c) { return Build.VERSION.SDK_INT < 26 || c.getPackageManager().canRequestPackageInstalls(); }

    /** For the page: {"version","code","ready","readyName","allowed","checked","error","from"}. */
    static String status(Context c) {
        SharedPreferences p = prefs(c);
        int r = readyCode(c);
        return "{\"version\":" + PcLink.quote(installedName(c)) + ",\"code\":" + installedCode(c) + ",\"ready\":" + (r > 0)
            + ",\"readyName\":" + PcLink.quote(r > 0 ? p.getString("readyName", "") : "") + ",\"allowed\":" + mayInstall(c)
            + ",\"busy\":" + busy + ",\"checked\":" + p.getLong("checked", 0) + ",\"error\":" + PcLink.quote(p.getString("error", ""))
            + ",\"from\":" + PcLink.quote(p.getString("from", "")) + "}";
    }

    /** {code, name} from a version.json; null if it isn't one. */
    static long[] parseCode(String json) {
        try { long code = Long.parseLong(PcLink.num(json, "code")); return code > 0 ? new long[]{code} : null; }
        catch (NumberFormatException e) { return null; }
    }

    /** Looks for a newer version and downloads it. Off the main thread; quiet on failure. pc: the PC link, or null. */
    static void check(final Context app, final PcLink pc, boolean force, final Listener l) {
        final SharedPreferences p = prefs(app);
        if (busy || (!force && System.currentTimeMillis() - p.getLong("checked", 0) < CHECK_EVERY_MS)) { if (l != null && !busy) l.onUpdateState(); return; }
        busy = true;
        new Thread(() -> {
            String err = "";
            try {
                // the PC first (newest, and works without GitHub), then GitHub
                String[] errs = new String[2];
                if (pc != null) try { if (tryFrom(app, pc, null)) return; } catch (Exception e) { errs[0] = "PC: " + e.getMessage(); }
                try { if (tryFrom(app, null, GITHUB)) return; } catch (Exception e) { errs[1] = "GitHub: " + e.getMessage(); }
                if (errs[0] != null && errs[1] != null) err = errs[0] + "; " + errs[1];
            } finally {
                p.edit().putLong("checked", System.currentTimeMillis()).putString("error", err).apply();
                busy = false;
                if (l != null) l.onUpdateState();
            }
        }, "wl-update").start();
    }

    /** True when that source answered (newer version downloaded, or nothing newer there). */
    private static boolean tryFrom(Context app, PcLink pc, String base) throws IOException {
        String v = pc != null ? pc.get("/v1/app/version", 8000) : text(base + "version.json");
        long[] code = parseCode(v);
        if (code == null) throw new IOException("no version information");
        String name = PcLink.str(v, "name");
        SharedPreferences p = prefs(app);
        if (code[0] <= installedCode(app)) { p.edit().putString("from", pc != null ? "pc" : "github").apply(); return pc != null; }
        if (p.getInt("failed:" + code[0], 0) >= 3) return true;           // failed to install 3 times: wait for a newer one
        File f = apk(app, (int) code[0]), part = new File(f.getPath() + ".part");
        try (OutputStream out = new FileOutputStream(part)) {
            if (pc != null) pc.download("/v1/app/apk", out, 120000); else download(base + "Wellness.apk", out);
        }
        PackageInfo pi = app.getPackageManager().getPackageArchiveInfo(part.getPath(), 0);
        if (pi == null || !app.getPackageName().equals(pi.packageName)) { part.delete(); throw new IOException("the downloaded update didn't check out"); }
        if (!part.renameTo(f)) throw new IOException("couldn't keep the download");
        cleanOld(app, (int) code[0]);
        p.edit().putInt("readyCode", (int) code[0]).putString("readyName", name == null ? String.valueOf(code[0]) : name)
            .putString("from", pc != null ? "pc" : "github").apply();
        return true;
    }

    static String text(String url) throws IOException {
        ByteArrayOut b = new ByteArrayOut();
        download(url + "?t=" + System.currentTimeMillis() / 60000, b);   // (GitHub caches raw files for a few minutes)
        return b.toString("UTF-8");
    }
    static final class ByteArrayOut extends java.io.ByteArrayOutputStream { }

    static void download(String url, OutputStream out) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000); c.setReadTimeout(30000);
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            try (InputStream in = c.getInputStream()) { byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n); }
        } finally { c.disconnect(); }
    }

    private static void cleanOld(Context c, int keep) {
        File[] fs = c.getCacheDir().listFiles();
        if (fs == null) return;
        for (File f : fs) if (f.getName().startsWith("update-") && !f.getName().equals("update-" + keep + ".apk")) f.delete();
    }

    /** Hands the downloaded APK to Android. The app closes and restarts as part of it. */
    static synchronized boolean install(Context c) {
        int code = readyCode(c);
        if (code == 0 || !mayInstall(c)) return false;
        File f = apk(c, code);
        try {
            PackageInstaller pi = c.getPackageManager().getPackageInstaller();
            for (PackageInstaller.SessionInfo si : pi.getMySessions()) try { pi.abandonSession(si.getSessionId()); } catch (Throwable ignored) { }
            PackageInstaller.SessionParams sp = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            sp.setAppPackageName(c.getPackageName());
            sp.setSize(f.length());
            if (Build.VERSION.SDK_INT >= 31) sp.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            int id = pi.createSession(sp);
            boolean sent = false;
            try (PackageInstaller.Session s = pi.openSession(id)) {
                try (InputStream in = new FileInputStream(f); OutputStream out = s.openWrite("Wellness.apk", 0, f.length())) {
                    byte[] buf = new byte[1 << 16]; int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    s.fsync(out);
                }
                Intent done = new Intent(c, Result.class);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                s.commit(PendingIntent.getBroadcast(c, id, done, flags).getIntentSender());
                sent = true;
            } finally {
                if (!sent) try { pi.abandonSession(id); } catch (Throwable ignored) { }
            }
            prefs(c).edit().putString("error", "").apply();
            return true;
        } catch (Throwable t) {
            prefs(c).edit().putString("error", "install: " + t.getMessage()).apply();
            return false;
        }
    }

    /** Android reports back here on how the install went. */
    public static final class Result extends BroadcastReceiver {
        @Override public void onReceive(Context c, Intent i) {
            int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    try { c.startActivity(confirm); } catch (Throwable ignored) { }
                }
            } else if (st != PackageInstaller.STATUS_SUCCESS) {
                String msg = i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                prefs(c).edit().putString("error", "install: " + (msg == null ? "status " + st : msg)).apply();
                if (st != PackageInstaller.STATUS_FAILURE_ABORTED) {
                    int code = readyCode(c);
                    if (code > 0) { apk(c, code).delete(); prefs(c).edit().putInt("failed:" + code, prefs(c).getInt("failed:" + code, 0) + 1).apply(); }
                }
            }
        }
    }

    /** Runs in the new version right after an update: a quiet notice with a tap to open. */
    public static final class Replaced extends BroadcastReceiver {
        @Override public void onReceive(Context c, Intent i) {
            if (!Intent.ACTION_MY_PACKAGE_REPLACED.equals(i.getAction())) return;
            prefs(c).edit().remove("readyCode").remove("readyName").putString("error", "").apply();
            cleanOld(c, -1);
            try {
                NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
                if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel("updates", "App updates", NotificationManager.IMPORTANCE_LOW));
                Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                PendingIntent pi = PendingIntent.getActivity(c, 7, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, "updates") : new Notification.Builder(c);
                nm.notify(7, b.setSmallIcon(R.drawable.ic_note).setContentTitle("Wellness updated")
                    .setContentText("Now on version " + installedName(c) + ". Tap to open.").setContentIntent(pi).setAutoCancel(true).build());
            } catch (Throwable ignored) { }
        }
    }
}
