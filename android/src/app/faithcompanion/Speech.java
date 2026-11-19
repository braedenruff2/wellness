package app.faithcompanion;

import java.util.ArrayList;
import java.util.List;

/** The plain-Java parts of the voices (tested in tests/java/.../SpeechTest.java): sentences, silence trimming, resampling,
 *  and cleaning text for the Tagalog voice. */
final class Speech {
    private Speech() { }

    /** Sentences to make one at a time (so the first is heard soon); very short bits join the next one. */
    static List<String> sentences(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        String[] raw = text.trim().split("(?<=[.!?…;:])\\s+|\\s*\\n+\\s*");
        StringBuilder cur = new StringBuilder();
        for (String r : raw) {
            String s = r.trim(); if (s.isEmpty()) continue;
            if (cur.length() > 0) cur.append(' ');
            cur.append(s);
            if (cur.length() >= 12) { out.add(cur.toString()); cur.setLength(0); }
        }
        if (cur.length() > 0) {
            if (!out.isEmpty() && cur.length() < 12) out.set(out.size() - 1, out.get(out.size() - 1) + " " + cur);
            else out.add(cur.toString());
        }
        // a very long sentence (a run-on prayer line) is cut at commas so the first words come quickly
        List<String> fin = new ArrayList<>();
        for (String s : out) {
            if (s.length() <= 260) { fin.add(s); continue; }
            StringBuilder b = new StringBuilder();
            for (String p : s.split("(?<=,)\\s+")) {
                if (b.length() > 0 && b.length() + p.length() > 200) { fin.add(b.toString()); b.setLength(0); }
                if (b.length() > 0) b.append(' ');
                b.append(p);
            }
            if (b.length() > 0) fin.add(b.toString());
        }
        return fin;
    }

    /** The voices pad speech with silence: keep a natural sliver so sentences run on like speech. */
    static float[] trim(float[] s, int rate) {
        if (s == null || s.length == 0) return s;
        final float quiet = 0.004f;
        int first = 0, last = s.length - 1;
        while (first < s.length && Math.abs(s[first]) < quiet) first++;
        while (last > first && Math.abs(s[last]) < quiet) last--;
        if (first >= last) return s;
        int from = Math.max(0, first - rate * 60 / 1000);
        int to = Math.min(s.length, last + 1 + rate * 220 / 1000);
        float[] out = new float[to - from];
        System.arraycopy(s, from, out, 0, out.length);
        return out;
    }

    static float[] resample(float[] x, int from, int to) {
        if (from == to || x.length == 0) return x;
        float[] y = new float[(int) ((long) x.length * to / from)];
        for (int j = 0; j < y.length; j++) {
            double p = (double) j * from / to; int q = (int) p; double f = p - q;
            y[j] = (float) (x[Math.min(q, x.length - 1)] * (1 - f) + x[Math.min(q + 1, x.length - 1)] * f);
        }
        return y;
    }

    /** MMS Tagalog reads lower-case letters, spaces, ' and -: everything else (punctuation, quotes) is dropped, and
     *  "ng"/"mga" stay as written (it was trained on ordinary Tagalog spelling). */
    static String forTagalog(String s) {
        String t = s.toLowerCase(java.util.Locale.ROOT).replace('’', '\'').replace('‘', '\'');
        t = java.text.Normalizer.normalize(t, java.text.Normalizer.Form.NFC);
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == 'ñ' || c == '\'' || c == '-' || c == ' ') b.append(c);
            else if (c == 'á' || c == 'à' || c == 'â') b.append('a');
            else if (c == 'é' || c == 'è' || c == 'ê') b.append('e');
            else if (c == 'í' || c == 'ì' || c == 'î') b.append('i');
            else if (c == 'ó' || c == 'ò' || c == 'ô') b.append('o');
            else if (c == 'ú' || c == 'ù' || c == 'û') b.append('u');
            else b.append(' ');
        }
        return b.toString().replaceAll("\\s+", " ").trim();
    }
}
