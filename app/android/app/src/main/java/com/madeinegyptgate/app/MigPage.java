package com.madeinegyptgate.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.os.SystemClock;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.ContextMenu;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.OptIn;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * What a browser tab does around a page that a bare WebView does not, for the main page and every page window (MigWindows):
 * - print: window.print() → Android's print sheet with «Save as PDF» (print-bridge: the legal center «🖨️ طباعة / PDF», the radar
 *   report). A document-start script on the site's origins replaces window.print in the top document with a message on
 *   MIGAppPrint; the page's @media print rules apply;
 * - pull to reload (android-pull-to-reload): the same script tells MIGAppPull, at each touch, whether this pull may reload the page:
 *   only at the top of the page, never in the phone menu (html.nav-open) or a live call (html.jnl-on), never inside a box that
 *   scrolls, a fixed panel (the market's basket, a dialog), a map, a video, a frame or a slider, never when the page locked its
 *   own scrolling, and "0" at a second finger's touchstart (a pinch) — MigPullLayout asks it, and refuses by itself a touch that
 *   goes sideways before a pull starts (a row that scrolls sideways keeps the swipe, as in Chrome);
 * - a long press on a link: «نسخ الرابط» / «مشاركة» / «افتح في المتصفح» (share-and-copy-links);
 * - the back/forward cache where the WebView has it (android-list-back-cache): Back to a long list shows the same cards at the same
 *   place, as Chrome.
 */
final class MigPage {

    /** the site's two origins: the page → app channels and the app's document-start scripts exist only there */
    static final Set<String> ORIGINS = Collections.unmodifiableSet(
        new HashSet<>(java.util.Arrays.asList("https://madeinegyptgate.com", "https://www.madeinegyptgate.com"))
    );
    private static final String PRINT = "MIGAppPrint";
    private static final String PULL = "MIGAppPull";
    private static final long PRINT_GAP_MS = 1500L;

    private MigPage() {}

    /**
     * The document-start script (ES5: it runs in the page). Top document only: the live call's shared screen (a frame) keeps the
     * WebView's own behaviour, and a pull is the top page's business.
     */
    static final String SCRIPT =
        "(function(){if(window.__migApp)return;window.__migApp=1;" +
        "var top=false;try{top=window.top===window;}catch(e){}if(!top)return;" +
        "window.print=function(){try{if(window." + PRINT + ")window." + PRINT + ".postMessage('print');}catch(e){}};" +
        "function ok(t){var d=document,de=d.documentElement,b=d.body;if(!de||!b)return false;" +
        "if((window.pageYOffset||de.scrollTop||b.scrollTop||0)>0)return false;" +
        "var c=' '+de.className+' ';if(c.indexOf(' jnl-on ')>=0||c.indexOf(' nav-open ')>=0)return false;" +
        "var cs=window.getComputedStyle,hs=cs(de),bs=cs(b);" +
        "if(hs.overflowY==='hidden'||bs.overflowY==='hidden')return false;" +
        "var ho=hs.overscrollBehaviorY||'',bo=bs.overscrollBehaviorY||'';" +
        "if(ho==='none'||ho==='contain'||bo==='none'||bo==='contain')return false;" +
        "for(var e=t;e&&e.nodeType===1&&e!==b&&e!==de;e=e.parentNode){" +
        "var n=String(e.nodeName).toLowerCase();" +
        "if(n==='iframe'||n==='canvas'||n==='video'||n==='textarea'||n==='select'||(n==='input'&&e.type==='range'))return false;" +
        "if(n==='svg'&&e.getBoundingClientRect().height>120)return false;" +
        "var s=cs(e);if(s.position==='fixed')return false;" +
        "var ta=s.touchAction||'auto';if(ta!=='auto'&&ta!=='manipulation'&&ta.indexOf('pan-y')<0)return false;" +
        "if((s.overflowY==='auto'||s.overflowY==='scroll')&&e.scrollHeight>e.clientHeight+1)return false;}" +
        "return true;}" +
        "window.addEventListener('touchstart',function(ev){if(!window." + PULL + "||!ev.touches)return;" +
        "var y=false;if(ev.touches.length===1){try{y=ok(ev.target);}catch(e){}}" +
        "try{window." + PULL + ".postMessage(y?'1':'0');}catch(e){}}," +
        "{capture:true,passive:true});})();";

    /** print + pull (when `pull` is given) + the link menu + the back/forward cache, for one WebView */
    static void install(Activity activity, WebView view, MigPullLayout pull) {
        backForwardCache(view.getSettings());
        linkMenu(activity, view);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        final long[] lastPrint = { 0L };
        WebViewCompat.addWebMessageListener(view, PRINT, ORIGINS, (v, message, origin, isMainFrame, reply) -> {
            if (!isMainFrame) return;
            activity.runOnUiThread(() -> {
                long now = SystemClock.elapsedRealtime();
                if (now - lastPrint[0] < PRINT_GAP_MS || activity.isFinishing()) return;
                lastPrint[0] = now;
                print(activity, view);
            });
        });
        if (pull != null) {
            WebViewCompat.addWebMessageListener(view, PULL, ORIGINS, (v, message, origin, isMainFrame, reply) -> {
                if (isMainFrame) pull.pageAnswer("1".equals(message.getData()));
            });
            pull.setOnRefreshListener(view::reload);
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(view, SCRIPT, ORIGINS);
        }
    }

    /** the page in Android's print sheet (Save as PDF included), under the page's title */
    static void print(Activity activity, WebView view) {
        PrintManager pm = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
        if (pm == null) return;
        String title = view.getTitle();
        String job = title != null && !title.trim().isEmpty() ? title.trim() : activity.getString(R.string.app_name);
        try {
            pm.print(job, view.createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
        } catch (Exception e) {
            MigOut.toast(activity, R.string.mig_print_failed);
        }
    }

    /** Chrome's back/forward cache, where this WebView offers it (androidx.webkit 1.14: experimental, off by default) */
    @OptIn(markerClass = WebSettingsCompat.ExperimentalBackForwardCache.class)
    static void backForwardCache(WebSettings settings) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.BACK_FORWARD_CACHE)) {
            WebSettingsCompat.setBackForwardCacheEnabled(settings, true);
        }
    }

    /** a long press on a link of any site: copy, share, the phone's browser (Chrome's link menu, shortened) */
    @SuppressLint("HandlerLeak")
    static void linkMenu(Activity activity, WebView view) {
        view.setOnCreateContextMenuListener((menu, v, info) -> {
            WebView.HitTestResult hit = view.getHitTestResult();
            if (hit == null) return;
            String url = null;
            if (hit.getType() == WebView.HitTestResult.SRC_ANCHOR_TYPE) {
                url = hit.getExtra();
            } else if (hit.getType() == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) {
                // a picture inside a link: getExtra() is the picture; the link comes from the last tap (filled at once)
                Message m = new Handler(Looper.getMainLooper()).obtainMessage();
                view.requestFocusNodeHref(m);
                url = m.getData().getString("url");
            }
            if (!MigLinks.isWeb(url)) return;
            add(menu, activity, url);
        });
    }

    private static void add(ContextMenu menu, Activity activity, String url) {
        final String u = url;
        menu.setHeaderTitle(u);
        menu.add(R.string.mig_link_copy).setOnMenuItemClickListener(i -> {
            MigOut.copy(activity, u);
            return true;
        });
        menu.add(R.string.mig_link_share).setOnMenuItemClickListener(i -> {
            MigOut.share(activity, u);
            return true;
        });
        menu.add(R.string.mig_link_browser).setOnMenuItemClickListener(i -> {
            MigOut.browser(activity, u);
            return true;
        });
    }
}
