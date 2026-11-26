package app.faithcompanion;

/** Plain-Java check of CalmAlarm helpers (run against android.jar; no device needed). */
public class CalmAlarmTest {
    static void eq(Object a, Object b, String what) {
        if (a == null ? b != null : !a.equals(b)) throw new AssertionError(what + ": " + a + " != " + b);
    }
    public static void main(String[] a) {
        eq(CalmAlarm.clampDelayMs(0), 0L, "zero cancels");
        eq(CalmAlarm.clampDelayMs(-5000), 0L, "negative cancels");
        eq(CalmAlarm.clampDelayMs(1_200_000L), 1_200_000L, "20 min kept");
        eq(CalmAlarm.clampDelayMs(999_000_000L), CalmAlarm.MAX_DELAY_MS, "capped at 4 hours");

        eq(CalmAlarm.shouldNotify(CalmAlarm.FIRE, false), true, "fires when screen off / background");
        eq(CalmAlarm.shouldNotify(CalmAlarm.FIRE, true), false, "suppressed when app on screen");
        eq(CalmAlarm.shouldNotify("other", false), false, "ignores foreign action");
        eq(CalmAlarm.shouldNotify(null, false), false, "ignores null action");

        eq(CalmAlarm.bodyFor(null), "Time is up.", "null label fallback");
        eq(CalmAlarm.bodyFor("   "), "Time is up.", "blank label fallback");
        eq(CalmAlarm.bodyFor("  Counting breaths · 20 min  "), "Counting breaths · 20 min", "trimmed label");
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 150; i++) big.append('a');
        eq(CalmAlarm.bodyFor(big.toString()).length(), 120, "long label truncated");

        System.out.println("CalmAlarmTest ok");
    }
}
