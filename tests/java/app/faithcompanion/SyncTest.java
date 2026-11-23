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

        // Google Drive exports a Google Sheet as XLSX (not CSV): read it directly
        String sst = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" count=\"6\" uniqueCount=\"6\">"
            + "<si><t>id</t></si><si><t>task</t></si><si><t>answer-json</t></si><si><t>at</t></si>"
            + "<si><t>{&quot;task&quot;:&quot;advice&quot;,&quot;answer&quot;:{&quot;headline&quot;:&quot;Steady &amp; calm, ☀️&quot;}}</t></si>"
            + "<si><r><t>r</t></r><r><rPr><b/></rPr><t xml:space=\"preserve\">1</t></r><rPh><t>x</t></rPh></si></sst>";
        String sheet = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>"
            + "<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"s\"><v>1</v></c><c r=\"C1\" t=\"s\"><v>2</v></c><c r=\"D1\" t=\"s\"><v>3</v></c></row>"
            + "<row r=\"2\"><c r=\"A2\" t=\"s\"><v>5</v></c><c r=\"B2\" t=\"inlineStr\"><is><t>advice</t></is></c><c r=\"C2\" t=\"s\"><v>4</v></c><c r=\"D2\" t=\"str\"><v>2026-11-21T12:00:00Z</v></c></row>"
            + "<row r=\"3\"></row><row r=\"4\"><c r=\"A4\" t=\"inlineStr\"><is><t>r2</t></is></c><c r=\"C4\" t=\"inlineStr\"><is><t>{&quot;error&quot;:&quot;no&quot;}</t></is></c><c r=\"D4\"><v>46000.5</v></c></row>"
            + "</sheetData></worksheet>";
        String wb = "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>"
            + "<sheet name=\"Sheet1\" sheetId=\"1\" r:id=\"rId3\"/><sheet name=\"Other\" sheetId=\"2\" r:id=\"rId4\"/></sheets></workbook>";
        String rels = "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
            + "<Relationship Id=\"rId4\" Type=\"x\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId3\" Type=\"x\" Target=\"worksheets/sheet2.xml\"/></Relationships>";
        String other = "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData><row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>wrong sheet</t></is></c></row></sheetData></worksheet>";
        java.io.ByteArrayOutputStream zb = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream zo = new java.util.zip.ZipOutputStream(zb)) {
            String[][] files = { { "[Content_Types].xml", "<Types/>" }, { "xl/workbook.xml", wb }, { "xl/_rels/workbook.xml.rels", rels },
                { "xl/sharedStrings.xml", sst }, { "xl/worksheets/sheet2.xml", sheet }, { "xl/worksheets/sheet1.xml", other } };
            for (String[] f : files) { zo.putNextEntry(new java.util.zip.ZipEntry(f[0])); zo.write(f[1].getBytes("UTF-8")); zo.closeEntry(); }
        }
        byte[] xlsx = zb.toByteArray();
        List<List<String>> xr = Sync.parseXlsx(xlsx);
        ok(xr.size() == 3, "xlsx: header + 2 rows (empty row skipped), got " + xr);
        ok("id".equals(xr.get(0).get(0)) && "at".equals(xr.get(0).get(3)), "xlsx header from shared strings, workbook's first sheet");
        ok("r1".equals(xr.get(1).get(0)), "rich text runs joined, phonetic run left out: " + xr.get(1).get(0));
        ok("advice".equals(xr.get(1).get(1)) && xr.get(1).get(2).contains("Steady & calm, ☀️") && "2026-11-21T12:00:00Z".equals(xr.get(1).get(3)), "inline, entities, unicode, str: " + xr.get(1));
        ok("r2".equals(xr.get(2).get(0)) && "".equals(xr.get(2).get(1)) && "46000.5".equals(xr.get(2).get(3)), "missing column kept empty, number: " + xr.get(2));
        String xj = Sync.answersFromExport(Sync.XLSX, xlsx);
        ok(xj.startsWith("{\"rows\":[") && xj.contains("\"id\":\"r1\"") && xj.contains("\"id\":\"r2\"") && !xj.contains("\"id\":\"id\""), "xlsx -> rows json: " + xj);
        ok(Sync.answersFromExport("", xlsx).equals(xj), "xlsx recognised by its zip header too");
        ok(Sync.answersFromExport("text/csv", csv.getBytes("UTF-8")).equals(Sync.answersFromCsv(csv)), "csv export unchanged");
        boolean notSheet = false;
        try { Sync.parseXlsx("PK\u0003\u0004junk".getBytes("UTF-8")); } catch (IOException e) { notSheet = e.getMessage().contains("spreadsheet"); }
        ok(notSheet, "a broken zip says it isn't a spreadsheet");
        ok(Sync.column("A1") == 0 && Sync.column("D7") == 3 && Sync.column("AA3") == 26 && Sync.column("") == -1, "column refs");
        List<String> tries = Sync.answersTypes(new String[]{ "application/pdf", Sync.XLSX });
        ok(tries.size() == 1 && Sync.XLSX.equals(tries.get(0)), "Drive offering only pdf + xlsx: xlsx tried " + tries);
        tries = Sync.answersTypes(new String[]{ Sync.XLSX, "text/csv" });
        ok(tries.size() == 2 && "text/csv".equals(tries.get(0)), "csv first when offered " + tries);
        ok(Sync.answersTypes(null).isEmpty(), "nothing offered");
        String ee = Sync.exportError(new String[]{ "application/pdf" }, new java.io.FileNotFoundException("x"));
        ok(ee.contains("Drive offered: application/pdf") && ee.contains("Change answers sheet"), "export error names the offered types: " + ee);
        ok(Sync.friendlyAnswersError(new IOException(ee)).equals(ee), "that message is shown as it is");

        String stAns = Sync.statusJson(true, "wellness-sync.json", 10L, "", false, true, "wellness-answers", "Drive refused");
        ok(stAns.contains("\"answersConfigured\":true") && stAns.contains("\"answersName\":\"wellness-answers\"")
            && stAns.contains("\"answersError\":\"Drive refused\""), "answers status fields: " + stAns);

        ok(Sync.friendlyAnswersError(new SecurityException("denied")).contains("permission"), "answers security error");
        ok(Sync.friendlyAnswersError(new UnsupportedOperationException("no csv")).contains("CSV"), "answers unsupported error");
        ok(Sync.friendlyAnswersError(new FileNotFoundException("missing")).contains("answers sheet"), "answers not found error");
        ok(Sync.friendlyAnswersError(new IOException("virtual document not openable")).contains("export"), "answers virtual error");

        ok("text/plain".equals(Sync.mimeFor("faith-journal-2026-11-23.txt")), "txt -> text/plain");
        ok("application/json".equals(Sync.mimeFor("wellness-backup-2026-11-23.json")), "json backup");
        ok("application/json".equals(Sync.mimeFor(null)), "null name -> json");
        ok("text/plain".equals(Sync.mimeFor("JOURNAL.TXT")), "case-insensitive");
        System.out.println("SyncTest ok");
    }
}
