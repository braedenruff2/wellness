package app.faithcompanion;

import java.util.List;

public class SpeechTest {
    static int fails = 0;
    static void check(String n, boolean ok, Object x) { System.out.println((ok ? "ok   " : "FAIL ") + n + (ok ? "" : "  " + x)); if (!ok) fails++; }
    public static void main(String[] a) {
        List<String> s = Speech.sentences("Be still. Breathe in slowly, and let it go. Amen.");
        check("sentences: short ones join their neighbour", s.size() == 1 && s.get(0).equals("Be still. Breathe in slowly, and let it go. Amen."), s);
        s = Speech.sentences("Breathe in slowly through your nose. Hold it gently for a moment. Now let it go.");
        check("sentences: one at a time", s.size() == 3 && s.get(2).equals("Now let it go."), s);
        s = Speech.sentences("Lord, you know me.\nYou see me when I sit and when I rise!   Thank you?");
        check("sentences: lines and ? !", s.size() == 2 && s.get(0).equals("Lord, you know me.") && s.get(1).equals("You see me when I sit and when I rise! Thank you?"), s);
        check("sentences: empty", Speech.sentences("  ").isEmpty() && Speech.sentences(null).isEmpty(), "");
        StringBuilder longOne = new StringBuilder(); for (int i = 0; i < 30; i++) longOne.append("and the light of morning, ");
        s = Speech.sentences(longOne.toString().trim());
        boolean allShort = true; for (String x : s) allShort &= x.length() <= 230;
        check("sentences: a long run-on line is cut at commas", s.size() >= 3 && allShort, s.size());
        check("sentences: nothing lost", String.join(" ", Speech.sentences("One two three four five. Six seven eight nine ten.")).equals("One two three four five. Six seven eight nine ten."), "");
        float[] x = new float[24000]; for (int i = 6000; i < 12000; i++) x[i] = 0.3f;
        float[] t = Speech.trim(x, 24000);
        check("trim keeps the speech and a sliver either side", t.length == 6000 + 1440 + 5280, t.length);
        check("trim: silence stays", Speech.trim(new float[100], 24000).length == 100, "");
        check("resample 16k -> 24k", Speech.resample(new float[16000], 16000, 24000).length == 24000, "");
        check("Tagalog text: lower case, punctuation out", Speech.forTagalog("Kumain ka na ba, Lola? “Salamat po!”").equals("kumain ka na ba lola salamat po"), Speech.forTagalog("Kumain ka na ba, Lola? “Salamat po!”"));
        check("Tagalog text: ñ, accents, apostrophes", Speech.forTagalog("Señora, áko’y mag-aaral").equals("señora ako'y mag-aaral"), Speech.forTagalog("Señora, áko’y mag-aaral"));
        // Voices.offerWhile: stops cleanly when cancelled on a full queue (no blocked producer thread leak)
        try {
            java.util.concurrent.LinkedBlockingQueue<Object> q = new java.util.concurrent.LinkedBlockingQueue<>(1);
            check("offerWhile: enqueues when space is available", Voices.offerWhile(q, "a", () -> true) && "a".equals(q.peek()), q.size());
            final java.util.concurrent.atomic.AtomicBoolean alive = new java.util.concurrent.atomic.AtomicBoolean(true);
            new Thread(() -> { try { Thread.sleep(60); } catch (InterruptedException ignored) { } alive.set(false); }).start();
            long t0 = System.currentTimeMillis();
            boolean put = Voices.offerWhile(q, "b", alive::get);
            long dt = System.currentTimeMillis() - t0;
            check("offerWhile: returns false promptly when stopped on a full queue", !put && dt < 1000 && q.size() == 1, put + " " + dt + "ms");
        } catch (InterruptedException e) {
            check("offerWhile: unexpected interrupt", false, e);
        }
        check("jsString: escapes quotes, control chars, line separators",
            MainActivity.jsString(null).equals("null")
                && MainActivity.jsString("a\"b\\c\n\u2028\u2029").equals("\"a\\\"b\\\\c\\u000a\\u2028\\u2029\""),
            MainActivity.jsString("a\"b\\c\n\u2028\u2029"));
        System.out.println(fails == 0 ? "Speech: all passed" : "Speech: " + fails + " failed");
        System.exit(fails == 0 ? 0 : 1);
    }
}
