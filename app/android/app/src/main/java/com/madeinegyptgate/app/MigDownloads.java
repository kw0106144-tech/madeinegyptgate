package com.madeinegyptgate.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Logger;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONObject;

/**
 * Files that the site hands out, saved where Chrome saves them: the phone's Downloads, with the page's own file name, then
 * «… محفوظ في التنزيلات — فتح» (android-downloads).
 * - A file on the web (https: the meeting's .ics «📅 أضف للتقويم», e-mailed recordings, CSV …): Android's DownloadManager, with
 *   this WebView's user agent and cookies, its own notification, Downloads (Android 10+; the app's own Downloads folder below).
 *   Never ACTION_VIEW: once the App Links are verified, a link of the site would come back to this app and download again (a loop).
 * - A file the page makes itself (blob: / data:: the call's «أضف للتقويم», the Control Center's «⬇ تصدير Excel», the SEO CSV
 *   exports): a script of the app (document start, the site's origins only) catches the click on &lt;a download&gt;, reads the file
 *   at once (before the page revokes its blob: URL) and posts {name, type, data, k} on MIGAppDownload; it is saved to
 *   MediaStore Downloads (Android 10+; the app's own Downloads folder below) and offered to open. k is this WebView's random key,
 *   known only to the app's own scripts. Without document-start scripts (an old WebView) the download listener reads a blob:
 *   itself (same channel; its XHR reports errors).
 */
final class MigDownloads {

    private static final String CHANNEL = "MIGAppDownload";
    private static final int MAX_BYTES = 25 * 1024 * 1024;
    /** DownloadManager ids this app started → the page that asked (its window shows «فتح» when the file is there) */
    private static final Map<Long, WeakReference<MigDownloads>> RUNNING = new HashMap<>();
    private static final Map<Long, String> NAMES = new HashMap<>();

    private final Activity activity;
    private final WebView webView;
    private final Runnable onWebFile;
    private final String key;

    /** onWebFile: a file on the web started downloading (a window that never showed a page closes: MigWindows) */
    MigDownloads(Activity activity, WebView webView, Runnable onWebFile) {
        this.activity = activity;
        this.webView = webView;
        this.onWebFile = onWebFile;
        byte[] b = new byte[16];
        new SecureRandom().nextBytes(b);
        StringBuilder k = new StringBuilder();
        for (byte x : b) k.append(String.format(Locale.ROOT, "%02x", x));
        this.key = k.toString();
    }

    void install() {
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            onDownload(url, userAgent, contentDisposition, mimeType)
        );
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(webView, CHANNEL, MigPage.ORIGINS, (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
            final String data = message.getData();
            if (data != null) activity.runOnUiThread(() -> onPageFile(data));
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, captureScript(key), MigPage.ORIGINS);
        }
    }

    /**
     * The click on a page-made file (ES5: it runs in the page). Bubble phase on window, so a page that cancels its own click keeps
     * it cancelled; preventDefault stops WebView's own download (no second copy through the listener).
     */
    static String captureScript(String key) {
        return (
            "(function(K){if(window.__migDl)return;window.__migDl=1;" +
            "function send(o){o.k=K;try{if(window." + CHANNEL + ")window." + CHANNEL + ".postMessage(JSON.stringify(o));}catch(e){}}" +
            "window.addEventListener('click',function(e){" +
            "if(e.defaultPrevented||!window." + CHANNEL + ")return;" +
            "var t=e.target,a=t&&t.closest?t.closest('a[download]'):null;if(!a)return;" +
            "var h=String(a.href||'');if(!/^(blob|data):/i.test(h))return;" +
            "e.preventDefault();var n=a.getAttribute('download')||'';" +
            "if(/^data:/i.test(h)){send({name:n,type:'',data:h});return;}" +
            "try{var x=new XMLHttpRequest();x.open('GET',h,true);x.responseType='blob';" +
            "x.onload=function(){var b=x.response;if(!b){send({error:1});return;}var r=new FileReader();" +
            "r.onloadend=function(){send(r.result?{name:n,type:b.type||'',data:String(r.result)}:{error:1});};r.readAsDataURL(b);};" +
            "x.onerror=function(){send({error:1});};x.send();}catch(er){send({error:1});}" +
            "},false);})(" +
            jsString(key) +
            ");"
        );
    }

    private void onDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        if (url == null) return;
        String guessed = URLUtil.guessFileName(url, contentDisposition, mimeType);
        if (url.startsWith("data:")) {
            saveDataUrl(url, safeName(guessed), mimeType);
        } else if (url.startsWith("blob:")) {
            // a page-made file the app's script did not see (no document-start scripts in this WebView): read it here
            webView.evaluateJavascript(readBlobScript(url, guessed, key), null);
        } else if (url.startsWith("https://") || url.startsWith("http://")) {
            if (onWebFile != null) onWebFile.run();
            enqueue(url, userAgent, guessed, mimeType);
        }
    }

    /** reads a blob: of the page and posts it like captureScript does (ES5: it runs in the page; its XHR reports errors) */
    static String readBlobScript(String url, String name, String key) {
        return (
            "(function(u,n,K){function s(o){o.k=K;try{if(window." + CHANNEL + ")window." + CHANNEL + ".postMessage(JSON.stringify(o));}catch(e){}}" +
            "try{var x=new XMLHttpRequest();x.open('GET',u,true);x.responseType='blob';" +
            "x.onload=function(){var b=x.response;if(!b){s({error:1});return;}var r=new FileReader();" +
            "r.onloadend=function(){s(r.result?{name:n,type:b.type||'',data:String(r.result)}:{error:1});};r.readAsDataURL(b);};" +
            "x.onerror=function(){s({error:1});};x.send();}catch(e){s({error:1});}})(" +
            jsString(url) + "," + jsString(name) + "," + jsString(key) + ");"
        );
    }

    /** a JavaScript string literal of any text (quotes, backslashes, line breaks and U+2028 / U+2029 escaped) */
    static String jsString(String v) {
        if (v == null) return "null";
        StringBuilder b = new StringBuilder(v.length() + 2).append('"');
        for (int i = 0; i < v.length(); i++) {
            char c = v.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c == 0x2028 || c == 0x2029 || c == '<' || c == '>') b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    private void enqueue(String url, String userAgent, String guessed, String mimeType) {
        String name = safeName(guessed);
        try {
            DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) throw new IllegalStateException("no DownloadManager");
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            r.addRequestHeader("User-Agent", userAgent != null && !userAgent.isEmpty() ? userAgent : webView.getSettings().getUserAgentString());
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null && !cookies.isEmpty()) r.addRequestHeader("Cookie", cookies);
            r.setMimeType(mimeFor(name, mimeType));
            r.setTitle(name);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            else r.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, name);
            long id = dm.enqueue(r);
            synchronized (RUNNING) {
                RUNNING.put(id, new WeakReference<>(this));
                NAMES.put(id, name);
            }
            Toast.makeText(activity, activity.getString(R.string.mig_dl_started, name), Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            // DownloadManager switched off (Settings → Apps) or refused the address: the phone's browser downloads it, never this app
            Logger.warn("MIGDownloads", "DownloadManager unavailable: " + e.getClass().getSimpleName());
            if (!MigOut.browser(activity, url)) failed();
        }
    }

    /** Android's DownloadManager finished one of ours: the notice in the window that asked (MainActivity registers this once) */
    static BroadcastReceiver listen(Activity activity) {
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                MigDownloads owner;
                String name;
                synchronized (RUNNING) {
                    WeakReference<MigDownloads> w = RUNNING.remove(id);
                    owner = w != null ? w.get() : null;
                    name = NAMES.remove(id);
                }
                if (name != null) finished(activity, owner, id, name);
            }
        };
        // sent by the system's download provider (another process): exported, but only our own ids are acted on, after a check
        ContextCompat.registerReceiver(
            activity,
            receiver,
            new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_EXPORTED
        );
        return receiver;
    }

    private static void finished(Activity activity, MigDownloads owner, long id, String name) {
        if (activity.isFinishing()) return;
        DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) return;
        int status = -1;
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
            if (c != null && c.moveToFirst()) status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
        } catch (Exception e) {
            status = -1;
        }
        View near = owner != null && owner.webView.getParent() != null ? owner.webView : activity.findViewById(R.id.mig_root);
        if (status == DownloadManager.STATUS_FAILED) {
            MigOut.notice(near, activity.getString(R.string.mig_file_failed), null, null);
            return;
        }
        if (status != DownloadManager.STATUS_SUCCESSFUL) return; // cancelled from the notification: nothing to say
        MigOut.notice(near, activity.getString(R.string.mig_dl_done, name), activity.getString(R.string.mig_dl_open), () ->
            open(activity, dm.getUriForDownloadedFile(id), dm.getMimeTypeForDownloadedFile(id))
        );
    }

    private void onPageFile(String json) {
        try {
            JSONObject o = new JSONObject(json);
            if (!key.equals(o.optString("k", ""))) return; // only the app's own scripts
            if (o.optInt("error", 0) != 0) {
                failed();
                return;
            }
            saveDataUrl(o.optString("data", ""), chooseName(o.optString("name", ""), "download"), o.optString("type", ""));
        } catch (Exception e) {
            failed();
        }
    }

    /** data:[type][;base64],payload → Downloads */
    private void saveDataUrl(String dataUrl, String name, String mimeHint) {
        int comma = dataUrl.indexOf(',');
        if (!dataUrl.startsWith("data:") || comma < 0) {
            failed();
            return;
        }
        String meta = dataUrl.substring(5, comma);
        boolean base64 = meta.endsWith(";base64");
        String type = base64 ? meta.substring(0, meta.length() - 7) : meta;
        int semi = type.indexOf(';');
        if (semi >= 0) type = type.substring(0, semi);
        if (type.isEmpty()) type = mimeHint;
        try {
            String payload = dataUrl.substring(comma + 1);
            byte[] bytes = base64 ? Base64.decode(payload, Base64.DEFAULT) : Uri.decode(payload).getBytes(StandardCharsets.UTF_8);
            if (bytes.length == 0 || bytes.length > MAX_BYTES) {
                failed();
                return;
            }
            save(bytes, name, mimeFor(name, type));
        } catch (Exception e) {
            Logger.warn("MIGDownloads", "could not save the file: " + e.getClass().getSimpleName());
            failed();
        }
    }

    private void save(byte[] bytes, String name, String type) throws Exception {
        Uri uri;
        boolean inDownloads;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver cr = activity.getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, type);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IllegalStateException("MediaStore refused the file");
            try (OutputStream out = cr.openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("no output stream");
                out.write(bytes);
            } catch (Exception e) {
                cr.delete(uri, null, null);
                throw e;
            }
            v.clear();
            v.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, v, null, null);
            inDownloads = true;
        } else {
            // Android 7–9: the app's own Downloads folder (no storage permission); the notice opens it
            File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) dir = new File(activity.getCacheDir(), "downloads");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("no folder");
            File file = new File(dir, name);
            for (int i = 1; file.exists() && i < 100; i++) file = new File(dir, numbered(name, i));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
            inDownloads = false;
        }
        final Uri saved = uri;
        String text = activity.getString(inDownloads ? R.string.mig_dl_done : R.string.mig_dl_ready, name);
        MigOut.notice(webView, text, activity.getString(R.string.mig_dl_open), () -> open(activity, saved, type));
    }

    /** the file in the app that handles its type (calendar, sheets, PDF …), else the share sheet */
    private static void open(Activity activity, Uri uri, String type) {
        if (uri == null) {
            MigOut.toast(activity, R.string.mig_file_failed);
            return;
        }
        String t = type != null && !type.isEmpty() ? type : "application/octet-stream";
        Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, t).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(view);
        } catch (ActivityNotFoundException none) {
            Intent send = new Intent(Intent.ACTION_SEND).setType(t).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                activity.startActivity(Intent.createChooser(send, activity.getString(R.string.mig_share_file)));
            } catch (ActivityNotFoundException e) {
                MigOut.toast(activity, R.string.mig_file_failed);
            }
        }
    }

    /** the type the file name says (what the opening app expects), else the page's, else bytes */
    private static String mimeFor(String name, String hint) {
        int dot = name.lastIndexOf('.');
        if (dot >= 0 && dot < name.length() - 1) {
            String byName = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(Locale.ROOT));
            if (byName != null) return byName;
        }
        String h = hint == null ? "" : hint.trim();
        int semi = h.indexOf(';');
        if (semi >= 0) h = h.substring(0, semi).trim();
        return h.isEmpty() ? "application/octet-stream" : h.toLowerCase(Locale.ROOT);
    }

    /** the page's own name (&lt;a download="…"&gt;) wins over the guessed one; both made safe */
    static String chooseName(String pageName, String guessed) {
        String n = pageName != null && !pageName.trim().isEmpty() ? pageName.trim() : guessed;
        return safeName(n);
    }

    /** a file name that is safe in a folder (letters of any script, digits, . _ - and spaces), at most 80 characters */
    static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[^\\p{L}\\p{N}._ -]", "_").trim();
        if (n.isEmpty() || n.startsWith(".")) n = "file" + n;
        return n.length() > 80 ? n.substring(n.length() - 80) : n;
    }

    /** "x.csv", 1 → "x (1).csv" */
    static String numbered(String name, int i) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) + " (" + i + ")" + name.substring(dot) : name + " (" + i + ")";
    }

    private void failed() {
        Toast.makeText(activity, R.string.mig_file_failed, Toast.LENGTH_LONG).show();
    }
}
