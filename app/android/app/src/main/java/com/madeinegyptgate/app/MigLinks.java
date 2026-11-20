package com.madeinegyptgate.app;

import android.net.Uri;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The platform's own addresses and the app's decisions about them. Only these load inside the app (capacitor.config.json
 * server.url + server.allowNavigation); Capacitor opens every other host in the phone's browser or in the app that owns it
 * (WhatsApp, mail, phone, maps …).
 *
 * Everything except the Uri overload is plain Java (its own small URL parser, no android.net / java.net), so MigLogicTest runs
 * the decisions on the JVM: ./gradlew testDebugUnitTest.
 */
final class MigLinks {

    static final String HOME = "https://madeinegyptgate.com/";
    /** where the offline page (www/offline.html) is shown; never fetched from the network */
    static final String OFFLINE_URL = "https://localhost/offline.html";

    /**
     * The session cookie of the owner's OLD system (/panel.html, /api/index.php: deploy/legacy-live.txt, PHP on Hostinger), which
     * Capacitor deletes at every app start (CapacitorCookies.removeSessionCookies). PHP's default name; the PHP source is not in
     * this repository, so check the name once on a device (Chrome DevTools → Application → Cookies on /panel.html) and add it here
     * if it differs (MainActivity.keepLegacySession / restoreLegacySession).
     */
    static final String[] LEGACY_SESSION_COOKIES = { "PHPSESSID" };

    /**
     * Paths of the site that are not pages of the app: the API and files (they download), payment pages (the browser,
     * app-links-live) and the owner's old system (deploy/legacy-live.txt: answered by the Worker mis-egypt, never by this site).
     * An App Link to one of them goes to the phone's browser (MainActivity.onNewIntent). Keep in step with deploy/legacy-live.txt
     * (app/tools/check-app.mjs checks that every path listed there is here).
     */
    private static final Pattern NOT_APP_PAGE = Pattern.compile(
        "^/(api(/.*)?|media/.*|downloads/.*|app/android\\.apk|(en/)?pay(/.*|\\.html.*)?|" +
            "panel\\.html|login\\.html|api/index\\.php.*|data/auth\\.js|data/me\\.js|data/egadm\\.js)$"
    );
    private static final Pattern MEETING = Pattern.compile("^/(en/)?meeting(/.*|\\.html)?$");
    /** files and data, never a place to come back to (the same list as the iOS app's MIGLinks.restorable) */
    private static final Pattern NOT_A_PLACE = Pattern.compile("^/(api|media|data|img|assets|_seo|\\.well-known)(/.*)?$");
    /** one-time parts of an address: live=1 starts a call, lt= / login= are single-use sign-in codes (data/mig-api.js, advisor) */
    private static final String[] ONCE = { "live", "lt", "login" };
    private static final Pattern SCHEME = Pattern.compile("[a-z][a-z0-9+.-]*");

    /** What a new window (a link with target=_blank, window.open) becomes (MigWindows) */
    static final int SITE_CHILD = 1; // a page of the site: a full-screen window over the page, like a new tab (the page under it keeps running)
    static final int EXTERNAL_CHILD = 2; // another site while a live call is open: stays in the app, so the call keeps the microphone
    static final int EXTERNAL_APP = 3; // another site without a call, mail, phone, WhatsApp …: the phone's browser or its app (as before)

    /** The file chooser (MigChromeClient.onShowFileChooser) */
    static final int CHOOSER_CAPACITOR = 0; // Capacitor's own: inputs with capture (the camera at once), video / audio only
    static final int CHOOSER_IMAGES = 1; // pictures only: the gallery / files, plus the camera (as Chrome)
    static final int CHOOSER_ANY = 2; // documents, CSV …: any file (*/*, as Chrome), plus the camera when pictures are accepted

    private MigLinks() {}

    /** scheme, host, path, query and fragment of a URL (parse() gives null when it has no scheme) */
    static final class Parts {

        final String scheme;
        final String host; // null without an authority (mailto:, tel:, data: …)
        final String path; // "/" when the authority has no path
        final String query; // after "?", null when absent
        final String fragment; // after "#", null when absent

        Parts(String scheme, String host, String path, String query, String fragment) {
            this.scheme = scheme;
            this.host = host;
            this.path = path;
            this.query = query;
            this.fragment = fragment;
        }
    }

    /** a tolerant parser: never throws, accepts what WebView, mail and WhatsApp hand over (unescaped Arabic included) */
    static Parts parse(String url) {
        if (url == null) return null;
        String u = url.trim();
        int colon = u.indexOf(':');
        if (colon <= 0) return null;
        String scheme = u.substring(0, colon).toLowerCase(Locale.ROOT);
        if (!SCHEME.matcher(scheme).matches()) return null;
        String rest = u.substring(colon + 1);
        String fragment = null;
        int hash = rest.indexOf('#');
        if (hash >= 0) {
            fragment = rest.substring(hash + 1);
            rest = rest.substring(0, hash);
        }
        String query = null;
        int q = rest.indexOf('?');
        if (q >= 0) {
            query = rest.substring(q + 1);
            rest = rest.substring(0, q);
        }
        String host = null;
        String path = rest;
        if (rest.startsWith("//")) {
            int end = rest.indexOf('/', 2);
            String auth = end >= 0 ? rest.substring(2, end) : rest.substring(2);
            path = end >= 0 ? rest.substring(end) : "/";
            int at = auth.lastIndexOf('@');
            if (at >= 0) auth = auth.substring(at + 1);
            if (auth.startsWith("[")) {
                int rb = auth.indexOf(']');
                host = rb > 0 ? auth.substring(1, rb) : auth.substring(1);
            } else {
                int port = auth.indexOf(':');
                host = port >= 0 ? auth.substring(0, port) : auth;
            }
            host = host.toLowerCase(Locale.ROOT);
            if (host.endsWith(".")) host = host.substring(0, host.length() - 1);
        }
        return new Parts(scheme, host, path, query, fragment);
    }

    static boolean isSiteHost(String host) {
        return host != null && (host.equalsIgnoreCase("madeinegyptgate.com") || host.equalsIgnoreCase("www.madeinegyptgate.com"));
    }

    static boolean isSiteUrl(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) && isSiteHost(uri.getHost());
    }

    static boolean isSiteUrl(String url) {
        Parts p = parse(url);
        return p != null && "https".equals(p.scheme) && isSiteHost(p.host);
    }

    /** http(s) of any host: a web page (else mail, phone, WhatsApp, intent: … — another app's business) */
    static boolean isWeb(String url) {
        Parts p = parse(url);
        return p != null && p.host != null && !p.host.isEmpty() && ("https".equals(p.scheme) || "http".equals(p.scheme));
    }

    /** history entries that are not pages of the site: the offline page and empty documents */
    static boolean isOfflineOrBlank(String url) {
        return url == null || url.startsWith(OFFLINE_URL) || url.startsWith("data:") || url.equals("about:blank");
    }

    /** a page of the site that the app shows (an App Link opens it in the app); false: a file, the API, payment, the old system */
    static boolean isAppPage(String url) {
        Parts p = parse(url);
        if (p == null || !"https".equals(p.scheme) || !isSiteHost(p.host)) return false;
        return !NOT_APP_PAGE.matcher(p.path.toLowerCase(Locale.ROOT)).matches();
    }

    /**
     * A new window's first address → SITE_CHILD / EXTERNAL_CHILD / EXTERNAL_APP. callOpen: a live call with Janna or Bassem is open
     * in the app (JANNA_LIVE.isOpen()). A blob: of the site (a page-made file shown in a new tab) counts as the site.
     */
    static int newWindowAction(String url, boolean callOpen) {
        Parts p = parse(url);
        if (p == null) return EXTERNAL_APP;
        if ("blob".equals(p.scheme)) return isSiteUrl(url.trim().substring(5)) ? SITE_CHILD : EXTERNAL_APP;
        if ("https".equals(p.scheme) && isSiteHost(p.host)) return SITE_CHILD;
        if (isWeb(url)) return callOpen ? EXTERNAL_CHILD : EXTERNAL_APP;
        return EXTERNAL_APP;
    }

    /**
     * Android's Back: how many history entries to go (negative), 0 = none left («الخروج من التطبيق؟»).
     * - No live call: the nearest earlier page that is not the offline page or an empty document, not this page's own address
     *   (the entries a live call's shared screen left behind carry it) and, on the offline page, not the page that failed.
     * - A live call is open: the nearest earlier entry that is not offline / empty, even with this page's address: that is the
     *   shared screen's own last step, which Chromium takes back inside the screen, exactly as Chrome's Back does (MainActivity
     *   then uses WebView.goBack() for one step, with Chrome's rule for entries a page added by itself).
     */
    static int backOffset(String[] urls, int current, String failedUrl, boolean callOpen) {
        if (urls == null || current <= 0 || current >= urls.length) return 0;
        String here = urls[current];
        boolean onOffline = isOfflineOrBlank(here);
        for (int i = current - 1; i >= 0; i--) {
            String url = urls[i];
            if (isOfflineOrBlank(url)) continue;
            if (!callOpen && (url.equals(here) || (onOffline && url.equals(failedUrl)))) continue;
            return i - current;
        }
        return 0;
    }

    /** a link that starts a live call by itself (…?live=1 / #…&live=1, data/janna-live.js) or a meeting page (/meeting/#…) */
    static boolean startsCall(String url) {
        Parts p = parse(url);
        if (p == null || !"https".equals(p.scheme) || !isSiteHost(p.host)) return false;
        if (hasParam(p.query, "live", "1") || hasParam(p.fragment, "live", "1")) return true;
        return MEETING.matcher(p.path.toLowerCase(Locale.ROOT)).matches();
    }

    /**
     * Where the app starts again after Android reclaimed it (MainActivity.onCreate with a saved state): a pending App Link wins,
     * else the saved page of the site, never a file or an API answer, and without its one-time parts (live=1 would start a call
     * by itself, lt= / login= are used up); null = the home page Capacitor already loads. Same rule as the iOS app (MIGPlace).
     */
    static String restoreUrl(String saved, String pendingLink) {
        if (pendingLink != null) return pendingLink;
        Parts p = parse(saved);
        if (p == null || !"https".equals(p.scheme) || !isSiteHost(p.host)) return null;
        if (NOT_A_PLACE.matcher(p.path.toLowerCase(Locale.ROOT)).matches()) return null;
        String s = saved.trim();
        int cut = s.length();
        int hash = s.indexOf('#');
        if (hash >= 0) cut = hash;
        int q = s.indexOf('?');
        if (q >= 0 && q < cut) cut = q;
        StringBuilder out = new StringBuilder(s.substring(0, cut));
        String query = withoutKeys(p.query, ONCE);
        if (query != null) out.append('?').append(query);
        String fragment = withoutKeys(p.fragment, ONCE);
        if (fragment != null) out.append('#').append(fragment);
        return out.toString();
    }

    /** a query / fragment without the parts named `keys` (any value); null when nothing is left */
    static String withoutKeys(String part, String[] keys) {
        if (part == null) return null;
        List<String> keep = new ArrayList<>();
        for (String kv : part.split("&")) {
            if (kv.isEmpty()) continue;
            int eq = kv.indexOf('=');
            String key = (eq >= 0 ? kv.substring(0, eq) : kv).toLowerCase(Locale.ROOT);
            boolean once = false;
            for (String k : keys) once |= k.equals(key);
            if (!once) keep.add(kv);
        }
        return keep.isEmpty() ? null : String.join("&", keep);
    }

    static boolean hasParam(String part, String name, String value) {
        if (part == null) return false;
        for (String kv : part.split("&")) if (kv.equals(name + "=" + value)) return true;
        return false;
    }

    /** the value of cookie `name` in a Cookie header ("a=1; b=2"), null when absent */
    static String cookieValue(String header, String name) {
        if (header == null || name == null) return null;
        for (String c : header.split(";")) {
            String t = c.trim();
            int eq = t.indexOf('=');
            if (eq > 0 && t.substring(0, eq).trim().equals(name)) return t.substring(eq + 1).trim();
        }
        return null;
    }

    /** a session id that can be set back as it was: letters, digits, - , _ (PHP's session ids), 8–256 characters */
    static boolean isSessionId(String v) {
        return v != null && v.matches("[A-Za-z0-9_,-]{8,256}");
    }

    /** which chooser an &lt;input type=file&gt; gets (CHOOSER_*); accept = WebView's accept types (MIME types or .extensions) */
    static int chooserKind(String[] accept, boolean capture) {
        if (capture) return CHOOSER_CAPACITOR;
        int images = 0, media = 0, other = 0;
        for (String t : types(accept)) {
            String k = kindOf(t);
            if (k.equals("image")) images++;
            else if (k.equals("other")) other++;
            else media++;
        }
        if (images + media + other == 0) return CHOOSER_ANY; // no accept list: any file, as Chrome
        if (other > 0) return CHOOSER_ANY;
        if (media == 0) return CHOOSER_IMAGES;
        return CHOOSER_CAPACITOR;
    }

    /** the chooser offers the camera: pictures are accepted (or any file) and the input does not capture by itself */
    static boolean chooserCamera(String[] accept, boolean capture) {
        if (capture) return false;
        List<String> list = types(accept);
        if (list.isEmpty()) return true;
        for (String t : list) if (kindOf(t).equals("image")) return true;
        return false;
    }

    /**
     * the specific picture types of an accept list ("image/png" …); empty = every picture (image/*, or a list with .extensions,
     * which have no reliable type on every phone: a picker filtered by types would hide those files)
     */
    static List<String> imageMimeTypes(String[] accept) {
        List<String> out = new ArrayList<>();
        for (String t : types(accept)) {
            if (t.equals("image/*") || t.startsWith(".")) return new ArrayList<>();
            if (t.startsWith("image/") && !out.contains(t)) out.add(t);
        }
        return out;
    }

    private static List<String> types(String[] accept) {
        List<String> out = new ArrayList<>();
        if (accept == null) return out;
        for (String a : accept) {
            if (a == null) continue;
            for (String t : a.split(",")) {
                String x = t.trim().toLowerCase(Locale.ROOT);
                if (!x.isEmpty()) out.add(x);
            }
        }
        return out;
    }

    private static String kindOf(String t) {
        if (t.startsWith("image/") || t.matches("\\.(jpe?g|png|webp|gif|heic|heif|bmp|avif)")) return "image";
        if (t.startsWith("video/") || t.matches("\\.(mp4|m4v|mov|webm|3gp|mkv)")) return "video";
        if (t.startsWith("audio/") || t.matches("\\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)")) return "audio";
        return "other";
    }
}
