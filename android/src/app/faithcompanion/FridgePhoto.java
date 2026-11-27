package app.faithcompanion;

import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.IOException;

/**
 * Manages temporary app-private files (<cacheDir>/fridge-photos/wellness-fridge-<ms>.jpg) for the
 * Cooking fridge-photo camera chooser, served through FridgePhotoProvider so camera captures stay
 * completely out of the user's public Pictures gallery and the app never deletes from MediaStore.
 * Pure helpers avoid Android runtime calls so FridgePhotoTest runs on plain JVM against android.jar.
 */
final class FridgePhoto {
    static final String AUTHORITY = "app.faithcompanion.fridgephoto";
    static final String URI_PREFIX = "content://" + AUTHORITY + "/";
    static final String DIR_NAME = "fridge-photos";
    static final String PREFIX = "wellness-fridge-";
    static final String SUFFIX = ".jpg";

    static String makeDisplayName(long nowMs) {
        return PREFIX + Math.max(0L, nowMs) + SUFFIX;
    }

    /** True only for filenames created by this app: wellness-fridge-<digits>.jpg (no slashes or traversal). */
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

    /** Parses the creation timestamp from an own photo filename, or -1 if invalid. */
    static long timestampOf(String name) {
        if (!isOwnPhotoName(name)) return -1L;
        try { return Long.parseLong(name.substring(PREFIX.length(), name.length() - SUFFIX.length())); }
        catch (NumberFormatException e) { return -1L; }
    }

    /** Extracts a validated own filename from a ContentProvider URI path (e.g. "/wellness-fridge-123.jpg"). */
    static String nameFromPath(String path) {
        if (path == null) return null;
        String s = path.startsWith("/") ? path.substring(1) : path;
        return isOwnPhotoName(s) ? s : null;
    }

    /** Builds the ContentProvider URI string for a validated own filename, or null if invalid. */
    static String uriStringFor(String name) {
        return isOwnPhotoName(name) ? URI_PREFIX + name : null;
    }

    /** Extracts the validated filename from a FridgePhotoProvider URI string, or null for any other URI. */
    static String nameFromUriString(String uri) {
        if (uri == null || !uri.startsWith(URI_PREFIX)) return null;
        String name = uri.substring(URI_PREFIX.length());
        return isOwnPhotoName(name) ? name : null;
    }

    /** True only for URIs belonging to this app's FridgePhotoProvider with a strict own photo name. */
    static boolean isOwnPhotoUri(String uri) {
        return nameFromUriString(uri) != null;
    }

    /** Resolves a ContentProvider path strictly to a direct child file inside dir, or null if invalid. */
    static File resolveFile(File dir, String path) {
        if (dir == null) return null;
        String name = nameFromPath(path);
        return name != null ? new File(dir, name) : null;
    }

    /** Maps ContentProvider openFile modes to ParcelFileDescriptor flags; rejects unknown modes. */
    static int parseOpenMode(String mode) {
        if ("r".equals(mode)) return ParcelFileDescriptor.MODE_READ_ONLY;
        if ("w".equals(mode) || "wt".equals(mode)) {
            return ParcelFileDescriptor.MODE_WRITE_ONLY | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE;
        }
        if ("rw".equals(mode) || "rwt".equals(mode)) {
            return ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE;
        }
        if ("wa".equals(mode)) {
            return ParcelFileDescriptor.MODE_WRITE_ONLY | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_APPEND;
        }
        throw new IllegalArgumentException("Unsupported mode: " + mode);
    }

    static boolean shouldDeleteOnResult(String cameraUri, String returnedUri) {
        return isOwnPhotoUri(cameraUri) && !cameraUri.equals(returnedUri);
    }

    static boolean isOldEnough(String name, long nowMs, long minAgeMs) {
        if (!isOwnPhotoName(name)) return false;
        if (minAgeMs <= 0L) return true;
        long ts = timestampOf(name);
        return ts >= 0L && nowMs - ts >= minAgeMs;
    }

    /** Deletes expired app-owned wellness-fridge-*.jpg files inside dir except keepName; never touches other files. */
    static int cleanupDir(File dir, String keepName, long nowMs, long minAgeMs) {
        if (dir == null || !dir.isDirectory()) return 0;
        File[] files = dir.listFiles();
        if (files == null) return 0;
        int deleted = 0;
        for (File f : files) {
            if (!f.isFile()) continue;
            String name = f.getName();
            if (name.equals(keepName)) continue;
            if (!isOldEnough(name, nowMs, minAgeMs)) continue;
            if (f.delete()) deleted++;
        }
        return deleted;
    }

    static File photoDir(Context c) {
        return new File(c.getCacheDir(), DIR_NAME);
    }

    /** Creates an empty temporary JPEG in app-private cache storage and returns its ContentProvider URI. */
    static synchronized Uri createTemp(Context c) {
        File dir = photoDir(c);
        if (!dir.exists() && !dir.mkdirs() && !dir.isDirectory()) return null;
        long ts = System.currentTimeMillis();
        File file = new File(dir, makeDisplayName(ts));
        while (file.exists()) {
            ts++;
            file = new File(dir, makeDisplayName(ts));
        }
        try {
            if (!file.createNewFile()) return null;
        } catch (IOException e) {
            return null;
        }
        String uriStr = uriStringFor(file.getName());
        return uriStr != null ? Uri.parse(uriStr) : null;
    }

    /** Deletes a single temporary app-private photo by URI (never touches MediaStore or user files). */
    static synchronized boolean deleteTemp(Context c, Uri uri) {
        if (c == null || uri == null) return false;
        String name = nameFromUriString(uri.toString());
        if (name == null) return false;
        File f = new File(photoDir(c), name);
        return f.isFile() && f.delete();
    }

    /** Sweeps leftover app-private wellness-fridge-*.jpg files except keepUri. Safe on a background thread. */
    static synchronized int cleanup(Context c, Uri keepUri, long minAgeMs) {
        if (c == null) return 0;
        String keepName = keepUri == null ? null : nameFromUriString(keepUri.toString());
        return cleanupDir(photoDir(c), keepName, System.currentTimeMillis(), minAgeMs);
    }
}
