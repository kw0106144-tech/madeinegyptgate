package com.madeinegyptgate.app;

import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebBackForwardList;
import android.webkit.WebHistoryItem;
import android.webkit.WebView;
import android.widget.ProgressBar;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * The app shows the live site https://madeinegyptgate.com in Capacitor's WebView (capacitor.config.json server.url), so every
 * change of the site is in the app at once. What this activity adds to Capacitor's defaults, so the app behaves like a browser
 * tab (docs: app/README.md "What the app does"):
 * - the back button: one step back in the site's history (skipping the offline page and the page that failed); during a live
 *   call one step of the call's shared screen first, as Chrome; on the first page «الخروج من التطبيق؟» / "Exit the app?"
 *   (plugins.App.disableBackButtonHandler = true, so the App plugin stays out);
 * - new windows of the page (target=_blank, window.open) over the page, which keeps running (MigWindows);
 * - App Links (https://madeinegyptgate.com/…, AndroidManifest.xml): the tapped page opens in the app, on a cold start and while the
 *   app runs; during a live call in a window over the call (a link that starts a call asks first); the API, files, payment pages
 *   and the old system's pages go to the phone's browser (MigLinks.isAppPage);
 * - the same page again after Android reclaimed the app or stopped its page process (restore-place-and-signin-step);
 * - the offline page www/offline.html when the site cannot be reached (MigWebViewClient), with the page to retry;
 * - pull to reload, the load bar, print, the link menu, the back/forward cache (MigPage, MigPullLayout,
 *   res/layout/capacitor_bridge_layout_main.xml), files to Downloads (MigDownloads), full-screen video, microphone / camera only
 *   for the platform's pages, the file chooser with the camera (MigChromeClient);
 * - the old system's session (/panel.html) kept across app starts like Chrome keeps it (android-old-panel-cookie);
 * - the WebView always between the status bar and the navigation bar, on the brand red (keepWebViewBetweenBars).
 */
public class MainActivity extends BridgeActivity implements MigWebViewClient.Host {

    private static final String KEY_PLACE = "mig-place";
    /** private, never backed up (res/xml/backup_rules.xml, data_extraction_rules.xml): the old system's session id */
    private static final String SESSION_PREFS = "mig_session";
    private static final long SESSION_KEEP_MS = 24L * 3600L * 1000L;
    private static final String LEGACY_URL = "https://madeinegyptgate.com/api/index.php";
    private static final long BACK_ASK_MS = 1_000L;
    /** page processes that ended within a minute: the second starts at the home page, the third closes the app (no loop) */
    private static long goneAt;
    private static int goneInARow;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private MigChromeClient chrome;
    private MigWindows windows;
    private MigPullLayout pull;
    private BroadcastReceiver downloadsDone;
    private String failedUrl;
    private String pendingLink;
    private String offlineTemplate;
    private String gonePlace;
    private boolean ready;
    private boolean restoring;
    private boolean handedOff;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // before super: BridgeActivity hands the launch intent to onNewIntent from inside its onCreate
        restoring = savedInstanceState != null;
        super.onCreate(savedInstanceState);
        if (bridge == null) return; // no usable WebView on this device: BridgeActivity shows its own screen
        keepWebViewBetweenBars();
        restoreLegacySession(); // after Capacitor removed the session cookies (CapacitorCookies.load, inside super.onCreate)
        WebView webView = bridge.getWebView();
        webView.getSettings().setSupportMultipleWindows(true); // target=_blank / window.open → onCreateWindow (MigWindows)
        bridge.setWebViewClient(new MigWebViewClient(bridge, this));
        chrome = new MigChromeClient(bridge);
        windows = new MigWindows(this, webView, chrome);
        chrome.setWindows(windows);
        chrome.setProgressBar((ProgressBar) findViewById(R.id.mig_progress));
        webView.setWebChromeClient(chrome);
        new MigDownloads(this, webView, null).install();
        downloadsDone = MigDownloads.listen(this);
        View p = findViewById(R.id.mig_pull);
        pull = p instanceof MigPullLayout ? (MigPullLayout) p : null;
        MigPage.install(this, webView, pull);
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    onBack();
                }
            }
        );
        ready = true;
        if (handedOff && pendingLink == null && !restoring) {
            finish(); // started only to pass an API / payment link to the browser: nothing to show here
            return;
        }
        String place = savedInstanceState != null ? savedInstanceState.getString(KEY_PLACE) : null;
        String go = MigLinks.restoreUrl(place, pendingLink);
        pendingLink = null;
        if (go != null) webView.loadUrl(go);
    }

    /** BridgeActivity also calls this from onCreate with the launch intent, so a cold start by an App Link lands here too */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String link = siteLink(intent);
        if (link == null) return;
        if (!ready && restoring) return; // Android starts the app again with the intent it already handled
        if (!MigLinks.isAppPage(link)) {
            // an API file, a payment page, the old system: the phone's browser (an App Link cannot leave out paths before Android 15)
            MigOut.browser(this, link);
            if (!ready) handedOff = true;
            return;
        }
        if (!ready || bridge == null) {
            pendingLink = link; // loaded at the end of onCreate, once our clients are in place
            return;
        }
        openIncoming(link);
    }

    /** a page of the site from another app while the app runs: as a browser opens it in a new tab when the current one is busy */
    private void openIncoming(String link) {
        windows.callOpen(open -> {
            if (isFinishing() || bridge == null) return;
            WebView webView = bridge.getWebView();
            if (!open) {
                windows.closeAll();
                webView.loadUrl(link);
                return;
            }
            if (!MigLinks.startsCall(link)) {
                windows.openLink(link); // over the call, which goes on
                return;
            }
            new AlertDialog.Builder(this)
                .setTitle(R.string.mig_call_link_title)
                .setPositiveButton(R.string.mig_call_link_open, (d, w) -> {
                    windows.closeAll();
                    webView.loadUrl(link);
                })
                .setNegativeButton(R.string.mig_call_link_stay, (d, w) -> d.dismiss())
                .show();
        });
    }

    @Override
    public void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        String place = placeToKeep();
        if (place != null) outState.putString(KEY_PLACE, place);
    }

    @Override
    public void onStop() {
        keepLegacySession();
        super.onStop();
    }

    @Override
    public void onDestroy() {
        keepLegacySession();
        if (windows != null) windows.closeAll();
        if (downloadsDone != null) {
            try {
                unregisterReceiver(downloadsDone);
            } catch (IllegalArgumentException ignored) {
                // not registered
            }
            downloadsDone = null;
        }
        super.onDestroy();
    }

    /** the page to come back to (the offline page counts as the page that failed); null = the home page */
    private String placeToKeep() {
        if (gonePlace != null) return gonePlace;
        if (bridge == null) return null;
        String url;
        try {
            url = bridge.getWebView().getUrl();
        } catch (RuntimeException e) {
            return null;
        }
        if (MigLinks.isOfflineOrBlank(url)) url = failedUrl;
        return MigLinks.restoreUrl(url, null);
    }

    /**
     * The status bar and the navigation bar always show the window's brand red (styles.xml) behind their light icons
     * (plugins.SystemBars.style DARK): the WebView is padded by the bars and the page gets no bar insets (env(safe-area-inset-*)
     * is 0). Capacitor's own handling is off (plugins.SystemBars.insetsHandling "disable"): with Android System WebView 140+ it
     * draws the WebView under the bars on every page with viewport-fit=cover, which most of the site's own pages have (the home
     * page too), and the site paints that strip white (body::before, var(--surface)), so the white clock and battery icons would
     * vanish on it. The padding is the one Capacitor uses on the other pages, keyboard included (adjustResize).
     */
    private void keepWebViewBetweenBars() {
        View decor = getWindow().getDecorView();
        final int bars = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets b = insets.getInsets(bars);
            int bottom = b.bottom;
            if (insets.isVisible(WindowInsetsCompat.Type.ime())) {
                bottom = Math.max(bottom, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom);
            }
            v.setPadding(b.left, b.top, b.right, bottom);
            // zeroed, not consumed: a consumed inset stops the WebView's later safe-area updates (as in Capacitor's SystemBars)
            return new WindowInsetsCompat.Builder(insets).setInsets(bars, Insets.NONE).build();
        });
        ViewCompat.requestApplyInsets(decor);
    }

    private static String siteLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        Uri uri = intent.getData();
        return MigLinks.isSiteUrl(uri) ? uri.toString() : null;
    }

    /**
     * Back: full screen first; then asks the page whether a live call is open (JANNA_LIVE.isOpen()) and goes back by
     * MigLinks.backOffset. During a call one step is WebView.goBack(), Chromium's own Back: the shared screen's last page, with
     * Chrome's rule for entries a page added without a tap. Page windows handle their own Back (MigWindows).
     */
    private void onBack() {
        if (chrome != null && chrome.isFullScreen()) {
            chrome.onHideCustomView();
            return;
        }
        final WebView webView = bridge.getWebView();
        final boolean[] done = { false };
        Runnable noAnswer = () -> {
            if (done[0]) return;
            done[0] = true;
            back(webView, false); // a page busy for a second: as without a call
        };
        try {
            webView.evaluateJavascript(MigWindows.CALL_JS, r -> {
                if (done[0]) return;
                done[0] = true;
                back(webView, "true".equals(r));
            });
        } catch (RuntimeException e) {
            noAnswer.run();
            return;
        }
        ui.postDelayed(noAnswer, BACK_ASK_MS);
    }

    private void back(WebView webView, boolean callOpen) {
        if (isFinishing() || isDestroyed()) return;
        WebBackForwardList list = webView.copyBackForwardList();
        int current = list.getCurrentIndex();
        String[] urls = new String[list.getSize()];
        for (int i = 0; i < urls.length; i++) {
            WebHistoryItem item = list.getItemAtIndex(i);
            urls[i] = item != null ? item.getUrl() : null;
        }
        if (current >= 0 && current < urls.length && urls[current] == null) urls[current] = webView.getUrl();
        int off = MigLinks.backOffset(urls, current, failedUrl, callOpen);
        if (off == 0) {
            confirmExit();
        } else if (callOpen && off == -1) {
            if (webView.canGoBack()) webView.goBack();
            else confirmExit();
        } else {
            webView.goBackOrForward(off);
        }
    }

    private void confirmExit() {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
            .setTitle(R.string.mig_exit_title)
            .setMessage(R.string.mig_exit_message)
            .setPositiveButton(R.string.mig_exit_yes, (dialog, which) -> finish())
            .setNegativeButton(R.string.mig_exit_no, (dialog, which) -> dialog.dismiss())
            .show();
    }

    // ---------- MigWebViewClient.Host ----------

    /** www/offline.html (copied by `npx cap sync` to assets/public), told which page to retry */
    @Override
    public void showOffline(WebView view, String url) {
        if (MigLinks.isSiteUrl(url)) failedUrl = url;
        if (pull != null) pull.setRefreshing(false);
        String html = offlineHtml();
        if (html == null) return;
        String retry = "<script>window.MIG_RETRY_URL=" + JSONObject.quote(failedUrl != null ? failedUrl : MigLinks.HOME) + ";</script>";
        int head = html.indexOf("</head>");
        html = head >= 0 ? html.substring(0, head) + retry + html.substring(head) : retry + html;
        view.stopLoading();
        view.loadDataWithBaseURL(MigLinks.OFFLINE_URL, html, "text/html", "UTF-8", MigLinks.OFFLINE_URL);
    }

    @Override
    public void pageFinished(WebView view, String url) {
        if (pull != null) pull.setRefreshing(false);
    }

    /**
     * Android stopped the page's process (it needed the memory) or it crashed. The WebView cannot be used again: the activity
     * starts again at the same page (onSaveInstanceState → onCreate), instead of Android closing the whole app. A second one
     * within a minute starts at the home page, a third closes the app (a page that crashes the WebView must not loop).
     */
    @Override
    public boolean rendererGone(WebView view) {
        long now = SystemClock.elapsedRealtime();
        goneInARow = now - goneAt < 60_000L ? goneInARow + 1 : 1;
        goneAt = now;
        String url = null;
        try {
            url = view.getUrl();
        } catch (RuntimeException ignored) {
            // nothing to keep
        }
        if (MigLinks.isOfflineOrBlank(url)) url = failedUrl;
        gonePlace = goneInARow == 1 ? MigLinks.restoreUrl(url, null) : null;
        if (windows != null) windows.closeAll();
        ViewGroup parent = (ViewGroup) view.getParent();
        if (parent != null) parent.removeView(view);
        view.destroy();
        Logger.warn("MainActivity", "the page process ended (" + goneInARow + " in a row): starting again");
        if (goneInARow >= 3) finish();
        else recreate();
        return true;
    }

    private String offlineHtml() {
        if (offlineTemplate != null) return offlineTemplate;
        try (InputStream in = getAssets().open("public/offline.html")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            offlineTemplate = new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            Logger.error("MainActivity", "offline page missing from the app bundle (run npx cap sync)", e);
        }
        return offlineTemplate;
    }

    // ---------- the old system's session (/panel.html, «استيراد من النظام القديم») ----------

    /**
     * Capacitor deletes the WebView's session cookies at every start (CapacitorCookies), so the owner had to sign in to the old
     * panel again after each app start; Chrome keeps them. The old system's session id (MigLinks.LEGACY_SESSION_COOKIES, nothing
     * else) is kept privately when the app goes to the background, and set back at the next start for at most a day. Signing out
     * there (the cookie gone) forgets it.
     */
    private void keepLegacySession() {
        try {
            String header = CookieManager.getInstance().getCookie(LEGACY_URL);
            SharedPreferences.Editor e = getSharedPreferences(SESSION_PREFS, MODE_PRIVATE).edit();
            for (String name : MigLinks.LEGACY_SESSION_COOKIES) {
                String v = MigLinks.cookieValue(header, name);
                if (MigLinks.isSessionId(v)) e.putString("c:" + name, v);
                else e.remove("c:" + name);
            }
            e.putLong("at", System.currentTimeMillis()).apply();
        } catch (RuntimeException ignored) {
            // no WebView provider right now
        }
    }

    private void restoreLegacySession() {
        try {
            SharedPreferences p = getSharedPreferences(SESSION_PREFS, MODE_PRIVATE);
            if (System.currentTimeMillis() - p.getLong("at", 0L) > SESSION_KEEP_MS) return;
            CookieManager cm = CookieManager.getInstance();
            String header = cm.getCookie(LEGACY_URL); // runs after Capacitor's removal (same cookie task queue)
            boolean set = false;
            for (String name : MigLinks.LEGACY_SESSION_COOKIES) {
                String v = p.getString("c:" + name, null);
                if (!MigLinks.isSessionId(v) || MigLinks.cookieValue(header, name) != null) continue;
                cm.setCookie("https://madeinegyptgate.com", name + "=" + v + "; Path=/; Secure; HttpOnly");
                set = true;
            }
            if (set) cm.flush();
        } catch (RuntimeException ignored) {
            // no WebView provider right now
        }
    }
}
