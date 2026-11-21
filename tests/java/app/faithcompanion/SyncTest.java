package app.faithcompanion;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

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

        // Task 32: virtual Google Sheet MIME selection, CSV parsing, answersFromCsv, errors
        ok("text/csv".equals(Sync.chooseAnswersMime(new String[]{"application/pdf", "text/csv", "text/plain"})), "prefers text/csv");
        ok("text/comma-separated-values".equals(Sync.chooseAnswersMime(new String[]{"application/pdf", "text/comma-separated-values"})), "fallback comma-separated");
        ok("application/json".equals(Sync.chooseAnswersMime(new String[]{"application/json"})), "accepts json");
        ok("text/plain".equals(Sync.chooseAnswersMime(new String[]{"application/pdf", "text/plain"})), "accepts text/plain");
        ok(Sync.chooseAnswersMime(new String[]{"application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}) == null, "rejects binary-only");
        ok(Sync.chooseAnswersMime(null) == null && Sync.chooseAnswersMime(new String[0]) == null, "empty stream types");

        String csv = "\uFEFFid,task,answer-json,at\r\n"
            + "r1,advice,\"{\"\"headline\"\":\"\"Steady, calm week\"\",\"\"points\"\":[\"\"one\"\",\"\"two\"\"]}\",2026-11-21T12:00:00Z\r\n"
            + "\r\n"
            + "r2,coach-scenario,\"{\n\"\"title\"\":\"\"Bedtime\"\",\n\"\"scenario\"\":\"\"She cries ☀️\"\"\n}\",\r\n"
            + "short-row,only-two\n"
            + " ,advice,\"{\"\"skip\"\":true}\",2026-11-21T13:00:00Z\n";
        List<List<String>> parsed = Sync.parseCsv(csv);
        ok(parsed.size() == 5, "parsed 5 non-empty rows, got " + parsed.size());
        ok("id".equals(parsed.get(0).get(0)) && "at".equals(parsed.get(0).get(3)), "header parsed");
        ok("r1".equals(parsed.get(1).get(0)) && parsed.get(1).get(2).contains("\"Steady, calm week\""), "doubled quotes + comma");
        ok("r2".equals(parsed.get(2).get(0)) && parsed.get(2).get(2).contains("\n") && parsed.get(2).get(2).contains("☀️") && "".equals(parsed.get(2).get(3)), "multiline + unicode + trailing empty col");

        String rowsJson = Sync.answersFromCsv(csv);
        ok(rowsJson.startsWith("{\"rows\":[") && rowsJson.endsWith("]}"), "rows json wrapper: " + rowsJson);
        ok(rowsJson.contains("\"id\":\"r1\"") && rowsJson.contains("\"task\":\"advice\""), "contains r1");
        ok(rowsJson.contains("\"id\":\"r2\"") && rowsJson.contains("\\u000a") && rowsJson.contains("☀️"), "contains r2 with escaped newline");
        ok(!rowsJson.contains("short-row") && !rowsJson.contains("\"id\":\"id\""), "skips header, short row, blank id");

        // No-header CSV keeps first row
        String noHeader = "r9,weekly-plan,\"{\"\"headline\"\":\"\"Rest\"\"}\",2026-11-21T14:00:00Z";
        ok(Sync.answersFromCsv(noHeader).contains("\"id\":\"r9\""), "no-header csv kept");
        // JSON passthrough
        String rawJson = "\uFEFF  {\"answers\":{\"r1\":{\"task\":\"advice\"}}}  ";
        ok("{\"answers\":{\"r1\":{\"task\":\"advice\"}}}".equals(Sync.answersFromCsv(rawJson)), "json passthrough");
        ok("{\"rows\":[]}".equals(Sync.answersFromCsv("   \r\n  ")), "blank csv -> empty rows");

        // Binary export (XLSX/PDF) rejected clearly
        boolean badBin = false;
        try { Sync.answersFromCsv("PK\u0003\u0004binary-xlsx"); } catch (IOException e) { badBin = e.getMessage().contains("CSV"); }
        ok(badBin, "rejects xlsx binary");
        boolean badPdf = false;
        try { Sync.answersFromCsv("%PDF-1.7"); } catch (IOException e) { badPdf = e.getMessage().contains("CSV"); }
        ok(badPdf, "rejects pdf binary");

        String stAns = Sync.statusJson(true, "wellness-sync.json", 10L, "", false, true, "wellness-answers", "Drive refused");
        ok(stAns.contains("\"answersConfigured\":true") && stAns.contains("\"answersName\":\"wellness-answers\"")
            && stAns.contains("\"answersError\":\"Drive refused\""), "answers status fields: " + stAns);

        ok(Sync.friendlyAnswersError(new SecurityException("denied")).contains("permission"), "answers security error");
        ok(Sync.friendlyAnswersError(new UnsupportedOperationException("no csv")).contains("CSV"), "answers unsupported error");
        ok(Sync.friendlyAnswersError(new FileNotFoundException("missing")).contains("answers sheet"), "answers not found error");
        ok(Sync.friendlyAnswersError(new IOException("virtual document not openable")).contains("export"), "answers virtual error");

        System.out.println("SyncTest ok");
    }
}
