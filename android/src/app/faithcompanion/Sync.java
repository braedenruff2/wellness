package app.faithcompanion;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
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
import java.util.ArrayList;
import java.util.List;

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
    static final String DEFAULT_ANSWERS_NAME = "wellness-answers";
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

    /** Intent to pick the cloud answers Google Sheet (or CSV/JSON file). No CATEGORY_OPENABLE so virtual Sheets appear. */
    static Intent pickAnswersIntent() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.setType("*/*");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        return i;
    }

    /** Picks the best stream MIME type offered by Drive for a virtual Google Sheet (CSV first, then JSON/text). */
    static String chooseAnswersMime(String[] types) {
        if (types == null || types.length == 0) return null;
        String[] pref = { "text/csv", "text/comma-separated-values", "application/json", "text/plain" };
        for (String want : pref) {
            for (String t : types) {
                if (t != null && want.equalsIgnoreCase(t.trim())) return t.trim();
            }
        }
        for (String t : types) {
            if (t != null && t.trim().toLowerCase(java.util.Locale.ROOT).startsWith("text/")) return t.trim();
        }
        return null;
    }

    /** True when an automatic sync (app open / background) is due (at most once every 30 minutes). */
    static boolean shouldAutoSync(long lastMs, long nowMs) {
        return lastMs <= 0 || nowMs < lastMs || nowMs - lastMs >= AUTO_EVERY_MS;
    }

    /** Clean display name for a chosen sync file or answers sheet. */
    static String cleanName(String name) { return cleanName(name, DEFAULT_NAME); }

    static String cleanName(String name, String fallback) {
        if (name == null) return fallback;
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < name.length() && b.length() < 120; i++) {
            char ch = name.charAt(i);
            if (ch >= 32 && ch != 127) b.append(ch);
        }
        String s = b.toString().trim();
        return s.isEmpty() ? fallback : s;
    }

    /** JSON status passed to the WebView page. */
    static String statusJson(boolean configured, String name, long lastSync, String error, boolean isBusy) {
        return statusJson(configured, name, lastSync, error, isBusy, false, "", "");
    }

    static String statusJson(boolean configured, String name, long lastSync, String error, boolean isBusy,
                             boolean answersConfigured, String answersName, String answersError) {
        return "{\"configured\":" + configured
            + ",\"name\":" + PcLink.quote(configured ? cleanName(name, DEFAULT_NAME) : "")
            + ",\"lastSync\":" + Math.max(0L, lastSync)
            + ",\"error\":" + PcLink.quote(error == null ? "" : error)
            + ",\"busy\":" + isBusy
            + ",\"answersConfigured\":" + answersConfigured
            + ",\"answersName\":" + PcLink.quote(answersConfigured ? cleanName(answersName, DEFAULT_ANSWERS_NAME) : "")
            + ",\"answersError\":" + PcLink.quote(answersError == null ? "" : answersError) + "}";
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

    /** Plain error message for reading the cloud answers Google Sheet (virtual-file export failures called out clearly). */
    static String friendlyAnswersError(Throwable t) {
        if (t == null) return "Could not read the answers sheet.";
        if (t instanceof SecurityException) {
            return "Google Drive refused permission to read the answers sheet. Tap Change sheet to pick it again.";
        }
        if (t instanceof UnsupportedOperationException) {
            return "Google Drive refused to export the answers sheet as CSV. Try picking it again or use a different file.";
        }
        if (t instanceof FileNotFoundException) {
            return "The answers sheet could not be opened (it may have been moved, deleted, or Drive refused CSV export). Tap Change sheet to pick it again.";
        }
        String raw = t.getMessage() == null ? "" : t.getMessage().trim();
        if (raw.length() > 180) raw = raw.substring(0, 180);
        String low = raw.toLowerCase(java.util.Locale.ROOT);
        if (low.contains("virtual") || low.contains("not openable") || low.contains("cannot export")
                || low.contains("unsupported") || low.contains("csv")) {
            return raw.startsWith("Google Drive") || raw.startsWith("This file")
                ? raw
                : "Google Drive refused to export the answers sheet" + (raw.isEmpty() ? "." : " (" + raw + ").");
        }
        if (low.contains("permission") || low.contains("denied")) {
            return "Google Drive refused access to the answers sheet" + (raw.isEmpty() ? "." : " (" + raw + ").")
                + " Tap Change sheet to pick it again.";
        }
        return raw.isEmpty() ? "Could not read the answers sheet." : "Could not read the answers sheet: " + raw;
    }

    /** RFC-4180 CSV parser (handles quoted fields, doubled quotes, commas and newlines inside quotes, CRLF/LF/CR). */
    static List<List<String>> parseCsv(String text) {
        List<List<String>> rows = new ArrayList<>();
        if (text == null || text.isEmpty()) return rows;
        int start = text.charAt(0) == '\uFEFF' ? 1 : 0;
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean inQuotes = false;
        boolean hasContent = false;
        int len = text.length();
        for (int i = start; i < len; i++) {
            char c = text.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < len && text.charAt(i + 1) == '"') {
                        cell.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cell.append(c);
                }
            } else {
                if (c == '"' && cell.length() == 0) {
                    inQuotes = true;
                    hasContent = true;
                } else if (c == ',') {
                    row.add(cell.toString());
                    cell.setLength(0);
                    hasContent = true;
                } else if (c == '\r' || c == '\n') {
                    if (c == '\r' && i + 1 < len && text.charAt(i + 1) == '\n') i++;
                    if (hasContent || cell.length() > 0 || !row.isEmpty()) {
                        row.add(cell.toString());
                        rows.add(row);
                    }
                    row = new ArrayList<>();
                    cell.setLength(0);
                    hasContent = false;
                } else {
                    cell.append(c);
                    hasContent = true;
                }
            }
        }
        if (hasContent || cell.length() > 0 || !row.isEmpty()) {
            row.add(cell.toString());
            rows.add(row);
        }
        return rows;
    }

    /** Converts exported answers sheet CSV (rows: id | task | answer-json | at) into safe JSON {"rows":[...]} for JS.
     *  Passes JSON starting with '{' through as-is; rejects binary exports (e.g. XLSX/PDF) clearly. */
    static String answersFromCsv(String text) throws IOException {
        if (text == null) return "{\"rows\":[]}";
        if (text.indexOf('\0') >= 0 || text.startsWith("PK\u0003\u0004") || text.startsWith("%PDF-")) {
            throw new IOException("This file could not be read as CSV text (Google Drive may have refused CSV export).");
        }
        String s = text;
        if (!s.isEmpty() && s.charAt(0) == '\uFEFF') s = s.substring(1);
        String trimmed = s.trim();
        if (trimmed.isEmpty()) return "{\"rows\":[]}";
        if (trimmed.charAt(0) == '{') return trimmed;

        List<List<String>> rows = parseCsv(s);
        StringBuilder out = new StringBuilder("{\"rows\":[");
        boolean first = true;
        for (int i = 0; i < rows.size(); i++) {
            List<String> r = rows.get(i);
            if (r.size() < 3) continue;
            String id = r.get(0).trim();
            String task = r.get(1).trim();
            String raw = r.get(2).trim();
            String at = r.size() > 3 ? r.get(3).trim() : "";
            if (i == 0 && "id".equalsIgnoreCase(id) && "task".equalsIgnoreCase(task)) continue;
            if (id.isEmpty() || raw.isEmpty()) continue;
            if (!first) out.append(',');
            first = false;
            out.append("{\"id\":").append(PcLink.quote(id))
                .append(",\"task\":").append(PcLink.quote(task))
                .append(",\"raw\":").append(PcLink.quote(raw))
                .append(",\"at\":").append(PcLink.quote(at))
                .append('}');
        }
        return out.append("]}").toString();
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
            if (cur != null && cur.moveToFirst() && cur.getString(0) != null) name = cleanName(cur.getString(0), DEFAULT_NAME);
        } catch (Exception ignored) { }
        prefs(c).edit().putString("uri", uri.toString()).putString("name", name).putString("error", "").apply();
        return "";
    }

    /** Saves a newly picked answers Google Sheet (or CSV/JSON) URI with persistable read permission. Returns "" on success, else error. */
    static String savePickedAnswers(Context c, Uri uri, int intentFlags) {
        try {
            c.getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException e) {
            String err = "Google Drive did not allow lasting read access to that answers sheet. Try picking it again from Google Drive.";
            prefs(c).edit().putString("answersError", err).apply();
            return err;
        }
        String old = prefs(c).getString("answersUri", null);
        if (old != null && !old.equals(uri.toString())) {
            try { c.getContentResolver().releasePersistableUriPermission(Uri.parse(old), Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { }
        }
        String name = DEFAULT_ANSWERS_NAME;
        try (Cursor cur = c.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cur != null && cur.moveToFirst() && cur.getString(0) != null) name = cleanName(cur.getString(0), DEFAULT_ANSWERS_NAME);
        } catch (Exception ignored) { }
        prefs(c).edit().putString("answersUri", uri.toString()).putString("answersName", name).putString("answersError", "").apply();
        return "";
    }

    /** Clears the saved answers sheet URI and releases its persistable read permission. */
    static void forgetAnswers(Context c) {
        SharedPreferences p = prefs(c);
        String old = p.getString("answersUri", null);
        if (old != null) {
            try { c.getContentResolver().releasePersistableUriPermission(Uri.parse(old), Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { }
        }
        p.edit().remove("answersUri").remove("answersName").remove("answersError").apply();
    }

    /** Clears the saved sync file (and answers sheet) and releases persistable permissions. */
    static void forget(Context c) {
        SharedPreferences p = prefs(c);
        String old = p.getString("uri", null);
        if (old != null) {
            int rw = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            try { c.getContentResolver().releasePersistableUriPermission(Uri.parse(old), rw); } catch (Exception ignored) { }
        }
        String oldAns = p.getString("answersUri", null);
        if (oldAns != null) {
            try { c.getContentResolver().releasePersistableUriPermission(Uri.parse(oldAns), Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { }
        }
        p.edit().clear().apply();
    }

    static void setError(Context c, String err) {
        prefs(c).edit().putString("error", err == null ? "" : err).apply();
    }

    static void setAnswersError(Context c, String err) {
        prefs(c).edit().putString("answersError", err == null ? "" : err).apply();
    }

    static String status(Context c) {
        SharedPreferences p = prefs(c);
        String uri = p.getString("uri", null);
        String aUri = p.getString("answersUri", null);
        return statusJson(uri != null && !uri.isEmpty(), p.getString("name", DEFAULT_NAME),
            p.getLong("lastSync", 0L), p.getString("error", ""), busy,
            aUri != null && !aUri.isEmpty(), p.getString("answersName", DEFAULT_ANSWERS_NAME),
            p.getString("answersError", ""));
    }

    private static Uri savedUri(Context c) {
        String s = prefs(c).getString("uri", null);
        return s == null || s.isEmpty() ? null : Uri.parse(s);
    }

    private static Uri savedAnswersUri(Context c) {
        String s = prefs(c).getString("answersUri", null);
        return s == null || s.isEmpty() ? null : Uri.parse(s);
    }

    /** Reads the cloud answers Google Sheet (virtual-file export via getStreamTypes + openTypedAssetFileDescriptor,
     *  falling back to openInputStream for regular CSV/JSON files) and returns normalized JSON {"rows":[...]} or JSON. */
    static String readAnswers(Context c) throws IOException {
        Uri u = savedAnswersUri(c);
        if (u == null) throw new IOException("No answers sheet chosen.");
        ContentResolver cr = c.getContentResolver();
        try {
            String raw = readAnswersStream(cr, u);
            String out = answersFromCsv(raw);
            prefs(c).edit().putString("answersError", "").apply();
            return out;
        } catch (Throwable t) {
            String msg = friendlyAnswersError(t);
            prefs(c).edit().putString("answersError", msg).apply();
            throw new IOException(msg, t);
        }
    }

    private static String readAnswersStream(ContentResolver cr, Uri u) throws IOException {
        String mime = chooseAnswersMime(cr.getStreamTypes(u, "text/csv"));
        if (mime == null) mime = chooseAnswersMime(cr.getStreamTypes(u, "*/*"));
        Throwable typedErr = null;
        if (mime != null) {
            try (AssetFileDescriptor afd = cr.openTypedAssetFileDescriptor(u, mime, null)) {
                if (afd != null) {
                    try (InputStream in = afd.createInputStream()) {
                        return readStream(in, MAX_READ_BYTES);
                    }
                }
            } catch (FileNotFoundException | UnsupportedOperationException | IllegalArgumentException e) {
                typedErr = e;
            }
        } else {
            // Some Drive providers still export text/csv even when getStreamTypes returns null
            try (AssetFileDescriptor afd = cr.openTypedAssetFileDescriptor(u, "text/csv", null)) {
                if (afd != null) {
                    try (InputStream in = afd.createInputStream()) {
                        return readStream(in, MAX_READ_BYTES);
                    }
                }
            } catch (FileNotFoundException | UnsupportedOperationException | IllegalArgumentException e) {
                typedErr = e;
            }
        }
        try {
            InputStream in = cr.openInputStream(u);
            if (in != null) {
                try (InputStream s = in) {
                    return readStream(s, MAX_READ_BYTES);
                }
            }
        } catch (Throwable t) {
            if (typedErr != null) throw new IOException(friendlyAnswersError(typedErr), typedErr);
            throw t;
        }
        if (typedErr != null) throw new IOException(friendlyAnswersError(typedErr), typedErr);
        throw new UnsupportedOperationException("Google Drive refused to export this answers sheet as CSV.");
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
