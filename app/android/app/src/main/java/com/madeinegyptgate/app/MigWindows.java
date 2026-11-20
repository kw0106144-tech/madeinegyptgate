package com.madeinegyptgate.app;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.activity.ComponentDialog;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.util.ArrayList;
import java.util.List;

/**
 * Windows over the page: what a browser does with a new tab (same-site-new-windows, other-site-pages-during-call,
 * incoming-link-during-call).
 *
 * A WebView has no tabs: without this, a link with target=_blank or window.open() replaced the page itself, and leaving the page
 * ends a live call (data/janna-live.js pagehide). Now the main WebView supports multiple windows (MainActivity), and a new window
 * from a tap gets a child WebView of its own (MigChromeClient.onCreateWindow → open), with the main page's settings and user
 * agent (… MIGApp/1.0 (android)) and the same storage and cookies (signed in), and with window.opener / window.name kept.
 * Nothing shows until its first address is known:
 * - a page of the site → a full-screen window with a red bar: the page's title and «✕ إغلاق» / "✕ Close". The page under it keeps
 *   running (the call goes on, a half-filled form keeps its values). Back steps back inside the window, then closes it;
 *   window.close() and opener.focus() (data/bassem-tab.js «ارجع للمكالمة») close it too, and the opener's w.closed turns true;
 * - another site while a live call is open (JANNA_LIVE.isOpen() in the app's pages) → the same window, so the app stays in front
 *   and the call keeps its microphone (Android silences an app in the background); without a call → the phone's browser, as before;
 * - mail, phone, WhatsApp … → their app, as before;
 * - a file (an .ics, an export) → downloaded (MigDownloads), and the window that never showed a page closes.
 * A window has no Capacitor bridge (Capacitor injects it only into the main WebView), the microphone only for the site's pages
 * (MigChromeClient), its own downloads, print, pull to reload and link menu (MigPage), and full-screen video inside its own window.
 * At most MAX windows over each other.
 */
final class MigWindows {

    static final int MAX = 3;
    /** «is a live call open?» in a page (data/janna-live.js JANNA_LIVE.isOpen(); html.jnl-on while its overlay is shown) */
    static final String CALL_JS =
        "(function(){try{var J=window.JANNA_LIVE;if(J&&J.isOpen)return !!J.isOpen();}catch(e){}" +
        "try{return document.documentElement.classList.contains('jnl-on');}catch(e){}return false;})()";

    private static final long FIRST_URL_MS = 10_000L; // a window that never got an address (window.open("", a name) that found none)
    private static final long CALL_ASK_MS = 1_500L; // the pages' answer to CALL_JS, at most
    private static final int UNDECIDED = 0;
    private static final int PENDING = -1;

    private final AppCompatActivity activity;
    private final WebView main;
    private final MigChromeClient chrome;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ArrayList<Win> wins = new ArrayList<>();

    MigWindows(AppCompatActivity activity, WebView main, MigChromeClient chrome) {
        this.activity = activity;
        this.main = main;
        this.chrome = chrome;
    }

    /** onCreateWindow (main page or a window, from a tap): a new window for the page; false = refused (window.open gives null) */
    boolean open(WebView opener, Message msg) {
        if (activity.isFinishing() || wins.size() >= MAX || msg == null || !(msg.obj instanceof WebView.WebViewTransport)) return false;
        Win w;
        try {
            w = new Win();
        } catch (RuntimeException e) {
            return false; // no WebView right now (being updated by Google Play)
        }
        wins.add(w);
        ((WebView.WebViewTransport) msg.obj).setWebView(w.view);
        msg.sendToTarget();
        w.waitForAddress();
        return true;
    }

    /** a link of the site that came from another app during a live call: a window of its own, like a new tab (no opener) */
    void openLink(String url) {
        if (activity.isFinishing()) return;
        if (wins.size() >= MAX) wins.get(0).close();
        Win w;
        try {
            w = new Win();
        } catch (RuntimeException e) {
            return;
        }
        wins.add(w);
        w.first(url, true, false);
    }

    void close(WebView view) {
        Win w = find(view);
        if (w != null) w.close();
    }

    void closeAll() {
        for (Win w : new ArrayList<>(wins)) w.close();
    }

    boolean any() {
        return !wins.isEmpty();
    }

    /** window.focus() of a window from another one: the windows above it close (the main page: all of them) */
    void focus(WebView view) {
        if (view == main) {
            closeAll();
            return;
        }
        int i = indexOf(view);
        if (i < 0) return;
        for (int j = wins.size() - 1; j > i; j--) wins.get(j).close();
    }

    /** is a live call open in the main page or in a page window of the site? (answers within CALL_ASK_MS, on the UI thread) */
    void callOpen(ValueCallback<Boolean> then) {
        List<WebView> views = new ArrayList<>();
        views.add(main);
        for (Win w : wins) if (w.mode == MigLinks.SITE_CHILD && !w.closed) views.add(w.view);
        final int[] left = { views.size() };
        final boolean[] any = { false };
        final boolean[] done = { false };
        final Runnable finish = () -> {
            if (done[0]) return;
            done[0] = true;
            then.onReceiveValue(any[0]);
        };
        for (WebView v : views) {
            try {
                v.evaluateJavascript(CALL_JS, r -> {
                    if ("true".equals(r)) any[0] = true;
                    if (--left[0] <= 0) finish.run();
                });
            } catch (RuntimeException e) {
                if (--left[0] <= 0) finish.run();
            }
        }
        ui.postDelayed(finish, CALL_ASK_MS);
    }

    private Win find(WebView view) {
        int i = indexOf(view);
        return i >= 0 ? wins.get(i) : null;
    }

    private int indexOf(WebView view) {
        for (int i = 0; i < wins.size(); i++) if (wins.get(i).view == view) return i;
        return -1;
    }

    private int dp(float v) {
        return MigOut.dp(activity, v);
    }

    /** one window: its WebView (created at once, handed to the opener), shown once its first address is known */
    private final class Win {

        final WebView view;
        final MigPullLayout pull;
        int mode = UNDECIDED;
        boolean shown;
        boolean committed;
        boolean closed;
        ComponentDialog dialog;
        TextView title;
        TextView where;
        ProgressBar bar;
        MigChromeClient.FullScreen full;

        Win() {
            view = new WebView(activity);
            setUp(view);
            view.setWebViewClient(new Client());
            view.setWebChromeClient(new Chrome());
            new MigDownloads(activity, view, () -> {
                if (!committed) close(); // the window only fetched a file
            }).install();
            pull = new MigPullLayout(activity);
            pull.addView(view, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            MigPage.install(activity, view, pull);
        }

        @SuppressLint("SetJavaScriptEnabled")
        private void setUp(WebView v) {
            WebSettings s = v.getSettings();
            WebSettings m = main.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setMediaPlaybackRequiresUserGesture(true); // another site plays sound after a tap (as Chrome); the site's pages: site()
            s.setSupportMultipleWindows(true);
            s.setJavaScriptCanOpenWindowsAutomatically(true);
            s.setUserAgentString(m.getUserAgentString());
            s.setSupportZoom(true);
            s.setBuiltInZoomControls(m.getBuiltInZoomControls());
            s.setDisplayZoomControls(false);
            s.setTextZoom(m.getTextZoom());
            s.setGeolocationEnabled(false);
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            v.setBackgroundColor(Color.WHITE);
            CookieManager cm = CookieManager.getInstance();
            cm.setAcceptThirdPartyCookies(v, cm.acceptThirdPartyCookies(main));
        }

        void waitForAddress() {
            ui.postDelayed(() -> {
                if (mode == UNDECIDED && !closed) close();
            }, FIRST_URL_MS);
        }

        /**
         * the first address decides what the window is; true = the WebView must not load it itself.
         * navigate: load it here (a link from another app); started: the WebView already started showing it (onPageStarted)
         */
        boolean first(String url, boolean navigate, boolean started) {
            if (closed) return true;
            if (MigLinks.isOfflineOrBlank(url)) return false; // about:blank first: wait for the real address
            if (MigLinks.newWindowAction(url, false) == MigLinks.SITE_CHILD) {
                site();
                if (navigate) view.loadUrl(url);
                if (MigLinks.isAppPage(url)) show(); // a page: at once, with its load bar (a file waits: it may only download)
                return false;
            }
            if (!MigLinks.isWeb(url)) {
                MigOut.external(activity, url); // mail, phone, WhatsApp …
                close();
                return true;
            }
            // another site: inside the app only while a call is open, else the phone's browser as before
            mode = PENDING;
            if (started) view.stopLoading(); // (from shouldOverrideUrlLoading, returning true cancels it)
            callOpen(open -> {
                if (closed) return;
                if (open) {
                    elsewhere();
                    show();
                    view.loadUrl(url);
                } else {
                    MigOut.external(activity, url);
                    close();
                }
            });
            return true;
        }

        /** a later address of the window; true = handled here */
        boolean later(String url) {
            if (MigLinks.isOfflineOrBlank(url) || url.startsWith("blob:") || MigLinks.isSiteUrl(url)) {
                if (mode == MigLinks.EXTERNAL_CHILD && MigLinks.isSiteUrl(url)) site();
                return false;
            }
            if (!MigLinks.isWeb(url)) {
                MigOut.external(activity, url);
                return true;
            }
            if (mode == MigLinks.EXTERNAL_CHILD) return false; // another site during a call: its pages stay here
            // a page of the site goes to another site: in the app while a call is open, else the browser
            callOpen(open -> {
                if (closed) return;
                if (open) {
                    elsewhere();
                    view.loadUrl(url);
                } else {
                    MigOut.external(activity, url);
                }
            });
            return true;
        }

        private void site() {
            mode = MigLinks.SITE_CHILD;
            view.getSettings().setMediaPlaybackRequiresUserGesture(false); // as the main page (Capacitor): the call's video, the chat clips
        }

        private void elsewhere() {
            mode = MigLinks.EXTERNAL_CHILD;
            view.getSettings().setMediaPlaybackRequiresUserGesture(true);
        }

        @SuppressWarnings("deprecation") // SOFT_INPUT_ADJUST_RESIZE: still what Android 7–10 read (11+: the insets listener below)
        void show() {
            if (shown || closed || activity.isFinishing()) return;
            shown = true;
            int red = ContextCompat.getColor(activity, R.color.mig_red_deep);
            LinearLayout root = new LinearLayout(activity);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setBackgroundColor(red);

            LinearLayout top = new LinearLayout(activity);
            top.setOrientation(LinearLayout.HORIZONTAL);
            top.setGravity(Gravity.CENTER_VERTICAL);
            top.setMinimumHeight(dp(52));
            top.setPaddingRelative(dp(16), dp(2), dp(4), dp(2));
            LinearLayout names = new LinearLayout(activity);
            names.setOrientation(LinearLayout.VERTICAL);
            title = new TextView(activity);
            title.setTextColor(Color.WHITE);
            title.setTypeface(Typeface.DEFAULT_BOLD);
            title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            title.setSingleLine(true);
            title.setEllipsize(TextUtils.TruncateAt.END);
            title.setText(R.string.mig_win_loading);
            names.addView(title);
            where = new TextView(activity);
            where.setTextColor(0xCCFFFFFF);
            where.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            where.setSingleLine(true);
            where.setEllipsize(TextUtils.TruncateAt.MIDDLE);
            where.setTextDirection(View.TEXT_DIRECTION_LTR);
            where.setVisibility(View.GONE);
            names.addView(where);
            top.addView(names, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            TextView x = new TextView(activity);
            x.setText(R.string.mig_win_close);
            x.setTextColor(Color.WHITE);
            x.setTypeface(Typeface.DEFAULT_BOLD);
            x.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            x.setGravity(Gravity.CENTER);
            x.setMinWidth(dp(48));
            x.setMinHeight(dp(48));
            x.setPadding(dp(12), 0, dp(12), 0);
            TypedValue ripple = new TypedValue();
            if (activity.getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, ripple, true)) {
                x.setBackgroundResource(ripple.resourceId);
            }
            x.setOnClickListener(v -> close());
            top.addView(x, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            root.addView(top, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

            bar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
            bar.setProgressDrawable(ContextCompat.getDrawable(activity, R.drawable.mig_progress_window));
            bar.setMax(100);
            bar.setVisibility(View.GONE);
            root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

            FrameLayout box = new FrameLayout(activity);
            box.setBackgroundColor(Color.WHITE);
            box.addView(pull, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            root.addView(box, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

            ComponentDialog d = new ComponentDialog(activity, R.style.MigWindow);
            d.setContentView(root);
            Window w = d.getWindow();
            if (w != null) {
                w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
                WindowCompat.setDecorFitsSystemWindows(w, false);
                w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
                WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
                c.setAppearanceLightStatusBars(false); // light icons on the brand red, as the main page
                c.setAppearanceLightNavigationBars(false);
                full = new MigChromeClient.FullScreen(activity, w);
            }
            // between the bars, above the keyboard: as MainActivity.keepWebViewBetweenBars (the page gets no bar insets)
            ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
                int bars = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
                Insets b = insets.getInsets(bars);
                int bottom = b.bottom;
                if (insets.isVisible(WindowInsetsCompat.Type.ime())) bottom = Math.max(bottom, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom);
                v.setPadding(b.left, b.top, b.right, bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            d.getOnBackPressedDispatcher().addCallback(
                d,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        back();
                    }
                }
            );
            d.setOnDismissListener(di -> close());
            dialog = d;
            d.show();
            names(view.getTitle(), view.getUrl());
        }

        void names(String pageTitle, String url) {
            if (title == null) return;
            MigLinks.Parts p = MigLinks.parse(url);
            String host = p != null && p.host != null ? p.host : "";
            boolean site = MigLinks.isSiteUrl(url);
            String t = pageTitle != null ? pageTitle.trim() : "";
            if (t.isEmpty() || t.equals(url)) t = host.isEmpty() ? activity.getString(R.string.mig_win_loading) : host;
            title.setText(t);
            where.setText(host);
            where.setVisibility(site || host.isEmpty() ? View.GONE : View.VISIBLE);
        }

        void back() {
            if (full != null && full.isOn()) {
                full.hide();
                return;
            }
            if (view.canGoBack()) view.goBack();
            else close();
        }

        void close() {
            if (closed) return;
            closed = true;
            wins.remove(this);
            if (full != null && full.isOn()) full.hide();
            if (dialog != null) {
                dialog.setOnDismissListener(null);
                try {
                    dialog.dismiss();
                } catch (RuntimeException ignored) {
                    // the activity's window is already gone
                }
            }
            ViewGroup parent = (ViewGroup) view.getParent();
            if (parent != null) parent.removeView(view);
            ui.post(() -> {
                try {
                    view.stopLoading();
                    view.destroy(); // the opener's window.closed turns true
                } catch (RuntimeException ignored) {
                    // already destroyed
                }
            });
        }

        private final class Client extends WebViewClient {

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String url = u != null ? u.toString() : null;
                if (url == null || closed) return closed;
                if (!req.isForMainFrame()) {
                    // a frame: web pages load; mail, phone, WhatsApp … go to their app (Capacitor does the same for the main page)
                    if (MigLinks.isWeb(url) || MigLinks.isOfflineOrBlank(url) || url.startsWith("blob:")) return false;
                    MigOut.external(activity, url);
                    return true;
                }
                if (mode == UNDECIDED) return first(url, false, false);
                if (mode == PENDING) return true;
                return later(url);
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap favicon) {
                if (closed) return;
                if (mode == UNDECIDED) {
                    if (MigLinks.isOfflineOrBlank(url)) return;
                    // a window opened with noopener can reach its first page without shouldOverrideUrlLoading
                    if (first(url, false, true)) return;
                }
                if (mode == MigLinks.SITE_CHILD || mode == MigLinks.EXTERNAL_CHILD) {
                    committed = true;
                    show();
                    names(v.getTitle(), url);
                }
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                pull.setRefreshing(false);
                names(v.getTitle(), url);
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                close(); // its page process is gone: the window goes (the main page decides for itself)
                return true;
            }
        }

        private final class Chrome extends WebChromeClient {

            @Override
            public boolean onCreateWindow(WebView v, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                return isUserGesture && MigWindows.this.open(v, resultMsg);
            }

            @Override
            public void onCloseWindow(WebView w) {
                MigWindows.this.close(w);
            }

            @Override
            public void onRequestFocus(WebView v) {
                v.post(() -> MigWindows.this.focus(v));
            }

            /** the site's pages only (MigChromeClient checks the origin), through the main client's one dialog at a time */
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                chrome.onPermissionRequest(request);
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                chrome.onPermissionRequestCanceled(request);
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                return chrome.onShowFileChooser(v, callback, params);
            }

            @Override
            public void onShowCustomView(View v, CustomViewCallback callback) {
                if (full == null) {
                    callback.onCustomViewHidden();
                    return;
                }
                full.show(v, callback);
            }

            @Override
            public void onHideCustomView() {
                if (full != null) full.hide();
            }

            @Override
            public void onReceivedTitle(WebView v, String t) {
                names(t, v.getUrl());
            }

            @Override
            public void onProgressChanged(WebView v, int p) {
                MigChromeClient.showProgress(bar, p);
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false);
            }
        }
    }
}
