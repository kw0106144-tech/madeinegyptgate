package com.madeinegyptgate.app;

import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Capacitor's WebView client (local assets, external links to the browser, plugin hooks) plus the offline page.
 *
 * The offline page (www/offline.html) appears only when the site really cannot be reached: no network, DNS, timeout, TLS.
 * It never replaces the site's own pages: a 404 / 410 / a Cloudflare challenge stays on screen (that is why
 * capacitor.config.json has no server.errorPath: Capacitor would show it for every HTTP error of a page), and a cancelled
 * navigation (a second tap, an App Link that replaces the first page) does nothing.
 */
class MigWebViewClient extends BridgeWebViewClient {

    interface OfflineHandler {
        void showOffline(WebView view, String failedUrl);
    }

    private final OfflineHandler offline;

    MigWebViewClient(Bridge bridge, OfflineHandler offline) {
        super(bridge);
        this.offline = offline;
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error); // notifies Capacitor's WebView listeners (no errorPath is configured)
        if (request == null || error == null || !request.isForMainFrame()) return;
        if (isUnreachable(error.getErrorCode(), String.valueOf(error.getDescription()))) {
            offline.showOffline(view, request.getUrl() != null ? request.getUrl().toString() : null);
        }
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
