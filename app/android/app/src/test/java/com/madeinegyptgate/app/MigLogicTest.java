package com.madeinegyptgate.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.webkit.WebViewClient;
import org.junit.Test;

/** JVM tests of the app's own decisions (./gradlew testDebugUnitTest); no device needed. */
public class MigLogicTest {

    @Test
    public void offlinePageOnlyWhenTheSiteCannotBeReached() {
        assertTrue(MigWebViewClient.isUnreachable(WebViewClient.ERROR_HOST_LOOKUP, "net::ERR_NAME_NOT_RESOLVED"));
        assertTrue(MigWebViewClient.isUnreachable(WebViewClient.ERROR_CONNECT, "net::ERR_CONNECTION_REFUSED"));
        assertTrue(MigWebViewClient.isUnreachable(WebViewClient.ERROR_TIMEOUT, "net::ERR_TIMED_OUT"));
        assertTrue(MigWebViewClient.isUnreachable(WebViewClient.ERROR_FAILED_SSL_HANDSHAKE, "net::ERR_SSL_PROTOCOL_ERROR"));
        assertTrue(MigWebViewClient.isUnreachable(WebViewClient.ERROR_UNKNOWN, "net::ERR_INTERNET_DISCONNECTED"));
        // never for a cancelled navigation, the history entry of a form post or a link the WebView cannot open
        assertFalse(MigWebViewClient.isUnreachable(WebViewClient.ERROR_UNKNOWN, "net::ERR_ABORTED"));
        assertFalse(MigWebViewClient.isUnreachable(WebViewClient.ERROR_UNKNOWN, "net::ERR_CACHE_MISS"));
        assertFalse(MigWebViewClient.isUnreachable(WebViewClient.ERROR_UNSUPPORTED_SCHEME, "net::ERR_UNKNOWN_URL_SCHEME"));
        assertFalse(MigWebViewClient.isUnreachable(WebViewClient.ERROR_UNKNOWN, null));
    }

    @Test
    public void downloadNamesAreSafe() {
        assertEquals("event-12.ics", MigDownloads.safeName("event-12.ics"));
        assertEquals("_.._etc_passwd", MigDownloads.safeName("/../etc/passwd"));
        assertEquals("file.hidden", MigDownloads.safeName(".hidden"));
        assertEquals("file", MigDownloads.safeName(""));
        assertEquals("عرض سعر.pdf", MigDownloads.safeName("عرض سعر.pdf"));
        assertEquals(80, MigDownloads.safeName(new String(new char[200]).replace('\0', 'a') + ".csv").length());
    }
}
