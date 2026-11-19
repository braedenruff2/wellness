package app.faithcompanion;

import java.util.Calendar;

/** Plain-Java check of Reminder.nextTime (run against android.jar; no device needed). */
public class ReminderTest {
    static long at(int y, int mo, int d, int h, int mi) { Calendar c = Calendar.getInstance(); c.clear(); c.set(y, mo - 1, d, h, mi); return c.getTimeInMillis(); }
    static void eq(long a, long b, String what) { if (a != b) throw new AssertionError(what + ": " + new java.util.Date(a) + " != " + new java.util.Date(b)); }
    public static void main(String[] a) {
        eq(Reminder.nextTime(at(2026, 11, 18, 10, 0), 20, 30), at(2026, 11, 18, 20, 30), "later today");
        eq(Reminder.nextTime(at(2026, 11, 18, 21, 0), 20, 30), at(2026, 11, 19, 20, 30), "already passed: tomorrow");
        eq(Reminder.nextTime(at(2026, 11, 18, 20, 30), 20, 30), at(2026, 11, 19, 20, 30), "exactly now: tomorrow (no double)");
        eq(Reminder.nextTime(at(2026, 12, 31, 23, 0), 7, 0), at(2027, 1, 1, 7, 0), "new year");
        eq(Reminder.nextTime(at(2026, 11, 18, 0, 0), 0, 0), at(2026, 11, 19, 0, 0), "midnight");
        System.out.println("ReminderTest ok");
    }
}
