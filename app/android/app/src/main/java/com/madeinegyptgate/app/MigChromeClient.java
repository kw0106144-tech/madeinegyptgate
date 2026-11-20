package com.madeinegyptgate.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Message;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.Logger;
import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Capacitor's chrome client for the main page, with what a browser tab does on top:
 * - new windows (target=_blank, window.open) from a tap → MigWindows (same-site-new-windows): a page of the site opens over the
 *   page, which keeps running (a live call goes on); window.close() / opener.focus() close it again. Without a tap, window.open
 *   gives null: Chrome's pop-up blocker, which the site already handles;
 * - microphone / camera only for the platform's pages, one system dialog at a time (MigAsk, mic-permission-race): every request
 *   that came meanwhile gets the same answer, and only a permission the phone really holds is granted;
 * - real full screen for videos (BridgeWebChromeClient closes it at once), following the phone's rotation like Chrome's player
 *   (fullscreen-video-rotation);
 * - alert / confirm / prompt: the WebView's own dialogs, with the phone's language on the buttons («حسناً» / «إلغاء»), the page's
 *   address as the title and the prompt's default text (Capacitor's say "OK" / "Cancel" in English: localized-js-dialogs);
 * - the file chooser of pictures and documents: the gallery / files plus the camera, any file for documents (like Chrome:
 *   android-camera-in-chooser); inputs that capture keep Capacitor's camera;
 * - the thin load bar over the page (page-load-progress).
 * Child windows reuse onPermissionRequest / onShowFileChooser of this client: Android lets an activity register its result
 * launchers only while it starts (here, from MainActivity.onCreate).
 */
class MigChromeClient extends BridgeWebChromeClient {

    private static final String[] DEVICE_PERMISSIONS = { Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA };

    private final Activity activity;
    private final FullScreen full;
    private final MigAsk<PermissionRequest> ask = new MigAsk<>();
    private final ActivityResultLauncher<String[]> askLauncher;
    private final ActivityResultLauncher<String> cameraAsk;
    private final ActivityResultLauncher<Intent> chooserLauncher;
    private MigWindows windows;
    private ProgressBar progress;
    private ValueCallback<Uri[]> chooserCallback;
    private Runnable afterCameraAsk;
    private File cameraFile;
    private Uri cameraUri;

    MigChromeClient(Bridge bridge) {
        super(bridge);
        this.activity = bridge.getActivity();
        this.full = new FullScreen(activity, activity.getWindow());
        askLauncher = bridge.registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> answerAll());
        cameraAsk = bridge.registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            Runnable r = afterCameraAsk;
            afterCameraAsk = null;
            if (r != null) r.run();
        });
        chooserLauncher = bridge.registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
            Uri[] files = null;
            if (r.getResultCode() == Activity.RESULT_OK) {
                Intent data = r.getData();
                if (data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                    ClipData clip = data.getClipData();
                    files = new Uri[clip.getItemCount()];
                    for (int i = 0; i < files.length; i++) files[i] = clip.getItemAt(i).getUri();
                } else if (data != null && data.getData() != null) {
                    files = new Uri[] { data.getData() };
                } else if (cameraFile != null && cameraFile.length() > 0) {
                    files = new Uri[] { cameraUri };
                }
            }
            finishChooser(files);
        });
    }

    void setWindows(MigWindows windows) {
        this.windows = windows;
    }

    void setProgressBar(ProgressBar progress) {
        this.progress = progress;
    }

    // ---------- new windows ----------

    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        return windows != null && isUserGesture && windows.open(view, resultMsg);
    }

    @Override
    public void onCloseWindow(WebView window) {
        if (windows != null) windows.close(window);
    }

    /** opener.focus() from a page window (data/bassem-tab.js «ارجع للمكالمة»): this page comes to the front */
    @Override
    public void onRequestFocus(WebView view) {
        if (windows != null) view.post(() -> windows.focus(view));
    }

    // ---------- microphone / camera ----------

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        if (!MigLinks.isSiteUrl(request.getOrigin())) {
            request.deny();
            return;
        }
        String[] needed = needed(request.getResources());
        if (needed.length == 0) {
            super.onPermissionRequest(request); // nothing the phone must allow
            return;
        }
        if (MigAsk.allHeld(needed, held())) {
            request.grant(request.getResources());
            return;
        }
        if (ask.add(request)) {
            String[] asked = new String[needed.length + 1];
            System.arraycopy(needed, 0, asked, 0, needed.length);
            asked[needed.length] = Manifest.permission.MODIFY_AUDIO_SETTINGS; // as Capacitor (granted at install)
            try {
                askLauncher.launch(asked);
            } catch (Exception e) {
                answerAll();
            }
        }
    }

    @Override
    public void onPermissionRequestCanceled(PermissionRequest request) {
        ask.remove(request);
    }

    private void answerAll() {
        Set<String> held = held();
        for (PermissionRequest r : ask.answer()) {
            if (MigAsk.allHeld(needed(r.getResources()), held)) r.grant(r.getResources());
            else r.deny();
        }
    }

    private static String[] needed(String[] resources) {
        List<String> out = new ArrayList<>();
        if (resources != null) {
            for (String r : resources) {
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && !out.contains(Manifest.permission.RECORD_AUDIO)) out.add(Manifest.permission.RECORD_AUDIO);
                else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && !out.contains(Manifest.permission.CAMERA)) out.add(Manifest.permission.CAMERA);
            }
        }
        return out.toArray(new String[0]);
    }

    private Set<String> held() {
        Set<String> s = new HashSet<>();
        for (String p : DEVICE_PERMISSIONS) if (ContextCompat.checkSelfPermission(activity, p) == PackageManager.PERMISSION_GRANTED) s.add(p);
        return s;
    }

    // ---------- full screen ----------

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        full.show(view, callback);
    }

    @Override
    public void onHideCustomView() {
        full.hide();
    }

    boolean isFullScreen() {
        return full.isOn();
    }

    // ---------- alert / confirm / prompt ----------

    @Override
    public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
        return quietWhenClosing(result);
    }

    @Override
    public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
        return quietWhenClosing(result);
    }

    @Override
    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
        return quietWhenClosing(result);
    }

    @Override
    public boolean onJsBeforeUnload(WebView view, String url, String message, JsResult result) {
        return quietWhenClosing(result);
    }

    /** false = the WebView shows its own localized dialog; a closing app answers "cancel" without one */
    private boolean quietWhenClosing(JsResult result) {
        if (activity.isFinishing() || activity.isDestroyed()) {
            result.cancel();
            return true;
        }
        return false;
    }

    // ---------- load bar ----------

    @Override
    public void onProgressChanged(WebView view, int newProgress) {
        super.onProgressChanged(view, newProgress);
        showProgress(progress, newProgress);
    }

    /** the thin load bar: shown while a page loads (below 100), hidden when it is there */
    static void showProgress(ProgressBar bar, int p) {
        if (bar == null) return;
        if (p >= 100) {
            bar.setVisibility(View.GONE);
            bar.setProgress(0);
        } else {
            bar.setVisibility(View.VISIBLE);
            bar.setProgress(Math.max(p, 5));
        }
    }

    // ---------- file chooser ----------

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams params) {
        String[] accept = params.getAcceptTypes();
        boolean capture = params.isCaptureEnabled();
        final int kind = MigLinks.chooserKind(accept, capture);
        if (kind == MigLinks.CHOOSER_CAPACITOR) return super.onShowFileChooser(webView, filePathCallback, params);
        if (chooserCallback != null) chooserCallback.onReceiveValue(null); // an earlier chooser that never answered
        chooserCallback = filePathCallback;
        final boolean multiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
        final boolean camera = MigLinks.chooserCamera(accept, capture) && hasCameraApp();
        Runnable show = () -> showChooser(kind, accept, multiple, camera && cameraGranted());
        if (camera && !cameraGranted()) {
            // as Chrome: the camera joins the chooser once the phone allows it (CAMERA is declared, so the camera app needs it)
            afterCameraAsk = show;
            try {
                cameraAsk.launch(Manifest.permission.CAMERA);
            } catch (Exception e) {
                afterCameraAsk = null;
                show.run();
            }
        } else {
            show.run();
        }
        return true;
    }

    private void showChooser(int kind, String[] accept, boolean multiple, boolean camera) {
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE);
        if (kind == MigLinks.CHOOSER_IMAGES) {
            pick.setType("image/*");
            List<String> types = MigLinks.imageMimeTypes(accept);
            if (!types.isEmpty()) pick.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
        } else {
            pick.setType("*/*"); // documents: any file, as Chrome (a .csv often comes as text/plain or application/octet-stream)
        }
        if (multiple) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        Intent chooser = Intent.createChooser(pick, activity.getString(R.string.mig_chooser_title));
        cameraFile = null;
        cameraUri = null;
        if (camera) {
            try {
                File dir = new File(activity.getCacheDir(), "camera");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("no camera folder");
                dropOld(dir);
                cameraFile = File.createTempFile("IMG_", ".jpg", dir);
                cameraUri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", cameraFile);
                Intent shot = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                shot.setClipData(ClipData.newRawUri("", cameraUri));
                shot.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                for (ResolveInfo ri : cameraApps(shot)) {
                    activity.grantUriPermission(ri.activityInfo.packageName, cameraUri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { shot });
            } catch (Exception e) {
                Logger.warn("MIGChooser", "no camera in the chooser: " + e.getClass().getSimpleName());
                if (cameraFile != null && !cameraFile.delete()) cameraFile.deleteOnExit();
                cameraFile = null;
                cameraUri = null;
            }
        }
        try {
            chooserLauncher.launch(chooser);
        } catch (ActivityNotFoundException e) {
            finishChooser(null);
        }
    }

    private void finishChooser(Uri[] files) {
        boolean usedCamera = files != null && files.length == 1 && cameraUri != null && cameraUri.equals(files[0]);
        if (cameraUri != null) activity.revokeUriPermission(cameraUri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (!usedCamera && cameraFile != null && !cameraFile.delete()) cameraFile.deleteOnExit();
        ValueCallback<Uri[]> cb = chooserCallback;
        chooserCallback = null;
        cameraFile = null;
        cameraUri = null;
        if (cb != null) cb.onReceiveValue(files);
    }

    private boolean cameraGranted() {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    /** a camera app is there (AndroidManifest.xml queries IMAGE_CAPTURE) */
    private boolean hasCameraApp() {
        return !cameraApps(new Intent(MediaStore.ACTION_IMAGE_CAPTURE)).isEmpty();
    }

    @SuppressWarnings("deprecation")
    private List<ResolveInfo> cameraApps(Intent shot) {
        PackageManager pm = activity.getPackageManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return pm.queryIntentActivities(shot, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY));
        }
        return pm.queryIntentActivities(shot, PackageManager.MATCH_DEFAULT_ONLY);
    }

    /** camera photos older than a day (the upload read them long ago) */
    private static void dropOld(File dir) {
        File[] old = dir.listFiles();
        if (old == null) return;
        long day = System.currentTimeMillis() - 24L * 3600L * 1000L;
        for (File f : old) if (f.lastModified() < day && !f.delete()) f.deleteOnExit();
    }

    /**
     * A video in full screen inside a window (the activity's, or a page window's dialog): the bars hide, and the screen follows
     * the phone's rotation while it lasts (SCREEN_ORIENTATION_SENSOR, also with auto-rotate off, as Chrome's player turns to
     * landscape); leaving it restores what was there.
     */
    static final class FullScreen {

        private final Activity activity;
        private final Window window;
        private View view;
        private CustomViewCallback callback;
        private int orientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;

        FullScreen(Activity activity, Window window) {
            this.activity = activity;
            this.window = window;
        }

        boolean isOn() {
            return view != null;
        }

        void show(View v, CustomViewCallback cb) {
            if (view != null || window == null) {
                cb.onCustomViewHidden();
                return;
            }
            view = v;
            callback = cb;
            orientation = activity.getRequestedOrientation();
            activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
            ViewGroup decor = (ViewGroup) window.getDecorView();
            decor.addView(v, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, decor);
            bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            bars.hide(WindowInsetsCompat.Type.systemBars());
        }

        void hide() {
            if (view == null) return;
            ViewGroup decor = (ViewGroup) window.getDecorView();
            decor.removeView(view);
            view = null;
            WindowCompat.getInsetsController(window, decor).show(WindowInsetsCompat.Type.systemBars());
            activity.setRequestedOrientation(orientation);
            CustomViewCallback cb = callback;
            callback = null;
            if (cb != null) cb.onCustomViewHidden();
        }
    }
}
