package com.madeinegyptgate.app;

import android.net.Uri;

/**
 * The platform's own addresses. Only these load inside the app (capacitor.config.json server.url + server.allowNavigation);
 * Capacitor opens every other host in the phone's browser or in the app that owns it (WhatsApp, mail, phone, maps …).
 */
final class MigLinks {

    static final String HOME = "https://madeinegyptgate.com/";
    /** where the offline page (www/offline.html) is shown; never fetched from the network */
    static final String OFFLINE_URL = "https://localhost/offline.html";

    private MigLinks() {}

    static boolean isSiteHost(String host) {
        return host != null && (host.equalsIgnoreCase("madeinegyptgate.com") || host.equalsIgnoreCase("www.madeinegyptgate.com"));
    }

    static boolean isSiteUrl(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) && isSiteHost(uri.getHost());
    }

    static boolean isSiteUrl(String url) {
        return url != null && isSiteUrl(Uri.parse(url));
    }

    /** history entries that are not pages of the site: the offline page and empty documents */
    static boolean isOfflineOrBlank(String url) {
        return url == null || url.startsWith(OFFLINE_URL) || url.startsWith("data:") || url.equals("about:blank");
    }
}
