package com.madeinegyptgate.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.webkit.WebViewClient;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import org.junit.Test;

/** JVM tests of the app's own decisions (./gradlew testDebugUnitTest); no device needed. */
public class MigLogicTest {

    private static final String SITE = "https://madeinegyptgate.com";
    private static final String OFF = MigLinks.OFFLINE_URL;

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

    @Test
    public void thePagesOwnFileNameWinsOverTheGuessedOne() {
        // <a download="meeting-with-janna.ics" href="data:…"> → that name, never WebView's guess ("downloadfile.ics")
        assertEquals("meeting-with-janna.ics", MigDownloads.chooseName("meeting-with-janna.ics", "downloadfile.ics"));
        assertEquals("invoices-2026-11-20.csv", MigDownloads.chooseName("  invoices-2026-11-20.csv ", "x.bin"));
        // no name from the page: the guess, made safe
        assertEquals("a_b.csv", MigDownloads.chooseName("", "a/b.csv"));
        assertEquals("a_b.csv", MigDownloads.chooseName(null, "a/b.csv"));
        // the page's name is made safe too
        assertEquals("_.._x.ics", MigDownloads.chooseName("/../x.ics", "y"));
        assertEquals("x (1).csv", MigDownloads.numbered("x.csv", 1));
        assertEquals("x (2)", MigDownloads.numbered("x", 2));
    }

    @Test
    public void parsesWhatMailAndWebViewHandOver() {
        MigLinks.Parts p = MigLinks.parse("HTTPS://WWW.MadeInEgyptGate.com:443/advisor/?live=1#login=x&live=1");
        assertEquals("https", p.scheme);
        assertEquals("www.madeinegyptgate.com", p.host);
        assertEquals("/advisor/", p.path);
        assertEquals("live=1", p.query);
        assertEquals("login=x&live=1", p.fragment);
        assertEquals("/", MigLinks.parse("https://madeinegyptgate.com").path);
        assertEquals("/", MigLinks.parse("https://madeinegyptgate.com?x=1").path);
        assertEquals("x=1", MigLinks.parse("https://madeinegyptgate.com?x=1").query);
        assertEquals("evil.com", MigLinks.parse("https://madeinegyptgate.com@evil.com/").host);
        assertNull(MigLinks.parse("mailto:info@madeinegyptgate.com").host);
        assertNull(MigLinks.parse("no scheme"));
        assertNull(MigLinks.parse(null));
        assertEquals("/مصانع/", MigLinks.parse("https://madeinegyptgate.com/مصانع/").path); // unescaped Arabic: no exception
    }

    @Test
    public void onlyTheSiteIsTheSite() {
        assertTrue(MigLinks.isSiteUrl(SITE + "/"));
        assertTrue(MigLinks.isSiteUrl("https://www.madeinegyptgate.com/factories/"));
        assertTrue(MigLinks.isSiteUrl("https://madeinegyptgate.com."));
        assertFalse(MigLinks.isSiteUrl("http://madeinegyptgate.com/"));
        assertFalse(MigLinks.isSiteUrl("https://madeinegyptgate.com.evil.com/"));
        assertFalse(MigLinks.isSiteUrl("https://evil.com/?https://madeinegyptgate.com/"));
        assertFalse(MigLinks.isSiteUrl("https://madeinegyptgate.com@evil.com/"));
        assertFalse(MigLinks.isSiteUrl(OFF));
        assertTrue(MigLinks.isWeb("http://example.org/x"));
        assertFalse(MigLinks.isWeb("mailto:a@b.c"));
        assertFalse(MigLinks.isWeb("tel:+20238346757"));
        assertFalse(MigLinks.isWeb("whatsapp://send?text=x"));
    }

    @Test
    public void newWindowsOfTheSiteStayOverThePage() {
        // same-site-new-windows
        assertEquals(MigLinks.SITE_CHILD, MigLinks.newWindowAction(SITE + "/legal/", false));
        assertEquals(MigLinks.SITE_CHILD, MigLinks.newWindowAction("https://www.madeinegyptgate.com/x", false));
        assertEquals(MigLinks.SITE_CHILD, MigLinks.newWindowAction(SITE + "/tenders/?with=bassem", true));
        assertEquals(MigLinks.SITE_CHILD, MigLinks.newWindowAction("blob:https://madeinegyptgate.com/3f2a", false));
        // other-site-pages-during-call: another site stays in the app only while a call is open
        assertEquals(MigLinks.EXTERNAL_APP, MigLinks.newWindowAction("https://wa.me/201000000000?text=x", false));
        assertEquals(MigLinks.EXTERNAL_CHILD, MigLinks.newWindowAction("https://wa.me/201000000000?text=x", true));
        assertEquals(MigLinks.EXTERNAL_CHILD, MigLinks.newWindowAction("http://www.gafi.gov.eg/", true));
        assertEquals(MigLinks.EXTERNAL_APP, MigLinks.newWindowAction("http://madeinegyptgate.com/", false));
        // mail, phone, WhatsApp's own scheme: their app, call or not
        assertEquals(MigLinks.EXTERNAL_APP, MigLinks.newWindowAction("mailto:info@madeinegyptgate.com", false));
        assertEquals(MigLinks.EXTERNAL_APP, MigLinks.newWindowAction("mailto:info@madeinegyptgate.com", true));
        assertEquals(MigLinks.EXTERNAL_APP, MigLinks.newWindowAction("tel:+20238346757", true));
        assertEquals(MigLinks.EXTERNAL_APP, MigLinks.newWindowAction("whatsapp://send?text=x", true));
        assertEquals(MigLinks.EXTERNAL_APP, MigLinks.newWindowAction("blob:https://evil.com/3f2a", true));
    }

    @Test
    public void backDuringACallStepsTheScreenBack() {
        // android-back-during-call: the screen's own steps carry the page's address
        String[] advisor = { SITE + "/", SITE + "/advisor/", SITE + "/advisor/", SITE + "/advisor/" };
        assertEquals(-1, MigLinks.backOffset(advisor, 3, null, true));
        assertEquals(-3, MigLinks.backOffset(advisor, 3, null, false));
        // the offline page between two visits of the same page: nothing left to go back to without a call → the exit dialog
        String[] again = { SITE + "/a", OFF, SITE + "/a" };
        assertEquals(0, MigLinks.backOffset(again, 2, null, false));
        assertEquals(-2, MigLinks.backOffset(again, 2, null, true));
        String[] call = { SITE + "/a", OFF, SITE + "/advisor/" };
        assertEquals(-2, MigLinks.backOffset(call, 2, null, true));
        assertEquals(-2, MigLinks.backOffset(call, 2, null, false));
        assertEquals(0, MigLinks.backOffset(new String[] { SITE + "/a" }, 0, null, true));
        assertEquals(0, MigLinks.backOffset(new String[] { SITE + "/a" }, 0, null, false));
        // on the offline page: never back into the page that failed
        String[] failed = { SITE + "/x", SITE + "/y", OFF };
        assertEquals(-2, MigLinks.backOffset(failed, 2, SITE + "/y", false));
        assertEquals(-1, MigLinks.backOffset(failed, 2, null, false));
        assertEquals(0, MigLinks.backOffset(null, 0, null, false));
        assertEquals(0, MigLinks.backOffset(advisor, 9, null, false));
    }

    @Test
    public void linksThatStartACallAsk() {
        // incoming-link-during-call
        assertTrue(MigLinks.startsCall(SITE + "/advisor/?live=1#login=x"));
        assertTrue(MigLinks.startsCall(SITE + "/advisor.html?live=1#login=abc&live=1"));
        assertTrue(MigLinks.startsCall(SITE + "/advisor/#login=abc&live=1"));
        assertTrue(MigLinks.startsCall(SITE + "/meeting/#abc"));
        assertTrue(MigLinks.startsCall(SITE + "/meeting.html#abc"));
        assertTrue(MigLinks.startsCall(SITE + "/en/meeting/#abc"));
        assertTrue(MigLinks.startsCall(SITE + "/factories/?live=1"));
        assertFalse(MigLinks.startsCall(SITE + "/factories/"));
        assertFalse(MigLinks.startsCall(SITE + "/advisor/"));
        assertFalse(MigLinks.startsCall(SITE + "/advisor/?live=10"));
        assertFalse(MigLinks.startsCall(SITE + "/meetings-guide/"));
        assertFalse(MigLinks.startsCall("https://evil.com/meeting/#x"));
    }

    @Test
    public void comingBackOpensTheSamePage() {
        // restore-place-and-signin-step: a pending App Link wins
        assertEquals(SITE + "/dashboard/", MigLinks.restoreUrl(SITE + "/login/", SITE + "/dashboard/"));
        assertEquals(SITE + "/login/", MigLinks.restoreUrl(SITE + "/login/", null));
        assertEquals(SITE + "/tenders/#q=cement", MigLinks.restoreUrl(SITE + "/tenders/#q=cement", null));
        // never an API answer or a file, another site or the offline page
        assertNull(MigLinks.restoreUrl(SITE + "/api/meetings/x/ics", null));
        assertNull(MigLinks.restoreUrl(SITE + "/api", null));
        assertNull(MigLinks.restoreUrl(SITE + "/media/u/x.jpg", null));
        assertNull(MigLinks.restoreUrl(SITE + "/data/janna.js", null));
        assertNull(MigLinks.restoreUrl("https://evil.com/", null));
        assertNull(MigLinks.restoreUrl(OFF, null));
        // nothing saved → the home page Capacitor loads
        assertNull(MigLinks.restoreUrl(null, null));
        // coming back never starts a call by itself and never reuses a one-time sign-in code (lt=, login=), as the iOS app
        assertEquals(SITE + "/advisor/", MigLinks.restoreUrl(SITE + "/advisor/?live=1#login=x&live=1", null));
        assertEquals(SITE + "/advisor/?a=1", MigLinks.restoreUrl(SITE + "/advisor/?a=1&live=1", null));
        assertEquals(SITE + "/advisor/", MigLinks.restoreUrl(SITE + "/advisor/#live=1", null));
        assertEquals(SITE + "/dashboard/#plan", MigLinks.restoreUrl(SITE + "/dashboard/#lt=abc&plan", null));
        assertEquals(SITE + "/pay/#inv=0123456789abcdef", MigLinks.restoreUrl(SITE + "/pay/#inv=0123456789abcdef", null));
        assertEquals(SITE + "/media-center/", MigLinks.restoreUrl(SITE + "/media-center/", null));
    }

    @Test
    public void appLinksOpenPagesNotFiles() {
        // app-links-live
        assertTrue(MigLinks.isAppPage(SITE + "/dashboard.html#lt=x"));
        assertTrue(MigLinks.isAppPage(SITE + "/"));
        assertTrue(MigLinks.isAppPage(SITE + "/advisor.html?live=1#login=x"));
        assertTrue(MigLinks.isAppPage("https://www.madeinegyptgate.com/factories/"));
        assertTrue(MigLinks.isAppPage(SITE + "/payments-guide/"));
        assertTrue(MigLinks.isAppPage(SITE + "/app/"));
        assertFalse(MigLinks.isAppPage(SITE + "/api/meetings/x/ics"));
        assertFalse(MigLinks.isAppPage(SITE + "/api"));
        assertFalse(MigLinks.isAppPage(SITE + "/pay.html#inv=x"));
        assertFalse(MigLinks.isAppPage(SITE + "/pay/#inv=x"));
        assertFalse(MigLinks.isAppPage(SITE + "/pay"));
        assertFalse(MigLinks.isAppPage(SITE + "/en/pay/#inv=x"));
        assertFalse(MigLinks.isAppPage(SITE + "/media/u/abc.jpg"));
        assertFalse(MigLinks.isAppPage(SITE + "/downloads/android/madeinegyptgate-1.0.0-7.apk"));
        assertFalse(MigLinks.isAppPage(SITE + "/app/android.apk"));
        // the owner's old system (deploy/legacy-live.txt)
        assertFalse(MigLinks.isAppPage(SITE + "/panel.html"));
        assertFalse(MigLinks.isAppPage(SITE + "/PANEL.HTML"));
        assertFalse(MigLinks.isAppPage(SITE + "/login.html"));
        assertFalse(MigLinks.isAppPage(SITE + "/api/index.php?a=me"));
        assertFalse(MigLinks.isAppPage(SITE + "/data/auth.js"));
        assertFalse(MigLinks.isAppPage(SITE + "/data/me.js"));
        assertFalse(MigLinks.isAppPage(SITE + "/data/egadm.js"));
        assertFalse(MigLinks.isAppPage("https://evil.com/"));
        assertFalse(MigLinks.isAppPage("http://madeinegyptgate.com/"));
    }

    @Test
    public void aPinchOrASidewaysSwipeIsNeverAPull() {
        // android-pull-to-reload: Chrome reloads only from a pull that goes down; pinch-zoom is on (zoomEnabled)
        float slop = 21f; // ViewConfiguration's 8 dp on a 2.625x phone
        assertFalse("not moved yet: undecided", MigPullLayout.pinchOrSideways(1, 3f, 4f, slop));
        assertFalse("straight down", MigPullLayout.pinchOrSideways(1, 2f, 30f, slop));
        assertFalse("mostly down", MigPullLayout.pinchOrSideways(1, 12f, 25f, slop));
        assertTrue("a second finger, however little it moved (a pinch)", MigPullLayout.pinchOrSideways(2, 0f, 0f, slop));
        assertTrue("a pinch whose first finger goes down", MigPullLayout.pinchOrSideways(2, 0f, 40f, slop));
        assertTrue("sideways with a downward drift (the market's department bar)", MigPullLayout.pinchOrSideways(1, -40f, 21f, slop));
        assertTrue("as much sideways as down", MigPullLayout.pinchOrSideways(1, 20f, 20f, slop));
        assertTrue("sideways, the other way", MigPullLayout.pinchOrSideways(1, 30f, -5f, slop));
        // SwipeRefreshLayout's canChildScrollUp (true = no pull now)
        assertFalse("at the top, the page said yes, a straight pull", MigPullLayout.refusesPull(false, true, false, false, false));
        assertTrue("the page said no (a scrolling box, the phone menu, a live call)", MigPullLayout.refusesPull(false, false, false, false, false));
        assertTrue("a pinch or a sideways swipe, whatever the page said", MigPullLayout.refusesPull(false, true, true, false, false));
        assertTrue("the page is not at its top", MigPullLayout.refusesPull(true, true, false, false, false));
        assertFalse("the touch itself: where it began is noted at the top", MigPullLayout.refusesPull(false, false, false, true, false));
        assertTrue(MigPullLayout.refusesPull(true, true, false, true, false));
        assertFalse("a pull under way stays one (a later second finger never freezes the spinner)", MigPullLayout.refusesPull(false, false, true, false, true));
    }

    @Test
    public void aPageTooBusyToAnswerCountsAsACall() {
        // review AND-2: a late answer never ends the call (Back skipping the shared screen, an incoming link replacing the call's page)
        assertTrue(MigLinks.asCall(Boolean.TRUE));
        assertTrue("no answer in time (null): as a call", MigLinks.asCall(null));
        assertFalse(MigLinks.asCall(Boolean.FALSE));
        String page = SITE + "/tenders/", live = SITE + "/?live=1", meeting = SITE + "/meeting/#m=abc";
        assertEquals(MigLinks.INCOMING_LOAD, MigLinks.incomingAction(Boolean.FALSE, page));
        assertEquals(MigLinks.INCOMING_LOAD, MigLinks.incomingAction(Boolean.FALSE, live));
        assertEquals(MigLinks.INCOMING_WINDOW, MigLinks.incomingAction(Boolean.TRUE, page));
        assertEquals("no answer: a window of its own, never in place of the call's page", MigLinks.INCOMING_WINDOW, MigLinks.incomingAction(null, page));
        assertEquals(MigLinks.INCOMING_ASK, MigLinks.incomingAction(Boolean.TRUE, live));
        assertEquals(MigLinks.INCOMING_ASK, MigLinks.incomingAction(null, meeting));
    }

    @Test
    public void thePaymentGatewayFromPayGoesToTheBrowser() {
        // pay-handoff: /pay/ in a page window has no Capacitor bridge
        assertTrue(MigLinks.isPayPage(SITE + "/pay/#inv=0123456789abcdef"));
        assertTrue(MigLinks.isPayPage(SITE + "/en/pay/#inv=0123456789abcdef&r=1"));
        assertTrue(MigLinks.isPayPage(SITE + "/pay.html#inv=x"));
        assertTrue(MigLinks.isPayPage(SITE + "/pay"));
        assertTrue(MigLinks.isPayPage("https://www.madeinegyptgate.com/PAY/"));
        assertFalse(MigLinks.isPayPage(SITE + "/payments-guide/"));
        assertFalse(MigLinks.isPayPage(SITE + "/register/#plans"));
        assertFalse(MigLinks.isPayPage("https://accept.paymob.com/pay/x"));
        assertFalse(MigLinks.isPayPage("http://madeinegyptgate.com/pay/"));
        assertFalse(MigLinks.isPayPage(null));
    }

    @Test
    public void onlyATapLeavesTheAppFromAWindow() {
        // other-site-pages-during-call: an ad frame's or a redirect's jump to an app is cancelled, as Chrome does
        assertTrue(MigLinks.opensAnotherApp("tel:+20238346757", true));
        assertTrue(MigLinks.opensAnotherApp("mailto:info@madeinegyptgate.com", true));
        assertTrue(MigLinks.opensAnotherApp("intent://scan/#Intent;scheme=zxing;end", true));
        assertFalse(MigLinks.opensAnotherApp("market://details?id=com.example", false));
        assertFalse(MigLinks.opensAnotherApp("whatsapp://send?text=x", false));
        assertFalse(MigLinks.opensAnotherApp("intent://x#Intent;end", false));
        // web pages, empty documents and page-made files stay with the WebView, tap or not
        assertFalse(MigLinks.opensAnotherApp("https://example.org/", true));
        assertFalse(MigLinks.opensAnotherApp("about:blank", true));
        assertFalse(MigLinks.opensAnotherApp("data:text/html,x", true));
        assertFalse(MigLinks.opensAnotherApp("blob:https://madeinegyptgate.com/1-2", true));
        assertFalse(MigLinks.opensAnotherApp(null, true));
    }

    @Test
    public void oneMicrophoneDialogAnswersEveryWaitingRequest() {
        // mic-permission-race: a request while the dialog is open waits; one answer serves all
        MigAsk<String> ask = new MigAsk<>();
        assertTrue(ask.add("call")); // no dialog open: ask Android now
        assertTrue(ask.isOpen());
        assertFalse(ask.add("sdk")); // the dialog is open: it waits (no second system request)
        assertFalse(ask.add("again"));
        assertTrue(ask.remove("again")); // withdrawn by the page
        List<String> answered = ask.answer();
        assertEquals(Arrays.asList("call", "sdk"), answered);
        assertFalse(ask.isOpen());
        assertTrue(ask.answer().isEmpty());
        assertTrue(ask.add("next")); // a later request asks again
        // granted → all granted; an empty answer (the phone holds nothing) → all denied
        String[] mic = { "android.permission.RECORD_AUDIO" };
        assertTrue(MigAsk.allHeld(mic, new HashSet<>(Collections.singletonList("android.permission.RECORD_AUDIO"))));
        assertFalse(MigAsk.allHeld(mic, new HashSet<>()));
        assertFalse(MigAsk.allHeld(mic, null));
        String[] both = { "android.permission.RECORD_AUDIO", "android.permission.CAMERA" };
        assertFalse(MigAsk.allHeld(both, new HashSet<>(Collections.singletonList("android.permission.RECORD_AUDIO"))));
        assertTrue(MigAsk.allHeld(new String[0], new HashSet<>()));
    }

    @Test
    public void appSettingsLinksOpenTheAppsSettings() {
        // mic-blocked-wording: the address iOS uses for an app's settings works on Android too
        assertTrue(MigOut.isAppSettings("app-settings:"));
        assertTrue(MigOut.isAppSettings("APP-SETTINGS:root"));
        assertFalse(MigOut.isAppSettings("https://madeinegyptgate.com/app-settings:"));
        assertFalse(MigOut.isAppSettings("app-setting:"));
        assertFalse(MigOut.isAppSettings(null));
        assertEquals(MigLinks.EXTERNAL_APP, MigLinks.newWindowAction("app-settings:", true));
    }

    @Test
    public void theOldSystemsSessionCookie() {
        // android-old-panel-cookie
        assertEquals("abc123def456", MigLinks.cookieValue("a=1; PHPSESSID=abc123def456; _ga=GA1.2", "PHPSESSID"));
        assertEquals("1", MigLinks.cookieValue("a=1", "a"));
        assertNull(MigLinks.cookieValue("XPHPSESSID=1; PHPSESSIDX=2", "PHPSESSID"));
        assertNull(MigLinks.cookieValue(null, "PHPSESSID"));
        assertTrue(MigLinks.isSessionId("r4nd0m-sess_id,42"));
        assertFalse(MigLinks.isSessionId("short"));
        assertFalse(MigLinks.isSessionId("abc12345; Domain=evil.com"));
        assertFalse(MigLinks.isSessionId(null));
    }

    @Test
    public void theFileChooserOffersWhatChromeOffers() {
        // android-camera-in-chooser: pictures (no capture) → gallery + camera
        String[] logo = { "image/jpeg", "image/png", "image/webp" };
        assertEquals(MigLinks.CHOOSER_IMAGES, MigLinks.chooserKind(logo, false));
        assertTrue(MigLinks.chooserCamera(logo, false));
        assertEquals(Arrays.asList("image/jpeg", "image/png", "image/webp"), MigLinks.imageMimeTypes(logo));
        assertEquals(MigLinks.CHOOSER_IMAGES, MigLinks.chooserKind(new String[] { "image/*" }, false));
        assertTrue(MigLinks.imageMimeTypes(new String[] { "image/png,image/*" }).isEmpty());
        assertTrue(MigLinks.imageMimeTypes(new String[] { "image/png", ".jpg" }).isEmpty()); // an extension: no type filter
        // documents: any file (a CSV often comes as text/plain or octet-stream), no camera
        String[] csv = { ".csv", "text/csv" };
        assertEquals(MigLinks.CHOOSER_ANY, MigLinks.chooserKind(csv, false));
        assertFalse(MigLinks.chooserCamera(csv, false));
        assertEquals(MigLinks.CHOOSER_ANY, MigLinks.chooserKind(new String[] { ".csv,text/csv" }, false));
        // pictures or a PDF: any file, with the camera
        String[] doc = { "image/*", "application/pdf" };
        assertEquals(MigLinks.CHOOSER_ANY, MigLinks.chooserKind(doc, false));
        assertTrue(MigLinks.chooserCamera(doc, false));
        // no accept list: any file + camera, as Chrome
        assertEquals(MigLinks.CHOOSER_ANY, MigLinks.chooserKind(new String[] { "" }, false));
        assertTrue(MigLinks.chooserCamera(new String[] { "" }, false));
        // capture, video or audio only: Capacitor's own
        assertEquals(MigLinks.CHOOSER_CAPACITOR, MigLinks.chooserKind(logo, true));
        assertFalse(MigLinks.chooserCamera(logo, true));
        assertEquals(MigLinks.CHOOSER_CAPACITOR, MigLinks.chooserKind(new String[] { "video/*" }, false));
        assertEquals(MigLinks.CHOOSER_CAPACITOR, MigLinks.chooserKind(new String[] { "audio/*", "video/mp4" }, false));
        assertEquals(MigLinks.CHOOSER_IMAGES, MigLinks.chooserKind(new String[] { ".png", ".JPG" }, false));
    }

    @Test
    public void thePageScriptsAreEs5Shaped() throws Exception {
        // they run in the page (CLAUDE.md 2.1: browser code is ES5): no arrow functions, let / const, template literals.
        // They are also written to app/android/app/build/mig-page-scripts/ for a real parse:
        //   acorn --ecma5 app/android/app/build/mig-page-scripts/*.js   (app/README.md "Build here")
        String[][] scripts = {
            { "page", MigPage.SCRIPT },
            { "download-capture", MigDownloads.captureScript("0123456789abcdef") },
            { "download-blob", MigDownloads.readBlobScript("blob:https://madeinegyptgate.com/1-2", "عرض \"سعر\".csv", "k") },
            { "call-open", MigWindows.CALL_JS },
        };
        java.io.File dir = new java.io.File("build/mig-page-scripts");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        for (String[] s : scripts) {
            String js = s[1];
            assertFalse(js, js.contains("=>"));
            assertFalse(js, js.matches("(?s).*\\b(let|const|class)\\s.*"));
            assertFalse(js, js.contains("`"));
            java.nio.file.Files.write(new java.io.File(dir, s[0] + ".js").toPath(), js.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        assertTrue(MigDownloads.captureScript("abc").contains("\"abc\""));
        assertEquals("\"a\\\"b\\\\c\\u003c/script\\u003e\\u2028\"", MigDownloads.jsString("a\"b\\c</script>\u2028"));
        assertEquals("null", MigDownloads.jsString(null));
    }
}
