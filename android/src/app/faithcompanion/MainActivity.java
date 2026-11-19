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
 *  and a daily reminder. Nothing is sent over the network. */
public class MainActivity extends Activity {
    private static final int PICK_FILE = 7;
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;
    private final List<String[]> pending = new ArrayList<>();
    private ValueCallback<Uri[]> fileCallback;
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
        setContentView(web);
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
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(i, PICK_FILE); } catch (Exception e) { fileCallback = null; cb.onReceiveValue(null); return false; }
                return true;
            }
        });
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) return;
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
            runOnUiThread(() -> {
                ttsReady = true;
                for (String[] p : pending) speakNow(p[0], p[1], Float.parseFloat(p[2]), p[3]);
                pending.clear();
            });
        });
        registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        // after Android recreates the activity (e.g. split screen), come back to the same screen
        if (saved == null || web.restoreState(saved) == null)
            web.loadUrl("file:///android_asset/www/index.html" + startHash(getIntent()));
    }

    private String startHash(Intent i) {
        return i != null && i.getBooleanExtra("fromReminder", false) ? "#faith/today" : "";
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        if (i != null && i.getBooleanExtra("fromReminder", false)) web.evaluateJavascript("location.hash='#faith/today'", null);
    }

    private void done(String id) {
        runOnUiThread(() -> web.evaluateJavascript("window.FCSpeechDone&&FCSpeechDone(" + jsString(id) + ")", null));
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
        useLang(lang);
        tts.setSpeechRate(Math.max(0.5f, Math.min(1.6f, rate)));
        Bundle b = new Bundle();
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, b, id);
    }

    private void goBack() {
        if (web.canGoBack()) web.goBack(); else finish();
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { goBack(); }

    @Override protected void onPause() {
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
        try { unregisterReceiver(noisy); } catch (Exception ignored) { }
        if (tts != null) tts.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK_FILE && fileCallback != null) {
            Uri u = res == RESULT_OK && data != null ? data.getData() : null;
            fileCallback.onReceiveValue(u == null ? null : new Uri[]{u});
            fileCallback = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    private boolean notificationsAllowedNow() {
        android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }

    static String jsString(String s) {
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
            runOnUiThread(() -> {
                if (ttsReady) speakNow(text, id, (float) rate);
                else pending.add(new String[]{text, id, String.valueOf(rate), ""});
            });
        }

        @JavascriptInterface public void speakIn(String text, String id, double rate, String lang) {
            runOnUiThread(() -> {
                if (ttsReady) speakNow(text, id, (float) rate, lang);
                else pending.add(new String[]{text, id, String.valueOf(rate), lang});
            });
        }

        @JavascriptInterface public void stopSpeaking() {
            runOnUiThread(() -> { pending.clear(); if (ttsReady) tts.stop(); });
        }

        @JavascriptInterface public void keepAwake(boolean on) {
            runOnUiThread(() -> {
                Window w = getWindow();
                if (on) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface public void setDark(boolean dark) {
            runOnUiThread(() -> {
                int c = dark ? Color.BLACK : Color.parseColor("#F7F3EC");
                Window w = getWindow();
                w.setStatusBarColor(c);
                w.setNavigationBarColor(c);
                web.setBackgroundColor(c);
                View d = w.getDecorView();
                int f = d.getSystemUiVisibility();
                if (dark) f &= ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                else f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                d.setSystemUiVisibility(f);
            });
        }

        /** Saves a backup into Downloads. Returns where it went (shown to him), or "" on failure. */
        @JavascriptInterface public String saveFile(String name, String text) {
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) return "";
                    try (OutputStream o = getContentResolver().openOutputStream(u)) { o.write(bytes); }
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

        /** False when Android won't show this app's notifications (permission refused or switched off). */
        @JavascriptInterface public boolean notificationsAllowed() {
            android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            return nm == null || nm.areNotificationsEnabled();
        }

        /** hour/minute of the daily reminder; -1 turns it off. */
        @JavascriptInterface public void setReminder(int hour, int minute) {
            runOnUiThread(() -> {
                if (hour >= 0 && Build.VERSION.SDK_INT >= 33
                        && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 3);
                } else if (hour >= 0) {
                    web.evaluateJavascript("window.FCReminderPermission&&FCReminderPermission(" + notificationsAllowedNow() + ")", null);
                }
                Reminder.set(MainActivity.this, hour, minute);
            });
        }
    }
}
