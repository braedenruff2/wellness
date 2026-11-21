package app.faithcompanion;

/** Plain-Java unit tests for Updater (run against android.jar; no device needed). */
public class UpdaterTest {
    static void ok(boolean b, String what) { if (!b) throw new AssertionError(what); }

    public static void main(String[] args) {
        // parseCode
        long[] c = Updater.parseCode("{\"code\": 30464210, \"name\": \"0.1.20261121.1410\"}");
        ok(c != null && c.length == 1 && c[0] == 30464210L, "valid version.json");
        ok(Updater.parseCode("{\"code\": 0}") == null, "zero code rejected");
        ok(Updater.parseCode("{\"code\": -5}") == null, "negative code rejected");
        ok(Updater.parseCode("{}") == null, "missing code rejected");
        ok(Updater.parseCode("not json") == null, "garbage rejected");

        // shouldDownload: skip installed, already-downloaded readyCode, or 3x failed; download strictly newer
        ok(!Updater.shouldDownload(100, 100, 0, 0), "same as installed: skip");
        ok(!Updater.shouldDownload(99, 100, 0, 0), "older than installed: skip");
        ok(Updater.shouldDownload(101, 100, 0, 0), "newer than installed, none ready: download");
        ok(!Updater.shouldDownload(101, 100, 101, 0), "already downloaded and ready: do not re-download");
        ok(!Updater.shouldDownload(101, 100, 102, 0), "older than ready: skip");
        ok(Updater.shouldDownload(102, 100, 101, 0), "newer than ready: download replacement");
        ok(Updater.shouldDownload(101, 100, 0, 2), "2 prior fails: try one more time");
        ok(!Updater.shouldDownload(101, 100, 0, 3), "3 prior fails: stop trying this version");

        // combineErrors: unpaired phone must surface GitHub errors; paired phone only reports when both fail
        ok("GitHub: HTTP 503".equals(Updater.combineErrors(false, null, "GitHub: HTTP 503")), "unpaired GitHub failure surfaces");
        ok("".equals(Updater.combineErrors(false, null, null)), "unpaired GitHub ok: empty error");
        ok("".equals(Updater.combineErrors(false, null, "")), "unpaired empty string: empty error");
        ok("PC: timeout; GitHub: offline".equals(Updater.combineErrors(true, "PC: timeout", "GitHub: offline")), "paired both failed");
        ok("".equals(Updater.combineErrors(true, "PC: timeout", null)), "paired PC failed but GitHub ok");
        ok("".equals(Updater.combineErrors(true, null, "GitHub: offline")), "paired PC ok, GitHub offline");

        System.out.println("ok Updater unit tests passed");
    }
}
