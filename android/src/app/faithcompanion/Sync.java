package app.faithcompanion;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Google Drive sync through Android's Storage Access Framework (ACTION_CREATE_DOCUMENT):
 * once the user picks a folder (creating wellness-sync.json), the app keeps persistable read/write
 * permission on that document URI and reads/writes JSON backups + request queue / cloud answers.
 * Pure helpers (throttle, stream I/O, status JSON, friendly errors) stay free of Android runtime calls
 * so they are unit-tested on plain JVM (tests/java/.../SyncTest.java).
 */
final class Sync {
    static final String PREFS = "drive_sync";
    static final String DEFAULT_NAME = "wellness-sync.json";
    static final String MIME = "application/json";
    static final int MAX_READ_BYTES = 16 * 1024 * 1024;
    static final long AUTO_EVERY_MS = 30 * 60 * 1000L;
    static volatile boolean busy;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Intent for Android's document picker: creates wellness-sync.json in the folder he chooses (e.g. Google Drive). */
    static Intent pickIntent() {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(MIME);
        i.putExtra(Intent.EXTRA_TITLE, DEFAULT_NAME);
        return i;
    }

    /** True when an automatic sync (app open / background) is due (at most once every 30 minutes). */
    static boolean shouldAutoSync(long lastMs, long nowMs) {
        return lastMs <= 0 || nowMs < lastMs || nowMs - lastMs >= AUTO_EVERY_MS;
    }

    /** Clean display name for the chosen sync file. */
    static String cleanName(String name) {
        if (name == null) return DEFAULT_NAME;
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < name.length() && b.length() < 120; i++) {
            char ch = name.charAt(i);
            if (ch >= 32 && ch != 127) b.append(ch);
        }
        String s = b.toString().trim();
        return s.isEmpty() ? DEFAULT_NAME : s;
    }

    /** JSON status passed to the WebView page. */
    static String statusJson(boolean configured, String name, long lastSync, String error, boolean isBusy) {
        return "{\"configured\":" + configured
            + ",\"name\":" + PcLink.quote(configured ? cleanName(name) : "")
            + ",\"lastSync\":" + Math.max(0L, lastSync)
            + ",\"error\":" + PcLink.quote(error == null ? "" : error)
            + ",\"busy\":" + isBusy + "}";
    }

    /** Plain, honest error message for the user (calls out write refusal and lost permissions clearly). */
    static String friendlyError(Throwable t, boolean writing) {
        if (t == null) return writing ? "Could not write to the sync file." : "Could not read the sync file.";
        if (t instanceof SecurityException) {
            return writing
                ? "Google Drive refused permission to write this file. Tap Change file to pick it again."
                : "Google Drive refused permission to read this file. Tap Change file to pick it again.";
        }
        if (t instanceof UnsupportedOperationException) {
            return "Google Drive's provider refused writes to this file. Try picking Google Drive directly or another folder.";
        }
        if (t instanceof FileNotFoundException) {
            return "The sync file was not found (it may have been moved or deleted). Tap Change file to pick a new one.";
        }
        String raw = t.getMessage() == null ? "" : t.getMessage().trim();
        if (raw.length() > 180) raw = raw.substring(0, 180);
        String low = raw.toLowerCase(java.util.Locale.ROOT);
        if (writing && (low.contains("read-only") || low.contains("readonly") || low.contains("not writable")
                || low.contains("permission") || low.contains("denied") || low.contains("refus")
                || low.contains("unsupported") || low.contains("erofs"))) {
            return "Google Drive's provider refused writes to this file" + (raw.isEmpty() ? "." : " (" + raw + ").")
                + " Try picking Google Drive directly or another folder.";
        }
        if (!writing && (low.contains("permission") || low.contains("denied"))) {
            return "Google Drive refused access to this file" + (raw.isEmpty() ? "." : " (" + raw + ").")
                + " Tap Change file to pick it again.";
        }
        String prefix = writing ? "Could not write to the sync file" : "Could not read the sync file";
        return raw.isEmpty() ? prefix + "." : prefix + ": " + raw;
    }

    /** Reads a UTF-8 stream with a size cap so a huge file can't run the app out of memory. */
    static String readStream(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int total = 0, n;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > maxBytes) throw new IOException("sync file is too large");
            out.write(buf, 0, n);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    /** Writes UTF-8 text to out and flushes. */
    static void writeStream(OutputStream out, String text) throws IOException {
        byte[] b = (text == null ? "" : text).getBytes(StandardCharsets.UTF_8);
        out.write(b);
        out.flush();
    }

    /** Saves a newly picked SAF document URI and takes persistable read/write permission. Returns "" on success, else error. */
    static String savePicked(Context c, Uri uri, int intentFlags) {
        int rw = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        if (intentFlags != 0 && (intentFlags & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == 0) {
            String err = "This provider did not grant write permission for the sync file. Try picking Google Drive directly or another folder.";
            prefs(c).edit().putString("error", err).apply();
            return err;
        }
        int take = (intentFlags & rw) != 0 ? (intentFlags & rw) : rw;
        try {
            c.getContentResolver().takePersistableUriPermission(uri, take);
        } catch (SecurityException e) {
            String err = "This provider did not allow lasting write access to the sync file. Try picking Google Drive directly or another folder.";
            prefs(c).edit().putString("error", err).apply();
            return err;
        }
        String old = prefs(c).getString("uri", null);
        if (old != null && !old.equals(uri.toString())) {
            try { c.getContentResolver().releasePersistableUriPermission(Uri.parse(old), rw); } catch (Exception ignored) { }
        }
        String name = DEFAULT_NAME;
        try (Cursor cur = c.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cur != null && cur.moveToFirst() && cur.getString(0) != null) name = cleanName(cur.getString(0));
        } catch (Exception ignored) { }
        prefs(c).edit().putString("uri", uri.toString()).putString("name", name).putString("error", "").apply();
        return "";
    }

    /** Clears the saved sync file and releases its persistable permission. */
    static void forget(Context c) {
        SharedPreferences p = prefs(c);
        String old = p.getString("uri", null);
        if (old != null) {
            int rw = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            try { c.getContentResolver().releasePersistableUriPermission(Uri.parse(old), rw); } catch (Exception ignored) { }
        }
        p.edit().clear().apply();
    }

    static void setError(Context c, String err) {
        prefs(c).edit().putString("error", err == null ? "" : err).apply();
    }

    static String status(Context c) {
        SharedPreferences p = prefs(c);
        String uri = p.getString("uri", null);
        return statusJson(uri != null && !uri.isEmpty(), p.getString("name", DEFAULT_NAME), p.getLong("lastSync", 0L), p.getString("error", ""), busy);
    }

    private static Uri savedUri(Context c) {
        String s = prefs(c).getString("uri", null);
        return s == null || s.isEmpty() ? null : Uri.parse(s);
    }

    /** Reads the whole sync file as UTF-8 text (empty string if the file is brand new / 0 bytes). */
    static String read(Context c) throws IOException {
        Uri u = savedUri(c);
        if (u == null) throw new IOException("No sync file chosen.");
        busy = true;
        try {
            InputStream in = c.getContentResolver().openInputStream(u);
            if (in == null) throw new IOException("could not open sync file");
            try (InputStream s = in) {
                return readStream(s, MAX_READ_BYTES);
            }
        } catch (Throwable t) {
            String msg = friendlyError(t, false);
            prefs(c).edit().putString("error", msg).apply();
            throw new IOException(msg, t);
        } finally {
            busy = false;
        }
    }

    /** Truncates and writes UTF-8 text to the sync file. Records lastSync on success, friendly error on failure. */
    static void write(Context c, String text) throws IOException {
        Uri u = savedUri(c);
        if (u == null) throw new IOException("No sync file chosen.");
        busy = true;
        try {
            ContentResolver cr = c.getContentResolver();
            OutputStream out;
            try {
                out = cr.openOutputStream(u, "wt");
            } catch (IllegalArgumentException e) {
                // Some providers reject mode "wt"; fall back to rw + channel truncate(0)
                ParcelFileDescriptor pfd = cr.openFileDescriptor(u, "rw");
                if (pfd == null) throw new UnsupportedOperationException("provider refused write stream");
                try (ParcelFileDescriptor fd = pfd; FileOutputStream fos = new FileOutputStream(fd.getFileDescriptor())) {
                    fos.getChannel().truncate(0);
                    writeStream(fos, text);
                }
                prefs(c).edit().putLong("lastSync", System.currentTimeMillis()).putString("error", "").apply();
                return;
            }
            if (out == null) throw new UnsupportedOperationException("provider refused write stream");
            try (OutputStream o = out) {
                writeStream(o, text);
            }
            prefs(c).edit().putLong("lastSync", System.currentTimeMillis()).putString("error", "").apply();
        } catch (Throwable t) {
            String msg = friendlyError(t, true);
            prefs(c).edit().putString("error", msg).apply();
            throw new IOException(msg, t);
        } finally {
            busy = false;
        }
    }
}
