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

        // Doze/inexact delivery delay: reminders between `when` and `now` are all surfaced oldest-first,
        // and the next alarm starts strictly after `now` (never skipping them or double-firing at `now`)
        String delayed = "900\td@d\tlater\n750\tb@d\tduring delay\n700\ta@d\tfirst\n800\tc@d\tat boundary";
        java.util.List<TodoAlarm.Entry> win = TodoAlarm.dueBetween(delayed, 700, 800);
        ok(win.size() == 3 && win.get(0).id.equals("a@d") && win.get(1).id.equals("b@d") && win.get(2).id.equals("c@d"), "delayed window sorted");
        ok(TodoAlarm.next(delayed, 800).id.equals("d@d"), "next alarm strictly after through boundary");
        ok(TodoAlarm.dueBetween(delayed, 900, 700).isEmpty(), "inverted window is empty");

        // hasReminders: "#open\t" alone must not trigger Android's POST_NOTIFICATIONS prompt on a fresh app
        ok(!TodoAlarm.hasReminders(null) && !TodoAlarm.hasReminders("") && !TodoAlarm.hasReminders("#open\t"), "no reminders when only #open");
        ok(TodoAlarm.hasReminders("100\ta@d\tx\n#open\ta"), "hasReminders true when a reminder exists");

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
        // "Done" on the notification: queued for the page, one line per task (latest wins), capped; its snooze goes
        String tk = TodoAlarm.addTicked("", "a", 100);
        tk = TodoAlarm.addTicked(tk, "b", 200);
        tk = TodoAlarm.addTicked(tk, "a", 300);
        ok(tk.equals("200\tb\n300\ta\n"), "ticked lines: " + tk);
        ok(TodoAlarm.addTicked(null, "x\ty", 5).equals("5\tx y\n"), "no tabs in the id");
        // the reminder's day goes with it (Done on yesterday's notification of a daily task)
        ok("2026-11-19".equals(TodoAlarm.day("t1@2026-11-19")) && TodoAlarm.day("t1@snooze") == null && TodoAlarm.day("t1") == null && TodoAlarm.day(null) == null, "day from id");
        String td = TodoAlarm.addTicked(TodoAlarm.addTicked("", "a", 100, "2026-11-18"), "a", 200, "2026-11-19");
        ok(td.equals("200\ta\t2026-11-19\n"), "ticked with day, latest wins: " + td);
        ok(TodoAlarm.addTicked("", "a", 1, "junk").equals("1\ta\n"), "a bad day is left out");
        String many = "";
        for (int n = 0; n < 60; n++) many = TodoAlarm.addTicked(many, "t" + n, n);
        ok(many.split("\n").length == 50 && many.startsWith("10\tt10\n"), "at most 50, oldest dropped");
        String sn2 = TodoAlarm.addSnooze(TodoAlarm.addSnooze("", "a@d", "x", 900, 0), "b@d", "y", 900, 0);
        ok(TodoAlarm.parse(TodoAlarm.dropSnooze(sn2, "a")).size() == 1 && TodoAlarm.next(TodoAlarm.dropSnooze(sn2, "a"), 0).id.equals("b@snooze"), "done drops that task's snooze only");
        System.out.println("TodoAlarmTest ok");
    }
}
