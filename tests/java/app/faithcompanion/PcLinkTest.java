package app.faithcompanion;

/** The phone's PcLink against the real PC server (pc/wellness_pc.py, started by tests/java.cjs with pairing on and a
 *  known code). Args: port code. */
public class PcLinkTest {
    static int fails = 0;
    static void check(String name, boolean ok, Object extra) { System.out.println((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "  " + extra)); if (!ok) fails++; }

    public static void main(String[] a) throws Exception {
        int port = Integer.parseInt(a[0]); String code = a[1];
        try { PcLink.pair("127.0.0.1", port, "WRNG-WRNG-WRNG", "x"); check("wrong code refused", false, "paired"); }
        catch (java.io.IOException e) { check("wrong code refused", e.getMessage().contains("wrong code"), e.getMessage()); }
        PcLink l = PcLink.pair("127.0.0.1", port, code.toLowerCase(), "Pixel Zoë");
        check("paired (code in lower case is fine)", l.token != null && l.fp.length() == 64, l.fp);
        check("knows the PC's name", l.name != null && !l.name.isEmpty(), l.name);
        String h = l.get("/v1/health", 5000);
        check("health", h.contains("\"app\": \"wellness\""), h);
        String r = l.post("/v1/activity", "{\"events\":[{\"id\":\"t/1\",\"at\":\"2026-11-19T10:00:00Z\",\"part\":\"todo\",\"kind\":\"done\",\"text\":" + PcLink.quote("call Lola 💬  ") + "}]}", 5000);
        check("activity", r.contains("\"saved\": 1"), r);
        String v = l.get("/v1/app/version", 5000);
        long[] vc = Updater.parseCode(v);
        check("app version from the PC", vc != null && vc[0] == 30463999L && "0.1.test".equals(PcLink.str(v, "name")), v);
        java.io.ByteArrayOutputStream apk = new java.io.ByteArrayOutputStream();
        check("app download from the PC", l.download("/v1/app/apk", apk, 10000) == 250000 && apk.size() == 250000, apk.size());
        check("a version file without a code is refused", Updater.parseCode("{\"name\":\"x\"}") == null && Updater.parseCode("<html>") == null, "");
        PcLink bad = new PcLink(l.host, l.port, "00" + l.fp.substring(2), l.token, "x");
        try { bad.get("/v1/health", 5000); check("another certificate is refused", false, "answered"); }
        catch (java.io.IOException e) { check("another certificate is refused", true, null); }
        PcLink nokey = new PcLink(l.host, l.port, l.fp, PcLink.b64(new byte[32]), "x");
        try { nokey.get("/v1/health", 5000); check("a wrong key is refused", false, "answered"); }
        catch (java.io.IOException e) { check("a wrong key is refused, with the PC's words", e.getMessage().contains("isn't paired"), e.getMessage()); }
        try { PcLink.pair("127.0.0.1", port, code, "again"); check("a code works once", false, "paired twice"); }
        catch (java.io.IOException e) { check("a code works once", true, null); }
        try { PcLink.pair("127.0.0.1", 1, code, "x"); check("no PC: says so", false, ""); }
        catch (java.io.IOException e) { check("no PC: says so", e.getMessage().contains("couldn't reach"), e.getMessage()); }
        String found = PcLink.discover(800, port);
        check("discover answers a JSON list", found.startsWith("[") && found.endsWith("]"), found);
        check("pair key matches the PC's (PBKDF2)", PcLink.hexOf(PcLink.pairKey("abcd-efgh-jkmn")).equals(a[2]), PcLink.hexOf(PcLink.pairKey("abcd-efgh-jkmn")));
        System.out.println(fails == 0 ? "PcLink: all passed" : "PcLink: " + fails + " failed");
        System.exit(fails == 0 ? 0 : 1);
    }
}
