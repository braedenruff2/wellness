package app.faithcompanion;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.database.Cursor;
import android.media.AudioManager;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** A WebView around the app in assets/www, plus the few things a web page can't do well on Android:
 *  the phone's text-to-speech voice, keeping the screen on during a prayer, saving a backup file,
 *  a daily reminder, and the PC link (PcLink: his own PC on home Wi-Fi, HTTPS pinned at pairing). Nothing else
 *  goes over the network except the public Tagalog lesson packs the page downloads. */
public class MainActivity extends Activity {
    private static final int PICK_FILE = 7;
    private static final int PICK_SYNC = 8;
    private static final int PICK_ANSWERS = 9;
    private static final int PICK_RESTORE = 10;
    private WebView web;
    /** The activity on screen (or null), so a "Done" tapped on a to-do notification reaches an open page at once. */
    private static java.lang.ref.WeakReference<MainActivity> shown = new java.lang.ref.WeakReference<>(null);
    static void todoTicked() {
        MainActivity a = shown.get();
        if (a != null) a.runOnUiThread(() -> { if (a.web != null) a.web.evaluateJavascript("window.FCTodoTicked&&FCTodoTicked()", null); });
    }
    private android.widget.FrameLayout root;
    private TextToSpeech tts;
    private boolean ttsReady;
    private volatile boolean destroyed;
    private final List<String[]> pending = new ArrayList<>();
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraPhotoUri;
    private boolean ownScreenOnTop; // set when the app opens something over itself; cleared when it comes back
    /** Loudbook's voices (Kokoro, the PC's natural voice) and the Tagalog voice; the phone's own voice when they can't. */
    private Voices voices;
    /** Headphones unplugged or Bluetooth dropped: pause, so the voice doesn't carry on out of the speaker. */
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (web != null) web.evaluateJavascript("window.FCPauseSession&&FCPauseSession()", null);
        }
    };

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F7F3EC"));
        // Android 15 draws apps edge to edge, under the clock/notifications and the gesture bar: keep the page inside the
        // safe area (and above the keyboard), with the same colour behind the bars
        root = new android.widget.FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F7F3EC"));
        root.addView(web, new android.widget.FrameLayout.LayoutParams(-1, -1));
        root.setOnApplyWindowInsetsListener((v, in) -> {
            int[] p = Insets.of(in);
            v.setPadding(p[0], p[1], p[2], p[3]);
            return in;
        });
        setContentView(root);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(), "FCAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("file".equals(u.getScheme())) return false;
                // links to the outside world (none yet) open in the browser, never inside the app
                try { ownScreenOnTop = true; startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { ownScreenOnTop = false; }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                cameraPhotoUri = null;
                boolean wantImage = false;
                if (p != null && p.getAcceptTypes() != null) {
                    for (String t : p.getAcceptTypes()) { if (t != null && t.toLowerCase(Locale.US).startsWith("image/")) { wantImage = true; break; } }
                }
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType(wantImage ? "image/*" : "*/*");
                Intent launch = pick;
                if (wantImage) {
                    try {
                        ContentValues cv = new ContentValues();
                        cv.put(MediaStore.Images.Media.DISPLAY_NAME, "wellness-fridge-" + System.currentTimeMillis() + ".jpg");
                        cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                        Uri camUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                        if (camUri != null) {
                            Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                            cam.putExtra(MediaStore.EXTRA_OUTPUT, camUri);
                            if (cam.resolveActivity(getPackageManager()) != null) {
                                cameraPhotoUri = camUri;
                                Intent chooser = Intent.createChooser(pick, "Choose or take a photo");
                                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
                                launch = chooser;
                            } else {
                                getContentResolver().delete(camUri, null, null);
                            }
                        }
                    } catch (Exception ignored) { cameraPhotoUri = null; }
                }
                try { ownScreenOnTop = true; startActivityForResult(launch, PICK_FILE); } catch (Exception e) {
                    ownScreenOnTop = false;
                    if (cameraPhotoUri != null) { try { getContentResolver().delete(cameraPhotoUri, null, null); } catch (Exception ignored) { } cameraPhotoUri = null; }
                    fileCallback = null; cb.onReceiveValue(null); return false;
                }
                return true;
            }
        });
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS || destroyed) return;
            runOnUiThread(() -> {
                if (destroyed || tts == null) return;
                defaultLocale = Locale.getDefault().getLanguage().equals("en") ? Locale.getDefault() : Locale.US;
                tts.setLanguage(defaultLocale);
                tts.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { }
                    @Override public void onDone(String id) { done(id); }
                    @Override public void onError(String id) { done(id); }
                    @Override public void onStop(String id, boolean interrupted) { }
                });
                ttsReady = true;
                for (String[] p : pending) speakNow(p[0], p[1], Float.parseFloat(p[2]), p[3]);
                pending.clear();
            });
        });
        voices = new Voices(this,
            (text, id, rate, lang) -> runOnUiThread(() -> {
                if (ttsReady) speakNow(text, id, rate, lang == null ? "" : lang);
                else pending.add(new String[]{text, id, String.valueOf(rate), lang == null ? "" : lang});
            }),
            this::done, this::pcLink);
        voices.loadAsync();
        registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        // after Android recreates the activity (e.g. split screen), come back to the same screen
        if (saved == null || web.restoreState(saved) == null)
            web.loadUrl("file:///android_asset/www/index.html" + startHash(getIntent()));
    }

    private String startHash(Intent i) {
        String h = openHash(i);
        if (h != null) return h;
        return i != null && i.getBooleanExtra("fromReminder", false) ? "#faith/today" : "";
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        if (web == null) return;
        if (i != null && i.getBooleanExtra("fromReminder", false)) web.evaluateJavascript("location.hash='#faith/today'", null);
        String h = openHash(i);
        if (h != null) web.evaluateJavascript("location.hash='" + h + "'", null);
    }

    /** The screen a notification asks for (only these, never a hash from elsewhere). */
    private static String openHash(Intent i) { return CalmAlarm.allowedHash(i == null ? null : i.getStringExtra("openHash")); }

    private void done(String id) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCSpeechDone&&FCSpeechDone(" + jsString(id) + ")", null); });
    }

    private Locale defaultLocale = Locale.US;
    private String currentLang = "";

    /** Switch the voice's language only when it changes ("" = the phone's English). Filipino: fil-PH, else tl-PH. */
    private void useLang(String lang) {
        if (lang == null) lang = "";
        if (lang.equals(currentLang)) return;
        Locale l = defaultLocale;
        if (!lang.isEmpty()) {
            for (String tag : new String[]{lang, "fil-PH", "tl-PH"}) {
                Locale c = Locale.forLanguageTag(tag);
                if (tts.isLanguageAvailable(c) >= TextToSpeech.LANG_AVAILABLE) { l = c; break; }
            }
        }
        tts.setLanguage(l);
        currentLang = lang;
    }

    private void speakNow(String text, String id, float rate) { speakNow(text, id, rate, ""); }

    private void speakNow(String text, String id, float rate, String lang) {
        if (tts == null || !ttsReady) return;
        useLang(lang);
        tts.setSpeechRate(Math.max(0.5f, Math.min(1.6f, rate)));
        Bundle b = new Bundle();
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, b, id);
    }

    /** Back asks the page first (window.FCBack: a dark screen only lights up, so a sit or prayer isn't ended). */
    private void goBack() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("window.FCBack&&FCBack()", v -> {
            if (CalmAlarm.backHandled(v)) return;
            if (web != null && web.canGoBack()) web.goBack(); else finish();
        });
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { goBack(); }

    /** True while a guided session is on screen (the page says so): an update never cuts one off. */
    private volatile boolean sessionBusy;
    private final Updater.Listener updateListener = () -> runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCUpdateState&&FCUpdateState()", null); });

    @Override protected void onResume() {
        super.onResume();
        ownScreenOnTop = false;
        RestAlarm.appVisible = true;
        RestAlarm.cancelShown(this);
        CalmAlarm.appVisible = true;
        CalmAlarm.cancelShown(this);
        shown = new java.lang.ref.WeakReference<>(this);
        if (web != null) web.evaluateJavascript("window.FCTodoTicked&&FCTodoTicked()", null);
        Updater.check(getApplicationContext(), pcLink(), false, updateListener);
    }

    @Override protected void onStop() {
        super.onStop();
        // install a downloaded update while he's away from the app (it restarts the app)
        // not while the app has its own screen on top (the backup file picker, a link): the restart would lose it
        if (!sessionBusy && !isChangingConfigurations() && !ownScreenOnTop && fileCallback == null && Updater.readyCode(this) > 0 && Updater.mayInstall(this)) {
            final Context app = getApplicationContext();
            new Thread(() -> Updater.install(app), "wl-update-install").start();
        }
    }

    @Override protected void onPause() {
        RestAlarm.appVisible = false;
        CalmAlarm.appVisible = false;
        if (shown.get() == this) shown = new java.lang.ref.WeakReference<>(null);
        if (web != null) web.evaluateJavascript("window.FCSaveNow&&FCSaveNow()", null);
        super.onPause();
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req == 3 && web != null) {
            boolean ok = res.length > 0 && res[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
            web.evaluateJavascript("window.FCReminderPermission&&FCReminderPermission(" + ok + ")", null);
        }
    }

    @Override protected void onDestroy() {
        destroyed = true;
        ttsReady = false;
        pending.clear();
        try { unregisterReceiver(noisy); } catch (Exception ignored) { }
        if (voices != null) voices.stop();
        TextToSpeech t = tts; tts = null;
        if (t != null) t.shutdown();
        WebView w = web; web = null;
        if (w != null) w.destroy();
        super.onDestroy();
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK_FILE && fileCallback != null) {
            ownScreenOnTop = false;
            Uri u = res == RESULT_OK && data != null ? data.getData() : null;
            if (u == null && res == RESULT_OK && cameraPhotoUri != null) {
                u = cameraPhotoUri;
            } else if (cameraPhotoUri != null) {
                try { getContentResolver().delete(cameraPhotoUri, null, null); } catch (Exception ignored) { }
            }
            cameraPhotoUri = null;
            fileCallback.onReceiveValue(u == null ? null : new Uri[]{u});
            fileCallback = null;
            return;
        }
        if (req == PICK_SYNC) {
            ownScreenOnTop = false;
            boolean picked = false;
            if (res == RESULT_OK && data != null && data.getData() != null) {
                picked = Sync.savePicked(this, data.getData(), data.getFlags()).isEmpty();
            }
            final boolean ok = picked;
            runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCSyncState&&FCSyncState(" + ok + ")", null); });
            return;
        }
        if (req == PICK_ANSWERS) {
            ownScreenOnTop = false;
            boolean picked = false;
            if (res == RESULT_OK && data != null && data.getData() != null) {
                picked = Sync.savePickedAnswers(this, data.getData(), data.getFlags()).isEmpty();
            }
            final boolean ok = picked;
            runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCSyncState&&FCSyncState(" + ok + ")", null); });
            return;
        }
        if (req == PICK_RESTORE) {
            ownScreenOnTop = false;
            if (res != RESULT_OK || data == null || data.getData() == null) return;
            final Uri uri = data.getData();
            final Context app = getApplicationContext();
            new Thread(() -> {
                boolean ok = true; String out; String name = Sync.DEFAULT_NAME;
                try {
                    name = Sync.displayName(app, uri, Sync.DEFAULT_NAME);
                    out = Sync.readUri(app, uri);
                } catch (Exception e) {
                    ok = false; out = e.getMessage() == null ? e.toString() : e.getMessage();
                }
                final boolean fOk = ok; final String fOut = out; final String fName = name;
                runOnUiThread(() -> {
                    if (web != null) web.evaluateJavascript("window.FCSyncRestore&&FCSyncRestore(" + fOk + "," + jsString(fOut) + "," + jsString(fName) + ")", null);
                });
            }, "wl-sync-restore").start();
            return;
        }
        super.onActivityResult(req, res, data);
    }

    private boolean notificationsAllowedNow() {
        android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }

    // ---------------------------------------------------------------- PC link (kept in private app storage)
    private PcLink pcLink() {
        android.content.SharedPreferences p = getSharedPreferences("pc", MODE_PRIVATE);
        String h = p.getString("host", null), fp = p.getString("fp", null), t = p.getString("token", null);
        if (h == null || fp == null || t == null) return null;
        return new PcLink(h, p.getInt("port", PcLink.PORT), fp, t, p.getString("name", h));
    }

    String pcDo(String op, String a, String b) throws java.io.IOException {
        if ("find".equals(op)) return PcLink.discover(1500, PcLink.PORT);
        if ("pair".equals(op)) {
            String host = a.trim(); int port = PcLink.PORT;
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("^([^:\\[\\]]+):(\\d+)$").matcher(host);
            if (m.matches()) { host = m.group(1); port = Integer.parseInt(m.group(2)); }
            PcLink l = PcLink.pair(host, port, b, Build.MODEL == null ? "phone" : Build.MODEL);
            getSharedPreferences("pc", MODE_PRIVATE).edit().putString("host", l.host).putInt("port", l.port).putString("fp", l.fp)
                .putString("token", l.token).putString("name", l.name).apply();
            return "{\"paired\":true}";
        }
        if ("forget".equals(op)) { getSharedPreferences("pc", MODE_PRIVATE).edit().clear().apply(); return "{}"; }
        PcLink l = pcLink();
        if (l == null) throw new java.io.IOException("not paired with the PC");
        if (a == null || !a.startsWith("/v1/")) throw new java.io.IOException("bad path");
        if ("get".equals(op)) return l.get(a, 15000);
        if ("post".equals(op)) return l.post(a, b, 30000);
        throw new java.io.IOException("unknown request");
    }

    static String jsString(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 32 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    /** Called from the page as window.FCAndroid.* (on a background thread). */
    class Bridge {
        @JavascriptInterface public void speak(String text, String id, double rate) {
            if (voices != null && voices.takes("")) { runOnUiThread(() -> { if (ttsReady) tts.stop(); }); voices.say(text, id, (float) rate, ""); return; }
            if (voices != null) voices.stop(); // an old sentence still playing must not replace this one
            runOnUiThread(() -> {
                if (ttsReady) speakNow(text, id, (float) rate);
                else pending.add(new String[]{text, id, String.valueOf(rate), ""});
            });
        }

        @JavascriptInterface public void speakIn(String text, String id, double rate, String lang) {
            if (voices != null && voices.takes(lang)) { runOnUiThread(() -> { if (ttsReady) tts.stop(); }); voices.say(text, id, (float) rate, lang); return; }
            if (voices != null) voices.stop();
            runOnUiThread(() -> {
                if (ttsReady) speakNow(text, id, (float) rate, lang);
                else pending.add(new String[]{text, id, String.valueOf(rate), lang});
            });
        }

        @JavascriptInterface public void stopSpeaking() {
            if (voices != null) voices.stop();
            runOnUiThread(() -> { pending.clear(); if (ttsReady) tts.stop(); });
        }

        // ---- voices (Settings > Voice)
        @JavascriptInterface public String voiceStatus() { return voices == null ? "{}" : voices.status(); }
        @JavascriptInterface public void voiceSet(String key, String value) { if (voices != null) voices.set(key, value); }
        @JavascriptInterface public void voiceDownload(String pack) {
            if (voices != null) voices.download(pack, () -> runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCVoiceState&&FCVoiceState()", null); }));
        }
        /** "nice" when Loudbook's voices read English now (it can take a moment longer to start than the phone's). */
        @JavascriptInterface public String voiceKind() { return voices != null && voices.takes("") ? "nice" : "phone"; }

        @JavascriptInterface public void keepAwake(boolean on) {
            runOnUiThread(() -> {
                Window w = getWindow();
                if (on) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** A dark screen during a Calm sit: brightness right down while the page shows black (true), or the phone's own (false). */
        @JavascriptInterface public void dimScreen(boolean on) {
            runOnUiThread(() -> {
                Window w = getWindow();
                WindowManager.LayoutParams lp = w.getAttributes();
                lp.screenBrightness = on ? 0.01f : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                w.setAttributes(lp);
            });
        }

        @JavascriptInterface public void setDark(boolean dark) {
            runOnUiThread(() -> {
                if (destroyed) return;
                int c = dark ? Color.BLACK : Color.parseColor("#F7F3EC");
                Window w = getWindow();
                w.setStatusBarColor(c);
                w.setNavigationBarColor(c);
                if (web != null) web.setBackgroundColor(c);
                if (root != null) root.setBackgroundColor(c);
                View d = w.getDecorView();
                int f = d.getSystemUiVisibility();
                if (dark) f &= ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                else f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                d.setSystemUiVisibility(f);
            });
        }

        /** Saves a backup (or a text export) into Downloads. Returns where it went (shown to him), or "" on failure. */
        @JavascriptInterface public String saveFile(String name, String text) {
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, Sync.mimeFor(name));
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) return "";
                    try (OutputStream o = getContentResolver().openOutputStream(u)) {
                        if (o == null) throw new java.io.IOException("could not open download");
                        o.write(bytes);
                    } catch (Exception e) {
                        try { getContentResolver().delete(u, null, null); } catch (Exception ignored) { }
                        throw e;
                    }
                    String shown = name; // Android may have renamed it, e.g. "name (1).json"
                    try (Cursor c = getContentResolver().query(u, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
                        if (c != null && c.moveToFirst() && c.getString(0) != null) shown = c.getString(0);
                    } catch (Exception ignored) { }
                    return "Downloads/" + shown;
                }
                File f = new File(getExternalFilesDir(null), name);
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(bytes); }
                return f.getAbsolutePath();
            } catch (Exception e) {
                return "";
            }
        }

        /** Google Drive sync (Sync.java): SAF document picker, read, write, forget. */
        @JavascriptInterface public String syncStatus() { return Sync.status(getApplicationContext()); }
        @JavascriptInterface public void syncPick() {
            runOnUiThread(() -> {
                try { ownScreenOnTop = true; startActivityForResult(Sync.pickIntent(), PICK_SYNC); }
                catch (Exception e) {
                    ownScreenOnTop = false;
                    Sync.setError(getApplicationContext(), Sync.friendlyError(e, true));
                    if (web != null) web.evaluateJavascript("window.FCSyncState&&FCSyncState(false)", null);
                }
            });
        }
        @JavascriptInterface public void syncForget() {
            Sync.forget(getApplicationContext());
            runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCSyncState&&FCSyncState(false)", null); });
        }
        @JavascriptInterface public void syncRead(String id) {
            final Context app = getApplicationContext();
            new Thread(() -> {
                boolean ok = true; String out;
                try { out = Sync.read(app); }
                catch (Exception e) { ok = false; out = e.getMessage() == null ? e.toString() : e.getMessage(); }
                final boolean fOk = ok; final String fOut = out;
                runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCSyncDone&&FCSyncDone(" + jsString(id) + "," + fOk + "," + jsString(fOut) + ")", null); });
            }, "wl-sync-read").start();
        }
        @JavascriptInterface public void syncWrite(String id, String text) {
            final Context app = getApplicationContext();
            new Thread(() -> {
                boolean ok = true; String out = "";
                try { Sync.write(app, text); }
                catch (Exception e) { ok = false; out = e.getMessage() == null ? e.toString() : e.getMessage(); }
                final boolean fOk = ok; final String fOut = out;
                runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCSyncDone&&FCSyncDone(" + jsString(id) + "," + fOk + "," + jsString(fOut) + ")", null); });
            }, "wl-sync-write").start();
        }
        /** Cloud answers Google Sheet (Sync.java): virtual-file CSV export, read-only SAF grant. */
        @JavascriptInterface public void syncPickAnswers() {
            runOnUiThread(() -> {
                try { ownScreenOnTop = true; startActivityForResult(Sync.pickAnswersIntent(), PICK_ANSWERS); }
                catch (Exception e) {
                    ownScreenOnTop = false;
                    Sync.setAnswersError(getApplicationContext(), Sync.friendlyAnswersError(e));
                    if (web != null) web.evaluateJavascript("window.FCSyncState&&FCSyncState(false)", null);
                }
            });
        }
        @JavascriptInterface public void syncForgetAnswers() {
            Sync.forgetAnswers(getApplicationContext());
            runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCSyncState&&FCSyncState(false)", null); });
        }
        @JavascriptInterface public void syncReadAnswers(String id) {
            final Context app = getApplicationContext();
            new Thread(() -> {
                boolean ok = true; String out;
                try { out = Sync.readAnswers(app); }
                catch (Exception e) { ok = false; out = e.getMessage() == null ? e.toString() : e.getMessage(); }
                final boolean fOk = ok; final String fOut = out;
                runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCSyncDone&&FCSyncDone(" + jsString(id) + "," + fOk + "," + jsString(fOut) + ")", null); });
            }, "wl-sync-answers").start();
        }
        /** Pick an existing wellness-sync.json from Google Drive to restore (ACTION_OPEN_DOCUMENT). */
        @JavascriptInterface public void syncPickRestore() {
            runOnUiThread(() -> {
                try { ownScreenOnTop = true; startActivityForResult(Sync.pickRestoreIntent(), PICK_RESTORE); }
                catch (Exception e) {
                    ownScreenOnTop = false;
                    if (web != null) web.evaluateJavascript("window.FCSyncRestore&&FCSyncRestore(false," + jsString(Sync.friendlyError(e, false)) + ",\"\")", null);
                }
            });
        }

        /** False when Android won't show this app's notifications (permission refused or switched off). */
        @JavascriptInterface public boolean notificationsAllowed() {
            android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            return nm == null || nm.areNotificationsEnabled();
        }

        /** The PC link as the page sees it: {"paired":bool,"host","name"} (never the key). */
        @JavascriptInterface public String pcStatus() {
            PcLink l = pcLink();
            return l == null ? "{\"paired\":false}" : "{\"paired\":true,\"host\":" + PcLink.quote(l.host) + ",\"name\":" + PcLink.quote(l.name) + "}";
        }

        /** PC link requests, answered later with window.FCPcDone(id, ok, text). op: find | pair (host, code) | get (path) |
         *  post (path, json) | forget. Paths are the server's /v1/... only. */
        @JavascriptInterface public void pcRequest(String id, String op, String a, String b) {
            new Thread(() -> {
                boolean ok = true; String out;
                try { out = pcDo(op, a, b); }
                catch (Exception e) { ok = false; out = e.getMessage() == null ? e.toString() : e.getMessage(); }
                final boolean fOk = ok; final String fOut = out;
                runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.FCPcDone&&FCPcDone(" + jsString(id) + "," + fOk + "," + jsString(fOut) + ")", null); });
            }, "pc-link").start();
        }

        // ---- app updates (Updater): Settings shows these
        @JavascriptInterface public String updateStatus() { return Updater.status(getApplicationContext()); }
        @JavascriptInterface public void updateCheck() { Updater.check(getApplicationContext(), pcLink(), true, updateListener); }
        @JavascriptInterface public void updateInstall() {
            final Context app = getApplicationContext();
            new Thread(() -> { Updater.install(app); updateListener.onUpdateState(); }, "wl-update-install").start();
        }
        /** Opens Android's "Install unknown apps" switch for this app (once, so updates install by themselves). */
        @JavascriptInterface public void updateAllow() {
            runOnUiThread(() -> {
                try { ownScreenOnTop = true; startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); }
                catch (Exception ignored) { }
            });
        }
        @JavascriptInterface public void setBusy(boolean busy) { sessionBusy = busy; }

        /** The rest timer's end, for when the screen is off (ms from now; 0 cancels). */
        @JavascriptInterface public void restAlarm(double ms, String label) {
            RestAlarm.set(getApplicationContext(), (long) ms, label);
            if (ms > 0 && Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
                    && !getSharedPreferences("asked", MODE_PRIVATE).getBoolean("notif", false)) {
                getSharedPreferences("asked", MODE_PRIVATE).edit().putBoolean("notif", true).apply();
                runOnUiThread(() -> requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 4));
            }
        }

        /** End-of-session bell for Calm meditation sits and the Quiet timer when the screen locks (ms from now; 0 cancels). */
        @JavascriptInterface public void calmAlarm(double ms, String label) {
            CalmAlarm.set(getApplicationContext(), (long) ms, label);
            if (ms > 0 && Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
                    && !getSharedPreferences("asked", MODE_PRIVATE).getBoolean("notif-calm", false)) {
                getSharedPreferences("asked", MODE_PRIVATE).edit().putBoolean("notif-calm", true).apply();
                runOnUiThread(() -> requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 6));
            }
        }

        /** Tasks ticked "Done" on a notification since the page last asked ("ms<TAB>task" lines), handed over once. */
        @JavascriptInterface public String todoTicked() { return TodoAlarm.takeTicked(getApplicationContext()); }

        /** Every coming to-do reminder ("when<TAB>id<TAB>text" lines); "" clears them. */
        @JavascriptInterface public void todoAlarms(String lines) {
            TodoAlarm.set(getApplicationContext(), lines);
            if (TodoAlarm.hasReminders(lines) && Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
                    && !getSharedPreferences("asked", MODE_PRIVATE).getBoolean("notif-todo", false)) {
                getSharedPreferences("asked", MODE_PRIVATE).edit().putBoolean("notif-todo", true).apply();
                runOnUiThread(() -> requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 5));
            }
        }

        /** hour/minute of the daily reminder; -1 turns it off. */
        @JavascriptInterface public void setReminder(int hour, int minute) {
            runOnUiThread(() -> {
                if (hour >= 0 && Build.VERSION.SDK_INT >= 33
                        && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 3);
                } else if (hour >= 0 && web != null) {
                    web.evaluateJavascript("window.FCReminderPermission&&FCReminderPermission(" + notificationsAllowedNow() + ")", null);
                }
                Reminder.set(MainActivity.this, hour, minute);
            });
        }
    }
}
