package app.faithcompanion;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;

import java.util.ArrayList;
import java.util.List;

/**
 * Tracks temporary MediaStore rows created for the Cooking fridge-photo camera chooser
 * (wellness-fridge-<ms>.jpg) so they are deleted once the page has read the image, and any empty
 * rows left behind by a process death mid-capture are cleaned up on the next app launch.
 * Pure helpers stay free of Android runtime calls so FridgePhotoTest runs on plain JVM.
 */
final class FridgePhoto {
    static final String PREFIX = "wellness-fridge-";
    static final String SUFFIX = ".jpg";
    static final String PREFS = "fridge_photo";
    static final String KEY_PENDING = "pending_uris";
    static final int MAX_TRACKED = 20;

    static String makeDisplayName(long nowMs) {
        return PREFIX + Math.max(0L, nowMs) + SUFFIX;
    }

    /** True only for display names created by this app: wellness-fridge-<digits>.jpg. */
    static boolean isOwnPhotoName(String name) {
        if (name == null || !name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) return false;
        int start = PREFIX.length(), end = name.length() - SUFFIX.length();
        if (end <= start) return false;
        for (int i = start; i < end; i++) {
            char c = name.charAt(i);
            if (c < '0' || c > '9') return false;
        }
        return true;
    }

    /** Parses the creation timestamp from an own photo display name, or -1 if invalid. */
    static long timestampOf(String name) {
        if (!isOwnPhotoName(name)) return -1L;
        try { return Long.parseLong(name.substring(PREFIX.length(), name.length() - SUFFIX.length())); }
        catch (NumberFormatException e) { return -1L; }
    }

    static boolean isSafeTrackUri(String uri) {
        return uri != null && uri.startsWith("content://media/");
    }

    static List<String> parseTracked(String raw) {
        List<String> out = new ArrayList<>();
        if (raw == null || raw.isEmpty()) return out;
        for (String line : raw.split("\n")) {
            String s = line.trim();
            if (!s.isEmpty() && isSafeTrackUri(s) && !out.contains(s)) out.add(s);
        }
        return out;
    }

    static String joinTracked(List<String> list) {
        if (list == null || list.isEmpty()) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) b.append('\n');
            b.append(list.get(i));
        }
        return b.toString();
    }

    static List<String> addTracked(String raw, String uri) {
        List<String> out = parseTracked(raw);
        if (isSafeTrackUri(uri)) {
            out.remove(uri);
            out.add(uri);
            while (out.size() > MAX_TRACKED) out.remove(0);
        }
        return out;
    }

    static List<String> removeTracked(String raw, String uri) {
        List<String> out = parseTracked(raw);
        if (uri != null) out.remove(uri);
        return out;
    }

    static boolean shouldDeleteOnResult(String cameraUri, String returnedUri) {
        return cameraUri != null && !cameraUri.isEmpty() && !cameraUri.equals(returnedUri);
    }

    static boolean isOldEnough(String name, long nowMs, long minAgeMs) {
        if (!isOwnPhotoName(name)) return false;
        if (minAgeMs <= 0L) return true;
        long ts = timestampOf(name);
        return ts >= 0L && nowMs - ts >= minAgeMs;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Records a newly inserted camera MediaStore URI immediately so process death can't orphan it. */
    static Uri createTemp(Context c) {
        ContentValues cv = new ContentValues();
        cv.put(MediaStore.Images.Media.DISPLAY_NAME, makeDisplayName(System.currentTimeMillis()));
        cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        Uri u = c.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
        if (u != null) track(c, u);
        return u;
    }

    static synchronized void track(Context c, Uri uri) {
        if (uri == null) return;
        SharedPreferences p = prefs(c);
        List<String> next = addTracked(p.getString(KEY_PENDING, ""), uri.toString());
        p.edit().putString(KEY_PENDING, joinTracked(next)).apply();
    }

    static synchronized void untrack(Context c, Uri uri) {
        if (uri == null) return;
        SharedPreferences p = prefs(c);
        List<String> next = removeTracked(p.getString(KEY_PENDING, ""), uri.toString());
        p.edit().putString(KEY_PENDING, joinTracked(next)).apply();
    }

    /** Deletes all tracked camera rows (and any abandoned app-owned wellness-fridge-*.jpg rows)
     *  except keepUri (an in-flight capture). Safe to call on a background thread. */
    static synchronized int cleanup(Context c, Uri keepUri, long minAgeMs) {
        int deleted = 0;
        String keep = keepUri == null ? null : keepUri.toString();
        ContentResolver cr = c.getContentResolver();
        SharedPreferences p = prefs(c);
        List<String> tracked = parseTracked(p.getString(KEY_PENDING, ""));
        List<String> remaining = new ArrayList<>();
        for (String s : tracked) {
            if (s.equals(keep)) { remaining.add(s); continue; }
            try { deleted += cr.delete(Uri.parse(s), null, null); } catch (Exception ignored) { }
        }
        long now = System.currentTimeMillis();
        String[] proj = new String[]{MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME};
        String sel = MediaStore.Images.Media.DISPLAY_NAME + " LIKE ?";
        String[] args = new String[]{PREFIX + "%" + SUFFIX};
        try (Cursor cur = cr.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, proj, sel, args, null)) {
            if (cur != null) {
                while (cur.moveToNext()) {
                    long id = cur.getLong(0);
                    String name = cur.getString(1);
                    if (!isOldEnough(name, now, minAgeMs)) continue;
                    Uri row = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
                    if (row.toString().equals(keep)) continue;
                    try { deleted += cr.delete(row, null, null); } catch (Exception ignored) { }
                }
            }
        } catch (Exception ignored) { }
        p.edit().putString(KEY_PENDING, joinTracked(remaining)).apply();
        return deleted;
    }
}
