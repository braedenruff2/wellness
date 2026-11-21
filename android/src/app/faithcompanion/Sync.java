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

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

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
    /** Google Drive exports a Google Sheet (a virtual document) as Office/PDF types, not CSV; XLSX is read directly. */
    static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
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

    /** Intent to pick an existing wellness-sync.json backup from Google Drive to restore (works on a new phone). */
    static Intent pickRestoreIntent() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
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
            return "Google Drive refused permission to read the answers sheet. Tap Change answers sheet to pick it again.";
        }
        if (t instanceof UnsupportedOperationException) {
            return "Google Drive refused to export the answers sheet as CSV. Try picking it again or use a different file.";
        }
        if (t instanceof FileNotFoundException) {
            return "The answers sheet could not be opened (it may have been moved, deleted, or Drive refused CSV export). Tap Change answers sheet to pick it again.";
        }
        String raw = t.getMessage() == null ? "" : t.getMessage().trim();
        if (raw.startsWith("Google Drive") || raw.startsWith("This file")) return raw.length() > 400 ? raw.substring(0, 400) : raw;
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
                + " Tap Change answers sheet to pick it again.";
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

        return rowsJson(parseCsv(s));
    }

    /** Sheet rows (id | task | answer-json | at; a header row is skipped) as the {"rows":[...]} JSON lib/sync-core.js reads. */
    static String rowsJson(List<List<String>> rows) {
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

    /** Reads a stream fully with a size cap. */
    static byte[] readBytes(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int total = 0, n;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > maxBytes) throw new IOException("the answers sheet is too large");
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    /** The first worksheet of an .xlsx file (what Google Drive exports a Google Sheet as) as rows of cell text:
     *  shared strings, inline strings, formula strings and numbers; empty cells keep their column. */
    static List<List<String>> parseXlsx(byte[] data) throws IOException {
        Map<String, byte[]> parts = new HashMap<>();
        try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(data))) {
            ZipEntry e; int total = 0;
            while ((e = z.getNextEntry()) != null) {
                String name = e.getName();
                if (e.isDirectory() || !name.startsWith("xl/")) continue;
                if (!(name.equals("xl/sharedStrings.xml") || name.equals("xl/workbook.xml") || name.equals("xl/_rels/workbook.xml.rels")
                        || name.startsWith("xl/worksheets/sheet"))) continue;
                byte[] b = readBytes(z, MAX_READ_BYTES);
                total += b.length;
                if (total > 4 * MAX_READ_BYTES) throw new IOException("the answers sheet is too large");
                parts.put(name, b);
            }
        }
        String sheet = firstSheet(parts);
        if (sheet == null) throw new IOException("This file could not be read as a spreadsheet (no worksheet in it).");
        List<String> shared = new ArrayList<>();
        if (parts.containsKey("xl/sharedStrings.xml")) {
            NodeList si = xml(parts.get("xl/sharedStrings.xml")).getElementsByTagNameNS("*", "si");
            for (int i = 0; i < si.getLength(); i++) shared.add(text((Element) si.item(i)));
        }
        List<List<String>> rows = new ArrayList<>();
        NodeList rs = xml(parts.get(sheet)).getElementsByTagNameNS("*", "row");
        for (int i = 0; i < rs.getLength(); i++) {
            List<String> row = new ArrayList<>();
            NodeList cs = ((Element) rs.item(i)).getElementsByTagNameNS("*", "c");
            for (int k = 0; k < cs.getLength(); k++) {
                Element c = (Element) cs.item(k);
                int col = column(c.getAttribute("r"));
                if (col < 0) col = row.size();
                if (col > 50) continue;
                while (row.size() < col) row.add("");
                String t = c.getAttribute("t"), v = child(c, "v"), val;
                if ("s".equals(t)) {
                    int idx = -1; try { idx = Integer.parseInt(v.trim()); } catch (NumberFormatException ignored) { }
                    val = idx >= 0 && idx < shared.size() ? shared.get(idx) : "";
                } else if ("inlineStr".equals(t)) {
                    NodeList is = c.getElementsByTagNameNS("*", "is");
                    val = is.getLength() > 0 ? text((Element) is.item(0)) : "";
                } else val = v;
                if (row.size() == col) row.add(val); else row.set(col, val);
            }
            boolean any = false; for (String x : row) if (!x.isEmpty()) { any = true; break; }
            if (any) rows.add(row);
        }
        return rows;
    }

    /** The worksheet the workbook lists first (its rels target), else the lowest-numbered sheetN.xml. */
    private static String firstSheet(Map<String, byte[]> parts) {
        try {
            if (parts.containsKey("xl/workbook.xml") && parts.containsKey("xl/_rels/workbook.xml.rels")) {
                NodeList sh = xml(parts.get("xl/workbook.xml")).getElementsByTagNameNS("*", "sheet");
                if (sh.getLength() > 0) {
                    Element first = (Element) sh.item(0);
                    String rid = first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
                    NodeList rel = xml(parts.get("xl/_rels/workbook.xml.rels")).getElementsByTagNameNS("*", "Relationship");
                    for (int i = 0; i < rel.getLength(); i++) {
                        Element r = (Element) rel.item(i);
                        if (!rid.isEmpty() && rid.equals(r.getAttribute("Id"))) {
                            String target = r.getAttribute("Target");
                            String path = target.startsWith("/") ? target.substring(1) : "xl/" + target;
                            if (parts.containsKey(path)) return path;
                        }
                    }
                }
            }
        } catch (IOException ignored) { }
        String best = null; int bestN = Integer.MAX_VALUE;
        for (String k : parts.keySet()) {
            if (!k.startsWith("xl/worksheets/sheet") || !k.endsWith(".xml")) continue;
            int n; try { n = Integer.parseInt(k.substring("xl/worksheets/sheet".length(), k.length() - 4)); } catch (NumberFormatException e) { n = Integer.MAX_VALUE - 1; }
            if (n < bestN) { bestN = n; best = k; }
        }
        return best;
    }

    private static Document xml(byte[] b) throws IOException {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setNamespaceAware(true);
            f.setExpandEntityReferences(false);
            try { f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true); } catch (Exception ignored) { }
            DocumentBuilder d = f.newDocumentBuilder();
            return d.parse(new ByteArrayInputStream(b));
        } catch (Exception e) {
            throw new IOException("This file could not be read as a spreadsheet.", e);
        }
    }

    /** All <t> text under an element, except phonetic runs (<rPh>). */
    private static String text(Element e) {
        StringBuilder b = new StringBuilder();
        NodeList ts = e.getElementsByTagNameNS("*", "t");
        for (int i = 0; i < ts.getLength(); i++) {
            Node n = ts.item(i), p = n.getParentNode();
            boolean phonetic = false;
            while (p != null && p != e) { if ("rPh".equals(p.getLocalName())) { phonetic = true; break; } p = p.getParentNode(); }
            if (!phonetic) b.append(n.getTextContent());
        }
        return b.toString();
    }

    private static String child(Element e, String local) {
        NodeList n = e.getElementsByTagNameNS("*", local);
        return n.getLength() > 0 ? n.item(0).getTextContent() : "";
    }

    /** "C12" -> 2 (0-based column); -1 when there is no reference. */
    static int column(String ref) {
        if (ref == null) return -1;
        int col = 0, i = 0;
        while (i < ref.length() && Character.isLetter(ref.charAt(i))) { col = col * 26 + (Character.toUpperCase(ref.charAt(i)) - 'A' + 1); i++; }
        return i == 0 ? -1 : col - 1;
    }

    /** Writes UTF-8 text to out and flushes. */
    static void writeStream(OutputStream out, String text) throws IOException {
        byte[] b = (text == null ? "" : text).getBytes(StandardCharsets.UTF_8);
        out.write(b);
        out.flush();
    }

    /** Queries a SAF document's display name, cleaned with a fallback. */
    static String displayName(Context c, Uri uri, String fallback) {
        String name = fallback;
        try (Cursor cur = c.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cur != null && cur.moveToFirst() && cur.getString(0) != null) name = cleanName(cur.getString(0), fallback);
        } catch (Exception ignored) { }
        return name;
    }

    /** Reads any picked SAF document URI as UTF-8 text without touching saved sync settings (used for Restore from Drive). */
    static String readUri(Context c, Uri u) throws IOException {
        if (u == null) throw new IOException("No file chosen.");
        try {
            InputStream in = c.getContentResolver().openInputStream(u);
            if (in == null) throw new IOException("could not open file");
            try (InputStream s = in) {
                return readStream(s, MAX_READ_BYTES);
            }
        } catch (Throwable t) {
            throw new IOException(friendlyError(t, false), t);
        }
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
        String name = displayName(c, uri, DEFAULT_NAME);
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
        String name = displayName(c, uri, DEFAULT_ANSWERS_NAME);
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
            String out = readAnswersStream(cr, u);
            prefs(c).edit().putString("answersError", "").apply();
            return out;
        } catch (Throwable t) {
            String msg = friendlyAnswersError(t);
            prefs(c).edit().putString("answersError", msg).apply();
            throw new IOException(msg, t);
        }
    }

    /** Order to try a document's export types in: text (CSV, JSON, plain) first, then XLSX. */
    static List<String> answersTypes(String[] offered) {
        Set<String> out = new LinkedHashSet<>();
        String text = chooseAnswersMime(offered);
        if (text != null) out.add(text);
        if (offered != null) for (String t : offered) if (t != null && XLSX.equalsIgnoreCase(t.trim())) out.add(XLSX);
        return new ArrayList<>(out);
    }

    /** One export of the sheet as {"rows":[...]} (or JSON passed through). */
    static String answersFromExport(String mime, byte[] data) throws IOException {
        if (XLSX.equalsIgnoreCase(mime) || (data.length > 3 && data[0] == 'P' && data[1] == 'K' && data[2] == 3 && data[3] == 4)) {
            return rowsJson(parseXlsx(data));
        }
        return answersFromCsv(new String(data, StandardCharsets.UTF_8));
    }

    /** Reads the answers sheet: a Google Sheet is a virtual document Drive exports (as XLSX/PDF, CSV only sometimes),
     *  a plain CSV/JSON file opens directly. When nothing works, the error names what Drive offered. */
    private static String readAnswersStream(ContentResolver cr, Uri u) throws IOException {
        String[] offered = null;
        try { offered = cr.getStreamTypes(u, "*/*"); } catch (Exception ignored) { }
        List<String> tries = answersTypes(offered);
        if (tries.isEmpty()) tries.add("text/csv"); // some providers export CSV without listing it
        Throwable last = null;
        for (String mime : tries) {
            try (AssetFileDescriptor afd = cr.openTypedAssetFileDescriptor(u, mime, null)) {
                if (afd != null) {
                    try (InputStream in = afd.createInputStream()) {
                        return answersFromExport(mime, readBytes(in, MAX_READ_BYTES));
                    }
                }
            } catch (FileNotFoundException | UnsupportedOperationException | IllegalArgumentException | SecurityException e) {
                last = e;
            } catch (IOException e) {
                last = e;
            }
        }
        try (InputStream in = cr.openInputStream(u)) {
            if (in != null) return answersFromExport("", readBytes(in, MAX_READ_BYTES));
        } catch (Exception e) {
            if (last == null) last = e;
        }
        throw new IOException(exportError(offered, last), last);
    }

    /** The message when no export of the answers sheet could be read: plain, with what Drive offered (to fix it). */
    static String exportError(String[] offered, Throwable last) {
        StringBuilder types = new StringBuilder();
        if (offered != null) for (String t : offered) if (t != null && types.length() < 200) types.append(types.length() > 0 ? ", " : "").append(t.trim());
        String why = last instanceof SecurityException ? "Google Drive refused permission to read the answers sheet."
            : "Google Drive wouldn't give the answers sheet in a form the app can read.";
        return why + " Drive offered: " + (types.length() > 0 ? types : "nothing") + ". Tap Change answers sheet to pick it again.";
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
