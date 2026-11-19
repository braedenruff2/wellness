package app.faithcompanion;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.media.PlaybackParams;
import android.util.Log;

import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * The voices Braeden built for Loudbook, in Wellness (not Gemini):
 *  - English: Loudbook's PC voice when at home (the natural Chatterbox voice on his graphics card, through the PC link,
 *    which asks Loudbook's PC voice on the same PC), else Kokoro on the phone (sherpa-onnx, as in Loudbook);
 *  - Tagalog: Meta's MMS Tagalog voice (VITS) on the phone, a real Filipino voice instead of the phone's standard one.
 * Each falls back to the phone's own voice (Android TextToSpeech, in MainActivity) when it isn't there (not downloaded
 * yet, still loading, or failing). The big files are downloaded once: from the PC (at home), else Kokoro from Loudbook's
 * public GitHub release. Speech is made a sentence ahead while the one before plays.
 */
final class Voices {
    static final String TAG = "Wellness";
    static final String KOKORO_URL = "https://github.com/braedenruff2/loudbook/releases/download/voice-1/";
    /** Kokoro's big files and their sizes (as Loudbook's Voice.PACK). */
    static final String[][] KOKORO = {{"model.onnx", "325560556"}, {"voices.bin", "28200960"}};
    /** Calm voices first (Kokoro speaker numbers, as Loudbook's VoiceNames). Default: Nicole, soft. */
    static final String[][] SPEAKERS = {
        {"6", "Nicole (soft, calm)"}, {"3", "Heart"}, {"2", "Bella"}, {"21", "Emma (UK)"}, {"9", "Sarah"}, {"1", "Aoede"},
        {"16", "Michael"}, {"26", "George (UK)"}, {"25", "Fable (UK)"}, {"14", "Fenrir"}, {"18", "Puck"}};

    interface Fallback { void speak(String text, String id, float rate, String lang); }
    interface Done { void done(String id); }
    interface PcSource { PcLink link(); }

    private final Context app;
    private final Fallback fallback;
    private final Done doneCb;
    private final PcSource pcSource;
    private volatile OfflineTts kokoro, tagalog;
    private volatile boolean loadingK, loadingT;
    volatile String downloading = "", progress = "", error = "", lastSource = "";
    private volatile long pcRetryAt = 0;
    private volatile int gen = 0;
    private volatile AudioTrack track;

    Voices(Context c, Fallback f, Done d, PcSource pc) { app = c.getApplicationContext(); fallback = f; doneCb = d; pcSource = pc; }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("voice", Context.MODE_PRIVATE); }
    SharedPreferences prefs() { return prefs(app); }
    int sid() { return prefs().getInt("sid", 6); }

    File dir(String pack) { return new File(new File(app.getFilesDir(), "voice"), pack); }
    boolean kokoroFiles() { for (String[] f : KOKORO) if (new File(dir("kokoro"), f[0]).length() != Long.parseLong(f[1])) return false; return true; }
    boolean tagalogFiles() { return new File(dir("tagalog"), "model.onnx").length() > 1_000_000 && new File(dir("tagalog"), ".done").exists(); }

    /** For the Settings page. */
    String status() {
        SharedPreferences p = prefs();
        return "{\"english\":" + PcLink.quote(p.getString("english", "nice")) + ",\"tagalog\":" + PcLink.quote(p.getString("tagalog", "nice"))
            + ",\"pcVoice\":" + p.getBoolean("pcVoice", true) + ",\"sid\":" + sid()
            + ",\"kokoro\":" + PcLink.quote(kokoro != null ? "ready" : loadingK ? "loading" : kokoroFiles() ? "downloaded" : "missing")
            + ",\"tagalogVoice\":" + PcLink.quote(tagalog != null ? "ready" : loadingT ? "loading" : tagalogFiles() ? "downloaded" : "missing")
            + ",\"downloading\":" + PcLink.quote(downloading) + ",\"progress\":" + PcLink.quote(progress) + ",\"error\":" + PcLink.quote(error)
            + ",\"last\":" + PcLink.quote(lastSource) + ",\"speakers\":" + speakersJson() + "}";
    }
    static String speakersJson() {
        StringBuilder b = new StringBuilder("[");
        for (String[] s : SPEAKERS) { if (b.length() > 1) b.append(','); b.append("{\"sid\":").append(s[0]).append(",\"name\":").append(PcLink.quote(s[1])).append('}'); }
        return b.append(']').toString();
    }

    void set(String key, String value) {
        SharedPreferences.Editor e = prefs().edit();
        if (key.equals("sid")) { try { e.putInt("sid", Integer.parseInt(value)); } catch (NumberFormatException ignored) { } }
        else if (key.equals("pcVoice")) { e.putBoolean("pcVoice", "true".equals(value)); pcRetryAt = 0; }
        else if (key.equals("english") || key.equals("tagalog")) e.putString(key, "phone".equals(value) ? "phone" : "nice");
        e.apply();
    }

    // ---------------------------------------------------------------- loading
    /** Loads whatever is downloaded (off the main thread; Kokoro takes a few seconds). */
    void loadAsync() {
        if (kokoro == null && !loadingK && kokoroFiles()) { loadingK = true; new Thread(() -> {
            try { kokoro = new OfflineTts(kokoroConfig()); kokoro.generate("Ready.", sid(), 1.0f); }
            catch (Throwable t) { Log.w(TAG, "Kokoro didn't load", t); error = "Kokoro didn't load: " + t.getMessage(); }
            finally { loadingK = false; }
        }, "wl-kokoro").start(); }
        if (tagalog == null && !loadingT && tagalogFiles()) { loadingT = true; new Thread(() -> {
            try { tagalog = new OfflineTts(tagalogConfig()); }
            catch (Throwable t) { Log.w(TAG, "Tagalog voice didn't load", t); error = "The Tagalog voice didn't load: " + t.getMessage(); }
            finally { loadingT = false; }
        }, "wl-tagalog").start(); }
    }

    private OfflineTtsConfig kokoroConfig() throws IOException {
        String small = copyAssetDir("kokoro");
        File d = dir("kokoro");
        OfflineTtsKokoroModelConfig k = OfflineTtsKokoroModelConfig.builder().setModel(new File(d, "model.onnx").getPath())
            .setVoices(new File(d, "voices.bin").getPath()).setTokens(small + "/tokens.txt").setLexicon(small + "/lexicon-us-en.txt")
            .setDataDir(small + "/espeak-ng-data").build();
        OfflineTtsModelConfig m = OfflineTtsModelConfig.builder().setKokoro(k).setNumThreads(threads()).setDebug(false).setProvider("cpu").build();
        return OfflineTtsConfig.builder().setModel(m).setMaxNumSentences(1).build();
    }
    private OfflineTtsConfig tagalogConfig() throws IOException {
        String small = copyAssetDir("mms-tgl");
        OfflineTtsVitsModelConfig v = OfflineTtsVitsModelConfig.builder().setModel(new File(dir("tagalog"), "model.onnx").getPath())
            .setTokens(small + "/tokens.txt").build();
        OfflineTtsModelConfig m = OfflineTtsModelConfig.builder().setVits(v).setNumThreads(threads()).setDebug(false).setProvider("cpu").build();
        return OfflineTtsConfig.builder().setModel(m).setMaxNumSentences(1).build();
    }
    static int threads() { return Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() / 2)); }

    private String copyAssetDir(String name) throws IOException {
        File dest = new File(new File(app.getFilesDir(), "voice-assets"), name);
        File mark = new File(dest, ".copied-" + Updater.installedCode(app));
        if (!mark.exists()) { copy(app.getAssets(), name, dest); mark.createNewFile(); }
        return dest.getAbsolutePath();
    }
    private static void copy(AssetManager am, String path, File dest) throws IOException {
        String[] kids = am.list(path);
        if (kids == null || kids.length == 0) {
            dest.getParentFile().mkdirs();
            File tmp = new File(dest.getParentFile(), dest.getName() + ".part");
            try (InputStream in = am.open(path); OutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            if (!tmp.renameTo(dest)) throw new IOException("can't replace " + dest);
            return;
        }
        dest.mkdirs();
        for (String k : kids) copy(am, path + "/" + k, new File(dest, k));
    }

    // ---------------------------------------------------------------- downloading (once)
    /** Downloads a voice ("kokoro" or "tagalog") in the background: from the PC first, else (Kokoro) Loudbook's GitHub. */
    void download(final String pack, final Runnable changed) {
        if (!downloading.isEmpty()) return;
        downloading = pack; progress = ""; error = "";
        new Thread(() -> {
            try {
                PcLink pc = pcSource.link();
                File d = dir(pack); d.mkdirs();
                if (pack.equals("kokoro")) {
                    long all = 0, done = 0; for (String[] f : KOKORO) all += Long.parseLong(f[1]);
                    for (String[] f : KOKORO) {
                        File out = new File(d, f[0]);
                        long size = Long.parseLong(f[1]);
                        if (out.length() != size) fetch(pc, "kokoro", f[0], KOKORO_URL + f[0], out, done, all, changed);
                        if (out.length() != size) { out.delete(); throw new IOException(f[0] + " came out the wrong size"); }
                        done += size;
                    }
                } else {
                    if (pc == null) throw new IOException("the Tagalog voice comes from your PC: pair the PC link first (Settings > PC link)");
                    File out = new File(d, "model.onnx"); new File(d, ".done").delete();
                    fetch(pc, "tagalog", "model.onnx", null, out, 0, 0, changed);
                    new File(d, ".done").createNewFile();
                }
                loadAsync();
            } catch (Exception e) { error = "Download stopped: " + e.getMessage(); Log.w(TAG, "voice download", e); }
            finally { downloading = ""; progress = ""; changed.run(); }
        }, "wl-voice-download").start();
    }

    private void fetch(PcLink pc, String pack, String name, String url, File out, long base, long all, Runnable changed) throws IOException {
        File part = new File(out.getPath() + ".part");
        IOException last = null;
        for (int src = 0; src < 2; src++) {
            if (src == 0 && pc == null) continue;
            if (src == 1 && url == null) break;
            try (OutputStream o = new Counting(new FileOutputStream(part), base, all, changed)) {
                if (src == 0) pc.download("/v1/voice/get?pack=" + pack + "&f=" + name, o, 120000);
                else Updater.download(url, o);
            } catch (IOException e) { last = e; continue; }
            if (!part.renameTo(out)) throw new IOException("couldn't keep " + name);
            return;
        }
        part.delete();
        throw last != null ? last : new IOException("no place to download it from (pair the PC link, or connect to the internet)");
    }

    private final class Counting extends java.io.FilterOutputStream {
        long n; final long base, all; final Runnable changed; long shown;
        Counting(OutputStream o, long base, long all, Runnable changed) { super(o); this.base = base; this.all = all; this.changed = changed; }
        @Override public void write(byte[] b, int off, int len) throws IOException {
            out.write(b, off, len); n += len;
            if (n - shown > 4_000_000) { shown = n; progress = all > 0 ? (100 * (base + n) / all) + "%" : (n >> 20) + " MB"; changed.run(); }
        }
    }

    // ---------------------------------------------------------------- speaking
    /** Whether the nice voices will take this (else the phone's voice does). lang: "" English, "fil-PH" Tagalog. */
    boolean takes(String lang) {
        boolean tl = lang != null && (lang.startsWith("fil") || lang.startsWith("tl"));
        if (tl) return "nice".equals(prefs().getString("tagalog", "nice")) && tagalog != null;
        if (lang != null && !lang.isEmpty() && !lang.startsWith("en")) return false;
        if (!"nice".equals(prefs().getString("english", "nice"))) return false;
        return kokoro != null || pcUsable();
    }
    private boolean pcUsable() { return prefs().getBoolean("pcVoice", true) && pcSource.link() != null && System.currentTimeMillis() >= pcRetryAt; }

    static final class Clip { final float[] s; final int rate; final float play; Clip(float[] s, int r, float p) { this.s = s; rate = r; play = p; } }

    /** Says text (sentence by sentence, the next one made while this one plays); calls done(id) at the end. */
    void say(final String text, final String id, final float rate, final String lang) {
        stop();
        final int my = ++gen;
        final boolean tl = lang != null && (lang.startsWith("fil") || lang.startsWith("tl"));
        final List<String> parts = Speech.sentences(text);
        final LinkedBlockingQueue<Object> q = new LinkedBlockingQueue<>(3);
        final Object END = new Object();
        new Thread(() -> {                                     // makes the speech
            try {
                for (int i = 0; i < parts.size(); i++) {
                    if (gen != my) return;
                    Clip c = make(parts.get(i), rate, tl);
                    if (c == null) {                           // nothing could make it: the phone's voice says the rest
                        StringBuilder rest = new StringBuilder();
                        for (int k = i; k < parts.size(); k++) rest.append(parts.get(k)).append(' ');
                        q.put(new String[]{rest.toString().trim()});
                        break;
                    }
                    q.put(c);
                }
                q.put(END);
            } catch (InterruptedException ignored) { }
        }, "wl-voice-make").start();
        new Thread(() -> {                                     // plays it
            AudioTrack t = null; int trackRate = 0; long written = 0;
            try {
                while (gen == my) {
                    Object o = q.poll(200, TimeUnit.MILLISECONDS);
                    if (o == null) continue;
                    if (o == END) break;
                    if (o instanceof String[]) {
                        waitPlayed(t, written, my);
                        if (gen == my) fallback.speak(((String[]) o)[0], id, rate, lang); // (it calls done itself)
                        return;
                    }
                    Clip c = (Clip) o;
                    if (t == null) { trackRate = c.rate; t = newTrack(trackRate); track = t; setSpeed(t, c.play); t.play(); }
                    float[] s = c.rate == trackRate ? c.s : Speech.resample(c.s, c.rate, trackRate);
                    int off = 0;
                    while (off < s.length && gen == my) { int n = t.write(s, off, Math.min(4096, s.length - off), AudioTrack.WRITE_BLOCKING); if (n <= 0) break; off += n; }
                    written += s.length;
                }
                waitPlayed(t, written, my);
                if (gen == my) doneCb.done(id);
            } catch (Throwable e) {
                Log.w(TAG, "playing failed", e);
                if (gen == my) doneCb.done(id);
            } finally {
                if (t != null) { try { t.stop(); } catch (Throwable ignored) { } t.release(); if (track == t) track = null; }
            }
        }, "wl-voice-play").start();
    }

    private void waitPlayed(AudioTrack t, long frames, int my) throws InterruptedException {
        if (t == null) return;
        long until = System.currentTimeMillis() + 2000 + frames * 1000L / Math.max(1, t.getSampleRate()) * 2;
        while (gen == my && (t.getPlaybackHeadPosition() & 0xffffffffL) < frames && System.currentTimeMillis() < until) Thread.sleep(40);
    }

    /** One sentence: the PC's natural voice (English, at home), else Kokoro / MMS Tagalog here. null: none could. */
    private Clip make(String sentence, float rate, boolean tl) {
        if (!sentence.codePoints().anyMatch(Character::isLetterOrDigit)) return new Clip(new float[4800], 24000, 1f);
        if (tl) {
            OfflineTts v = tagalog; if (v == null) return null;
            try { GeneratedAudio a; synchronized (v) { a = v.generate(Speech.forTagalog(sentence), 0, rate); }
                lastSource = "phone: Tagalog (MMS)"; return new Clip(Speech.trim(a.getSamples(), a.getSampleRate()), a.getSampleRate(), 1f); }
            catch (Throwable e) { Log.w(TAG, "Tagalog voice failed", e); return null; }
        }
        if (pcUsable() && sentence.length() <= 2000) {
            try {
                PcLink.Audio a = pcSource.link().speak(sentence, sid(), rate, kokoro != null ? 8000 : 30000);
                float[] f = new float[a.pcm.length]; for (int i = 0; i < f.length; i++) f[i] = a.pcm[i] / 32768f;
                lastSource = "your PC: " + (a.engine.isEmpty() ? "Loudbook's voice" : a.engine);
                // the natural voice comes at normal speed: it's slowed to his speed as it plays
                return new Clip(Speech.trim(f, a.rate), a.rate, a.madeAt > 0 ? rate / a.madeAt : 1f);
            } catch (Exception e) {
                Log.i(TAG, "PC voice not there (" + e.getMessage() + "): the phone's Kokoro reads");
                pcRetryAt = System.currentTimeMillis() + 60_000;
            }
        }
        OfflineTts k = kokoro; if (k == null) return null;
        try { GeneratedAudio a; synchronized (k) { a = k.generate(sentence, sid(), rate); }
            lastSource = "phone: Kokoro"; return new Clip(Speech.trim(a.getSamples(), a.getSampleRate()), a.getSampleRate(), 1f); }
        catch (Throwable e) { Log.w(TAG, "Kokoro failed", e); return null; }
    }

    private static AudioTrack newTrack(int rate) {
        int min = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT);
        return new AudioTrack.Builder()
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(Math.max(min, rate * 4 / 2)).setTransferMode(AudioTrack.MODE_STREAM).build();
    }
    private static void setSpeed(AudioTrack t, float speed) {
        if (Math.abs(speed - 1f) < 0.02f) return;
        try { t.setPlaybackParams(new PlaybackParams().setSpeed(Math.max(0.5f, Math.min(2f, speed))).setPitch(1f)); } catch (Throwable ignored) { }
    }

    void stop() {
        gen++;
        AudioTrack t = track;
        if (t != null) try { t.pause(); t.flush(); } catch (Throwable ignored) { }
    }
}
