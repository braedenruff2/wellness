package app.faithcompanion;

import java.util.List;

/** Plain-Java check of FridgePhoto tracking & cleanup helpers (run against android.jar; no device needed). */
public class FridgePhotoTest {
    static void eq(Object a, Object b, String what) {
        if (a == null ? b != null : !a.equals(b)) throw new AssertionError(what + ": " + a + " != " + b);
    }

    public static void main(String[] a) {
        eq(FridgePhoto.makeDisplayName(1764200000000L), "wellness-fridge-1764200000000.jpg", "display name");
        eq(FridgePhoto.makeDisplayName(-5L), "wellness-fridge-0.jpg", "negative clamped");

        eq(FridgePhoto.isOwnPhotoName("wellness-fridge-1764200000000.jpg"), true, "own photo");
        eq(FridgePhoto.isOwnPhotoName("wellness-fridge-0.jpg"), true, "zero ts");
        eq(FridgePhoto.isOwnPhotoName("wellness-fridge-.jpg"), false, "empty ts rejected");
        eq(FridgePhoto.isOwnPhotoName("wellness-fridge-abc.jpg"), false, "non-digit rejected");
        eq(FridgePhoto.isOwnPhotoName("wellness-fridge-123.png"), false, "wrong ext rejected");
        eq(FridgePhoto.isOwnPhotoName("IMG_20261127.jpg"), false, "user photo never matched");
        eq(FridgePhoto.isOwnPhotoName(null), false, "null rejected");

        eq(FridgePhoto.timestampOf("wellness-fridge-1764200000000.jpg"), 1764200000000L, "parsed ts");
        eq(FridgePhoto.timestampOf("IMG_123.jpg"), -1L, "other photo ts");

        eq(FridgePhoto.isOldEnough("wellness-fridge-1000.jpg", 2000L, 0L), true, "minAge 0 deletes immediately");
        eq(FridgePhoto.isOldEnough("wellness-fridge-1000.jpg", 2000L, 5000L), false, "too fresh for minAge");
        eq(FridgePhoto.isOldEnough("wellness-fridge-1000.jpg", 7000L, 5000L), true, "past minAge");
        eq(FridgePhoto.isOldEnough("IMG_1000.jpg", 999999L, 0L), false, "non-own photo never eligible");

        eq(FridgePhoto.isSafeTrackUri("content://media/external/images/media/42"), true, "media uri safe");
        eq(FridgePhoto.isSafeTrackUri("file:///sdcard/DCIM/a.jpg"), false, "file uri rejected");
        eq(FridgePhoto.isSafeTrackUri("content://com.android.providers.downloads/1"), false, "non-media uri rejected");
        eq(FridgePhoto.isSafeTrackUri(null), false, "null uri rejected");

        String u1 = "content://media/external/images/media/1";
        String u2 = "content://media/external/images/media/2";
        List<String> t1 = FridgePhoto.addTracked("", u1);
        eq(t1.size(), 1, "added u1");
        String raw = FridgePhoto.joinTracked(t1);
        List<String> t2 = FridgePhoto.addTracked(raw, u2);
        eq(t2.size(), 2, "added u2");
        List<String> tDup = FridgePhoto.addTracked(FridgePhoto.joinTracked(t2), u1);
        eq(tDup.size(), 2, "deduplicated u1");
        eq(tDup.get(1), u1, "moved u1 to newest");
        List<String> tRem = FridgePhoto.removeTracked(FridgePhoto.joinTracked(tDup), u1);
        eq(tRem.size(), 1, "removed u1");
        eq(tRem.get(0), u2, "u2 remains");

        String many = "";
        for (int i = 0; i < 30; i++) {
            many = FridgePhoto.joinTracked(FridgePhoto.addTracked(many, "content://media/external/images/media/" + i));
        }
        List<String> capped = FridgePhoto.parseTracked(many);
        eq(capped.size(), FridgePhoto.MAX_TRACKED, "capped at MAX_TRACKED");
        eq(capped.get(0), "content://media/external/images/media/10", "oldest dropped");
        eq(capped.get(capped.size() - 1), "content://media/external/images/media/29", "newest kept");

        eq(FridgePhoto.shouldDeleteOnResult(u1, null), true, "cancel deletes empty row");
        eq(FridgePhoto.shouldDeleteOnResult(u1, u2), true, "gallery pick deletes empty camera row");
        eq(FridgePhoto.shouldDeleteOnResult(u1, u1), false, "camera echo keeps photo for WebView");
        eq(FridgePhoto.shouldDeleteOnResult(null, u2), false, "no camera uri -> nothing to delete");

        System.out.println("FridgePhotoTest ok");
    }
}
