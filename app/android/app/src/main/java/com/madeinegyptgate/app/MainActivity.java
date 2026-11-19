package com.madeinegyptgate.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebBackForwardList;
import android.webkit.WebHistoryItem;
import android.webkit.WebView;
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
 * change of the site is in the app at once. What this activity adds to Capacitor's defaults:
 * - the back button: one step back in the site's history (skipping the offline page and the page that failed); on the first
 *   page «الخروج من التطبيق؟» / "Exit the app?" (plugins.App.disableBackButtonHandler = true, so the App plugin stays out);
 * - App Links (https://madeinegyptgate.com/…, AndroidManifest.xml): the tapped page opens in the app, on a cold start and while
 *   the app runs (Capacitor itself would only report the URL to the page and stay on the home page);
 * - the offline page www/offline.html when the site cannot be reached (MigWebViewClient), with the page to retry;
 * - full-screen video and microphone / camera only for the platform's pages (MigChromeClient), files (MigDownloads);
 * - the WebView always between the status bar and the navigation bar, on the brand red (keepWebViewBetweenBars).
 */
public class MainActivity extends BridgeActivity {

    private MigChromeClient chrome;
    private String failedUrl;
    private String pendingLink;
    private String offlineTemplate;
    private boolean ready;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge == null) return; // no usable WebView on this device: BridgeActivity shows its own screen
        keepWebViewBetweenBars();
        WebView webView = bridge.getWebView();
        bridge.setWebViewClient(new MigWebViewClient(bridge, this::showOffline));
        chrome = new MigChromeClient(bridge);
        webView.setWebChromeClient(chrome);
        new MigDownloads(this, webView).install();
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
        if (pendingLink != null) {
            String link = pendingLink;
            pendingLink = null;
            webView.loadUrl(link);
        }
    }

    /** BridgeActivity also calls this from onCreate with the launch intent, so a cold start by an App Link lands here too */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String link = siteLink(intent);
        if (link == null) return;
        if (!ready || bridge == null) {
            pendingLink = link; // loaded at the end of onCreate, once our clients are in place
            return;
        }
        bridge.getWebView().loadUrl(link);
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

    private void onBack() {
        if (chrome != null && chrome.isFullScreen()) {
            chrome.onHideCustomView();
            return;
        }
        WebView webView = bridge.getWebView();
        WebBackForwardList list = webView.copyBackForwardList();
        int current = list.getCurrentIndex();
        WebHistoryItem here = current >= 0 ? list.getItemAtIndex(current) : null;
        String hereUrl = here != null ? here.getUrl() : webView.getUrl();
        boolean onOffline = MigLinks.isOfflineOrBlank(hereUrl);
        for (int i = current - 1; i >= 0; i--) {
            WebHistoryItem item = list.getItemAtIndex(i);
            String url = item != null ? item.getUrl() : null;
            if (MigLinks.isOfflineOrBlank(url) || url.equals(hereUrl) || (onOffline && url.equals(failedUrl))) continue;
            webView.goBackOrForward(i - current);
            return;
        }
        confirmExit();
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

    /** www/offline.html (copied by `npx cap sync` to assets/public), told which page to retry */
    private void showOffline(WebView view, String url) {
        if (MigLinks.isSiteUrl(url)) failedUrl = url;
        String html = offlineHtml();
        if (html == null) return;
        String retry = "<script>window.MIG_RETRY_URL=" + JSONObject.quote(failedUrl != null ? failedUrl : MigLinks.HOME) + ";</script>";
        int head = html.indexOf("</head>");
        html = head >= 0 ? html.substring(0, head) + retry + html.substring(head) : retry + html;
        view.stopLoading();
        view.loadDataWithBaseURL(MigLinks.OFFLINE_URL, html, "text/html", "UTF-8", MigLinks.OFFLINE_URL);
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
}
