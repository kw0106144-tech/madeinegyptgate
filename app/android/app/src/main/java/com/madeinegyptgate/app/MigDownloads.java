package com.madeinegyptgate.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.util.Base64;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Logger;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

/**
 * Files that the site hands out. A WebView downloads nothing by itself, so:
 * - a link to a file on the web (https: CSV, PDF …) opens in the phone's browser, which downloads it;
 * - a file the page builds itself (blob: / data:, e.g. «أضف إلى التقويم» = an .ics on the events pages, exports of the team
 *   boards) is read from the page, kept in the app's cache and opened with the app that handles it (calendar, files, sheets …),
 *   else offered in the share sheet.
 * The page → app channel (MIGAppDownload) exists only on the platform's own origins and only answers a download the app asked
 * for in the last minute.
 */
final class MigDownloads {

    private static final String CHANNEL = "MIGAppDownload";
    private static final int MAX_BYTES = 25 * 1024 * 1024;
    private static final long PENDING_MS = 60_000L;

    private final Activity activity;
    private final WebView webView;
    private String pendingName;
    private long pendingAt;

    MigDownloads(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    void install() {
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            onDownload(url, contentDisposition, mimeType)
        );
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Set<String> origins = new HashSet<>();
            origins.add("https://madeinegyptgate.com");
            origins.add("https://www.madeinegyptgate.com");
            WebViewCompat.addWebMessageListener(webView, CHANNEL, origins, (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                final String data = message.getData();
                if (data != null) activity.runOnUiThread(() -> onPageFile(data));
            });
        }
    }

    private void onDownload(String url, String contentDisposition, String mimeType) {
        if (url == null) return;
        String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
        if (url.startsWith("data:")) {
            open(url, name, mimeType);
        } else if (url.startsWith("blob:")) {
            pendingName = name;
            pendingAt = SystemClock.elapsedRealtime();
            String js =
                "(function(u){try{var x=new XMLHttpRequest();x.open('GET',u,true);x.responseType='blob';" +
                "x.onload=function(){var r=new FileReader();r.onloadend=function(){if(window." + CHANNEL + "){" + CHANNEL +
                ".postMessage(JSON.stringify({type:(x.response&&x.response.type)||'',data:String(r.result||'')}));}};" +
                "r.readAsDataURL(x.response);};x.send();}catch(e){}})(" + JSONObject.quote(url) + ");";
            webView.evaluateJavascript(js, null);
        } else if (url.startsWith("https://") || url.startsWith("http://")) {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (ActivityNotFoundException e) {
                failed();
            }
        }
    }

    private void onPageFile(String json) {
        String name = pendingName;
        boolean asked = name != null && SystemClock.elapsedRealtime() - pendingAt < PENDING_MS;
        pendingName = null;
        if (!asked) return;
        try {
            JSONObject o = new JSONObject(json);
            open(o.optString("data", ""), name, o.optString("type", ""));
        } catch (Exception e) {
            failed();
        }
    }

    /** data:[type][;base64],payload → cache/downloads/name → ACTION_VIEW, else the share sheet */
    private void open(String dataUrl, String name, String mimeHint) {
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
        if (type.isEmpty()) type = mimeHint != null && !mimeHint.isEmpty() ? mimeHint : "application/octet-stream";
        try {
            String payload = dataUrl.substring(comma + 1);
            byte[] bytes = base64 ? Base64.decode(payload, Base64.DEFAULT) : Uri.decode(payload).getBytes(StandardCharsets.UTF_8);
            if (bytes.length == 0 || bytes.length > MAX_BYTES) {
                failed();
                return;
            }
            File dir = new File(activity.getCacheDir(), "downloads");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("no cache dir");
            File file = new File(dir, safeName(name));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
            Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                activity.startActivity(view);
            } catch (ActivityNotFoundException none) {
                Intent send = new Intent(Intent.ACTION_SEND)
                    .setType(type)
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.startActivity(Intent.createChooser(send, activity.getString(R.string.mig_share_file)));
            }
        } catch (Exception e) {
            Logger.warn("MIGDownloads", "could not open the file: " + e.getClass().getSimpleName());
            failed();
        }
    }

    /** a file name that is safe in the cache folder (letters of any script, digits, . _ - and spaces), at most 80 characters */
    static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[^\\p{L}\\p{N}._ -]", "_").trim();
        if (n.isEmpty() || n.startsWith(".")) n = "file" + n;
        return n.length() > 80 ? n.substring(n.length() - 80) : n;
    }

    private void failed() {
        Toast.makeText(activity, R.string.mig_file_failed, Toast.LENGTH_LONG).show();
    }
}
