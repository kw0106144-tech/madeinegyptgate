package com.madeinegyptgate.app;

import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Capacitor's WebView client (local assets, external links to the browser, plugin hooks) plus the offline page, the end of a
 * page load (pull to reload) and a page process that Android stopped (MainActivity starts again at the same page).
 *
 * The offline page (www/offline.html) appears only when the site really cannot be reached: no network, DNS, timeout, TLS.
 * It never replaces the site's own pages: a 404 / 410 / a Cloudflare challenge stays on screen (that is why
 * capacitor.config.json has no server.errorPath: Capacitor would show it for every HTTP error of a page), and a cancelled
 * navigation (a second tap, an App Link that replaces the first page) does nothing.
 */
class MigWebViewClient extends BridgeWebViewClient {

    interface Host {
        void showOffline(WebView view, String failedUrl);

        /** a page finished loading in the main WebView */
        void pageFinished(WebView view, String url);

        /** Android stopped the page's process (memory) or it crashed: true = the app handled it (else Android closes the app) */
        boolean rendererGone(WebView view);
    }

    private final Host host;

    MigWebViewClient(Bridge bridge, Host host) {
        super(bridge);
        this.host = host;
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error); // notifies Capacitor's WebView listeners (no errorPath is configured)
        if (request == null || error == null || !request.isForMainFrame()) return;
        if (isUnreachable(error.getErrorCode(), String.valueOf(error.getDescription()))) {
            host.showOffline(view, request.getUrl() != null ? request.getUrl().toString() : null);
        }
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        host.pageFinished(view, url);
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        super.onRenderProcessGone(view, detail); // Capacitor's WebView listeners
        return host.rendererGone(view);
    }

    /** true = the page could not be fetched at all; false = an error the visitor should not see as "offline" */
    static boolean isUnreachable(int code, String description) {
        switch (code) {
            case WebViewClient.ERROR_HOST_LOOKUP:
            case WebViewClient.ERROR_CONNECT:
            case WebViewClient.ERROR_TIMEOUT:
            case WebViewClient.ERROR_IO:
            case WebViewClient.ERROR_FAILED_SSL_HANDSHAKE:
            case WebViewClient.ERROR_PROXY_AUTHENTICATION:
            case WebViewClient.ERROR_TOO_MANY_REQUESTS:
                return true;
            case WebViewClient.ERROR_UNKNOWN:
                String d = description == null ? "" : description;
                return (
                    d.contains("ERR_INTERNET_DISCONNECTED") ||
                    d.contains("ERR_NETWORK_CHANGED") ||
                    d.contains("ERR_NETWORK_ACCESS_DENIED") ||
                    d.contains("ERR_ADDRESS_UNREACHABLE") ||
                    d.contains("ERR_NAME_NOT_RESOLVED") ||
                    d.contains("ERR_CONNECTION_")
                );
            default:
                // ERR_ABORTED (cancelled), ERR_CACHE_MISS (history entry of a form post), unsupported schemes, blocked requests …
                return false;
        }
    }
}
