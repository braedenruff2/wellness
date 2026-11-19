package app.faithcompanion;

/** Plain-Java check of TodoAlarm.next (run against android.jar; no device needed). */
public class TodoAlarmTest {
    static void ok(boolean b, String what) { if (!b) throw new AssertionError(what); }
    public static void main(String[] a) {
        String lines = "300\tb@d\tcall Mom\n100\ta@d\tbins\n200\tc@d\ttab\tinside\nnope\tx\ty\n\n50\tshort";
        ok(TodoAlarm.next(lines, 0).id.equals("a@d"), "soonest first, whatever the order");
        ok(TodoAlarm.next(lines, 100).id.equals("c@d"), "strictly after: the one that just went off is skipped");
        ok(TodoAlarm.next(lines, 100).text.equals("tab\tinside"), "text keeps everything after the second tab");
        ok(TodoAlarm.next(lines, 300) == null, "none left");
        ok(TodoAlarm.next("", 0) == null && TodoAlarm.next(null, 0) == null, "empty");
        ok(TodoAlarm.next("abc", 0) == null, "junk");
        ok(TodoAlarm.next("#open\ta,b\n100\ta@d\tx", 0).id.equals("a@d"), "the #open line is not a reminder");

        // two tasks at the same minute: both show (the old code skipped the second)
        String two = "700\tb@d\tbins\n700\ta@d\tmeds\n800\tc@d\tx";
        ok(TodoAlarm.at(two, 700).size() == 2, "both 7 pm reminders");
        ok(TodoAlarm.at(two, 650).isEmpty(), "none at another time");

        // open set
        ok(TodoAlarm.open("100\ta@d\tx") == null, "older page: no #open line = keep snoozes");
        ok(TodoAlarm.open("100\ta@d\tx\n#open\ta,b").contains("b"), "#open parsed");
        ok(TodoAlarm.open("#open\t").isEmpty(), "empty #open");

        // snoozes: one per task, dropped when past or when the task is no longer open
        String sn = TodoAlarm.addSnooze("", "a@2026-11-18", "call Mom", 5000, 1000);
        ok(TodoAlarm.next(sn, 1000).id.equals("a@snooze") && TodoAlarm.next(sn, 1000).text.equals("call Mom"), "snooze line");
        sn = TodoAlarm.addSnooze(sn, "a@snooze", "call Mom", 9000, 2000);
        ok(TodoAlarm.parse(sn).size() == 1 && TodoAlarm.next(sn, 0).when == 9000, "snoozing again replaces it");
        sn = TodoAlarm.addSnooze(sn, "b@x", "bins", 7000, 2000);
        ok(TodoAlarm.parse(sn).size() == 2, "two tasks");
        java.util.Set<String> open = new java.util.HashSet<>(java.util.Arrays.asList("b"));
        ok(TodoAlarm.parse(TodoAlarm.keepSnoozed(sn, open, 0)).size() == 1, "a ticked/deleted task loses its snooze");
        ok(TodoAlarm.parse(TodoAlarm.keepSnoozed(sn, null, 0)).size() == 2, "no #open: kept");
        ok(TodoAlarm.parse(TodoAlarm.keepSnoozed(sn, null, 8000)).size() == 1, "past ones dropped");
        ok(TodoAlarm.addSnooze("", "x", "a\tb\nc", 5, 0).split("\n").length == 1, "no tabs/newlines from the text");
        System.out.println("TodoAlarmTest ok");
    }
}
