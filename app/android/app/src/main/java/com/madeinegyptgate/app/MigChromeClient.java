package com.madeinegyptgate.app;

import android.app.Activity;
import android.net.Uri;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.widget.FrameLayout;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Capacitor's chrome client, which already does what the live calls and the forms need:
 * - getUserMedia: onPermissionRequest asks Android for RECORD_AUDIO (+ MODIFY_AUDIO_SETTINGS) / CAMERA, then grants the page
 *   (Janna and Bassem ask for the microphone only; the declared permissions are in AndroidManifest.xml);
 * - &lt;input type=file&gt; (registration documents, product photos): the system file picker, or the camera when the input asks
 *   for capture;
 * - alert / confirm / prompt dialogs.
 * Added here:
 * - microphone / camera only for pages of the platform (the WebView shows no other site, but an embedded frame could ask);
 * - real full screen for videos (BridgeWebChromeClient closes a full-screen video at once).
 */
class MigChromeClient extends BridgeWebChromeClient {

    private final Activity activity;
    private View fullView;
    private CustomViewCallback fullCallback;

    MigChromeClient(Bridge bridge) {
        super(bridge);
        this.activity = bridge.getActivity();
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        Uri origin = request.getOrigin();
        if (!MigLinks.isSiteUrl(origin)) {
            request.deny();
            return;
        }
        super.onPermissionRequest(request);
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        if (fullView != null) {
            callback.onCustomViewHidden();
            return;
        }
        fullView = view;
        fullCallback = callback;
        ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
        decor.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(activity.getWindow(), decor);
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public void onHideCustomView() {
        if (fullView == null) return;
        ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
        decor.removeView(fullView);
        fullView = null;
        WindowCompat.getInsetsController(activity.getWindow(), decor).show(WindowInsetsCompat.Type.systemBars());
        CustomViewCallback cb = fullCallback;
        fullCallback = null;
        if (cb != null) cb.onCustomViewHidden();
    }

    boolean isFullScreen() {
        return fullView != null;
    }
}
