package app.faithcompanion;

import android.os.ParcelFileDescriptor;

import java.io.File;
import java.nio.file.Files;

/** Plain-Java check of FridgePhoto app-private URI, path validation, mode parsing & cache cleanup helpers. */
public class FridgePhotoTest {
    static void eq(Object a, Object b, String what) {
        if (a == null ? b != null : !a.equals(b)) throw new AssertionError(what + ": " + a + " != " + b);
    }

    public static void main(String[] a) throws Exception {
        eq(FridgePhoto.makeDisplayName(1764200000000L), "wellness-fridge-1764200000000.jpg", "display name");
        eq(FridgePhoto.makeDisplayName(-5L), "wellness-fridge-0.jpg", "negative clamped");

        eq(FridgePhoto.isOwnPhotoName("wellness-fridge-1764200000000.jpg"), true, "own photo");
        eq(FridgePhoto.isOwnPhotoName("wellness-fridge-0.jpg"), true, "zero ts");
        eq(FridgePhoto.isOwnPhotoName("wellness-fridge-.jpg"), false, "empty ts rejected");
        eq(FridgePhoto.isOwnPhotoName("wellness-fridge-abc.jpg"), false, "non-digit rejected");
        eq(FridgePhoto.isOwnPhotoName("wellness-fridge-123.png"), false, "wrong ext rejected");
        eq(FridgePhoto.isOwnPhotoName("../wellness-fridge-123.jpg"), false, "traversal rejected");
        eq(FridgePhoto.isOwnPhotoName("sub/wellness-fridge-123.jpg"), false, "subdir rejected");
        eq(FridgePhoto.isOwnPhotoName("IMG_20261127.jpg"), false, "user photo never matched");
        eq(FridgePhoto.isOwnPhotoName(null), false, "null rejected");

        eq(FridgePhoto.timestampOf("wellness-fridge-1764200000000.jpg"), 1764200000000L, "parsed ts");
        eq(FridgePhoto.timestampOf("IMG_123.jpg"), -1L, "other photo ts");

        eq(FridgePhoto.nameFromPath("/wellness-fridge-42.jpg"), "wellness-fridge-42.jpg", "leading slash path");
        eq(FridgePhoto.nameFromPath("wellness-fridge-42.jpg"), "wellness-fridge-42.jpg", "bare name path");
        eq(FridgePhoto.nameFromPath("//wellness-fridge-42.jpg"), null, "double slash rejected");
        eq(FridgePhoto.nameFromPath("/../wellness-fridge-42.jpg"), null, "dot-dot path rejected");
        eq(FridgePhoto.nameFromPath("/IMG_42.jpg"), null, "foreign path rejected");
        eq(FridgePhoto.nameFromPath(null), null, "null path rejected");

        String u1 = FridgePhoto.uriStringFor("wellness-fridge-1000.jpg");
        String u2 = FridgePhoto.uriStringFor("wellness-fridge-2000.jpg");
        eq(u1, "content://app.faithcompanion.fridgephoto/wellness-fridge-1000.jpg", "provider uri");
        eq(FridgePhoto.uriStringFor("IMG_1.jpg"), null, "non-own uriStringFor rejected");
        eq(FridgePhoto.nameFromUriString(u1), "wellness-fridge-1000.jpg", "name from own uri");
        eq(FridgePhoto.isOwnPhotoUri(u1), true, "own provider uri accepted");
        eq(FridgePhoto.isOwnPhotoUri("content://media/external/images/media/42"), false, "MediaStore uri rejected");
        eq(FridgePhoto.isOwnPhotoUri("content://app.faithcompanion.fridgephoto/../x.jpg"), false, "traversal uri rejected");
        eq(FridgePhoto.isOwnPhotoUri("file:///sdcard/DCIM/a.jpg"), false, "file uri rejected");
        eq(FridgePhoto.isOwnPhotoUri(null), false, "null uri rejected");

        eq(FridgePhoto.parseOpenMode("r"), ParcelFileDescriptor.MODE_READ_ONLY, "mode r");
        eq(FridgePhoto.parseOpenMode("w"), ParcelFileDescriptor.MODE_WRITE_ONLY | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE, "mode w");
        eq(FridgePhoto.parseOpenMode("wt"), ParcelFileDescriptor.MODE_WRITE_ONLY | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE, "mode wt");
        eq(FridgePhoto.parseOpenMode("rw"), ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE, "mode rw");
        eq(FridgePhoto.parseOpenMode("rwt"), ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE, "mode rwt");
        eq(FridgePhoto.parseOpenMode("wa"), ParcelFileDescriptor.MODE_WRITE_ONLY | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_APPEND, "mode wa");
        for (String bad : new String[]{null, "", "x", "rwx"}) {
            boolean threw = false;
            try { FridgePhoto.parseOpenMode(bad); } catch (IllegalArgumentException e) { threw = true; }
            eq(threw, true, "bad mode rejected: " + bad);
        }

        eq(FridgePhoto.isOldEnough("wellness-fridge-1000.jpg", 2000L, 0L), true, "minAge 0 deletes immediately");
        eq(FridgePhoto.isOldEnough("wellness-fridge-1000.jpg", 2000L, 5000L), false, "too fresh for minAge");
        eq(FridgePhoto.isOldEnough("wellness-fridge-1000.jpg", 7000L, 5000L), true, "past minAge");
        eq(FridgePhoto.isOldEnough("IMG_1000.jpg", 999999L, 0L), false, "non-own photo never eligible");

        eq(FridgePhoto.shouldDeleteOnResult(u1, null), true, "cancel deletes empty temp file");
        eq(FridgePhoto.shouldDeleteOnResult(u1, u2), true, "gallery pick deletes empty camera file");
        eq(FridgePhoto.shouldDeleteOnResult(u1, u1), false, "camera echo keeps photo for WebView");
        eq(FridgePhoto.shouldDeleteOnResult("content://media/external/images/media/1", null), false, "never deletes MediaStore uri");
        eq(FridgePhoto.shouldDeleteOnResult(null, u2), false, "no camera uri -> nothing to delete");

        File tmp = Files.createTempDirectory("wl-fridge-test-").toFile();
        try {
            File resolved = FridgePhoto.resolveFile(tmp, "/wellness-fridge-1000.jpg");
            eq(resolved != null && resolved.getParentFile().equals(tmp) && resolved.getName().equals("wellness-fridge-1000.jpg"), true, "resolveFile inside dir");
            eq(FridgePhoto.resolveFile(tmp, "/../escape.jpg"), null, "resolveFile blocks traversal");
            eq(FridgePhoto.resolveFile(null, "/wellness-fridge-1000.jpg"), null, "resolveFile rejects null dir");

            File oldOwn = new File(tmp, "wellness-fridge-1000.jpg");
            File freshOwn = new File(tmp, "wellness-fridge-9500.jpg");
            File keepOwn = new File(tmp, "wellness-fridge-2000.jpg");
            File foreign = new File(tmp, "IMG_20261127.jpg");
            File subDir = new File(tmp, "wellness-fridge-3000.jpg");
            oldOwn.createNewFile();
            freshOwn.createNewFile();
            keepOwn.createNewFile();
            foreign.createNewFile();
            subDir.mkdir();

            eq(FridgePhoto.cleanupDir(tmp, "wellness-fridge-2000.jpg", 10000L, 1000L), 1, "deletes only old non-kept own file");
            eq(oldOwn.exists(), false, "old own file deleted");
            eq(freshOwn.exists(), true, "fresh own file kept under minAge");
            eq(keepOwn.exists(), true, "in-flight keepName preserved");
            eq(foreign.exists(), true, "non-own file untouched");
            eq(subDir.exists(), true, "directory untouched");

            eq(FridgePhoto.cleanupDir(tmp, null, 10000L, 0L), 2, "minAge 0 clears remaining own files");
            eq(freshOwn.exists(), false, "fresh deleted on minAge 0");
            eq(keepOwn.exists(), false, "keep deleted when keepName null");
            eq(foreign.exists(), true, "non-own file still untouched");
            eq(subDir.exists(), true, "directory still untouched");
        } finally {
            File[] left = tmp.listFiles();
            if (left != null) for (File f : left) f.delete();
            tmp.delete();
        }

        System.out.println("FridgePhotoTest ok");
    }
}
