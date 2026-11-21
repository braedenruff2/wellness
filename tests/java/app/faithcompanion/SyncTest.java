package app.faithcompanion;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Plain-Java unit tests for Sync (run against android.jar; no device needed). */
public class SyncTest {
    static void ok(boolean b, String what) { if (!b) throw new AssertionError(what); }

    public static void main(String[] args) throws Exception {
        long t0 = 1_700_000_000_000L;
        ok(Sync.shouldAutoSync(0, t0), "never synced: due");
        ok(!Sync.shouldAutoSync(t0, t0 + 10 * 60_000L), "10 min later: not due yet");
        ok(!Sync.shouldAutoSync(t0, t0 + 29 * 60_000L + 59_000L), "just under 30 min: not due");
        ok(Sync.shouldAutoSync(t0, t0 + 30 * 60_000L), "at 30 min: due");
        ok(Sync.shouldAutoSync(t0, t0 + 90 * 60_000L), "after 30 min: due");
        ok(Sync.shouldAutoSync(t0, t0 - 5000L), "clock moved back: does not get stuck");

        ok(Sync.DEFAULT_NAME.equals(Sync.cleanName(null)), "null name -> default");
        ok(Sync.DEFAULT_NAME.equals(Sync.cleanName("  \n\t  ")), "blank name -> default");
        ok("my-sync.json".equals(Sync.cleanName("  my-\nsync.json  ")), "strips control chars");
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 200; i++) big.append('a');
        ok(Sync.cleanName(big.toString()).length() == 120, "capped at 120");

        String st0 = Sync.statusJson(false, "wellness-sync.json", 0, "", false);
        ok(st0.contains("\"configured\":false") && st0.contains("\"name\":\"\"") && st0.contains("\"busy\":false"), "unconfigured json: " + st0);
        String st1 = Sync.statusJson(true, "drive \"sync\".json", 12345L, "err\nline", true);
        ok(st1.contains("\"configured\":true") && st1.contains("\"lastSync\":12345") && st1.contains("\"busy\":true")
            && st1.contains("\\\"sync\\\"") && !st1.contains("\n"), "configured json escaped: " + st1);
        ok(Sync.statusJson(true, "a.json", -5L, null, false).contains("\"lastSync\":0"), "negative lastSync clamped");

        ok(Sync.friendlyError(new SecurityException("denied"), true).toLowerCase().contains("write"), "security write");
        ok(Sync.friendlyError(new SecurityException("denied"), false).toLowerCase().contains("read"), "security read");
        ok(Sync.friendlyError(new UnsupportedOperationException("no write"), true).toLowerCase().contains("refused writes"), "unsupported write refusal");
        ok(Sync.friendlyError(new FileNotFoundException("gone"), true).toLowerCase().contains("not found"), "missing file");
        ok(Sync.friendlyError(new IOException("Read-only file system"), true).toLowerCase().contains("refused writes"), "read-only write refusal");
        ok(Sync.friendlyError(new IOException("network timeout"), false).contains("network timeout"), "generic io error");
        ok(Sync.friendlyError(null, true).toLowerCase().contains("write"), "null throwable");

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        String sample = "{\"app\":\"wellness\",\"text\":\"Magandang umaga ☀️\"}";
        Sync.writeStream(out, sample);
        String readBack = Sync.readStream(new ByteArrayInputStream(out.toByteArray()), 1024);
        ok(sample.equals(readBack), "utf-8 stream round-trip");
        ok("".equals(Sync.readStream(new ByteArrayInputStream(new byte[0]), 1024)), "empty stream");

        boolean capped = false;
        try {
            Sync.readStream(new ByteArrayInputStream("1234567890".getBytes(StandardCharsets.UTF_8)), 5);
        } catch (IOException e) {
            capped = e.getMessage() != null && e.getMessage().contains("too large");
        }
        ok(capped, "maxBytes guard enforced");

        System.out.println("SyncTest ok");
    }
}
