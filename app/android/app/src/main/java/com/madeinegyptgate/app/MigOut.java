package com.madeinegyptgate.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.coordinatorlayout.widget.CoordinatorLayout;

/**
 * Leaving the app (another app, the phone's browser, the share sheet, the clipboard) and the short in-app notice with one
 * action (a file saved to Downloads → «فتح»), the way Chrome shows its own.
 */
final class MigOut {

    private static final String NOTICE_TAG = "mig-notice";
    private static final int NOTICE_MS = 8000;

    private MigOut() {}

    /** mail, phone, WhatsApp, another site …: the app that handles it, exactly as Capacitor's Bridge.launchIntent does */
    static boolean external(Activity activity, String url) {
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            toast(activity, R.string.mig_link_failed);
            return false;
        }
    }

    /**
     * The phone's own browser, also for madeinegyptgate.com: a plain ACTION_VIEW of the site would come straight back to this app
     * once its App Links are verified (an API file, a payment page, the old system's pages, «افتح في المتصفح»).
     */
    static boolean browser(Activity activity, String url) {
        Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        view.setSelector(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER));
        try {
            activity.startActivity(view);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            // no browser declares itself as one: another site may still open in whatever handles it, never the site itself (a loop)
            if (!MigLinks.isSiteUrl(url)) return external(activity, url);
            toast(activity, R.string.mig_link_failed);
            return false;
        }
    }

    static void share(Activity activity, String url) {
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url);
        try {
            activity.startActivity(Intent.createChooser(send, null));
        } catch (ActivityNotFoundException e) {
            toast(activity, R.string.mig_link_failed);
        }
    }

    static void copy(Activity activity, String url) {
        ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm == null) return;
        cm.setPrimaryClip(ClipData.newPlainText(activity.getString(R.string.mig_link_copy), url));
        // Android 13+ confirms a copy itself (its clipboard overlay); older phones say nothing
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) toast(activity, R.string.mig_link_copied);
    }

    static void toast(Context context, int text) {
        Toast.makeText(context, text, Toast.LENGTH_LONG).show();
    }

    /**
     * A notice at the bottom of the window of `near` (the page, or the window over it), with one action; it goes by itself.
     * Used for files: «… محفوظ في التنزيلات — فتح» (Chrome's own download notice).
     */
    static void notice(android.view.View near, CharSequence text, CharSequence action, Runnable onAction) {
        ViewGroup host = noticeHost(near);
        if (host == null) {
            if (near != null) Toast.makeText(near.getContext(), text, Toast.LENGTH_LONG).show();
            return;
        }
        android.view.View old = host.findViewWithTag(NOTICE_TAG);
        if (old != null) host.removeView(old);
        Context c = host.getContext();
        LinearLayout bar = new LinearLayout(c);
        bar.setTag(NOTICE_TAG);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xF0202124);
        bg.setCornerRadius(dp(c, 8));
        bar.setBackground(bg);
        bar.setElevation(dp(c, 6));
        bar.setPaddingRelative(dp(c, 16), dp(c, 6), dp(c, 6), dp(c, 6));
        bar.setMinimumHeight(dp(c, 48));
        TextView t = new TextView(c);
        t.setText(text);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        t.setMaxLines(2);
        t.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        bar.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        if (action != null && onAction != null) {
            TextView b = new TextView(c);
            b.setText(action);
            b.setTextColor(0xFFE9C46A);
            b.setTypeface(Typeface.DEFAULT_BOLD);
            b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            b.setGravity(Gravity.CENTER);
            b.setMinWidth(dp(c, 64));
            b.setMinHeight(dp(c, 40));
            b.setPadding(dp(c, 12), 0, dp(c, 12), 0);
            b.setOnClickListener(v -> {
                host.removeView(bar);
                onAction.run();
            });
            bar.addView(b, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        int m = dp(c, 12);
        ViewGroup.MarginLayoutParams lp;
        if (host instanceof CoordinatorLayout) {
            CoordinatorLayout.LayoutParams cl = new CoordinatorLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            cl.gravity = Gravity.BOTTOM;
            lp = cl;
        } else {
            lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        }
        lp.setMargins(m, m, m, m);
        host.addView(bar, lp);
        bar.postDelayed(() -> host.removeView(bar), NOTICE_MS);
    }

    /** the nearest frame around the WebView (the page's layout or the window over it), never the pull-to-reload layout */
    private static ViewGroup noticeHost(android.view.View near) {
        if (near == null) return null;
        ViewParent p = near instanceof CoordinatorLayout || near instanceof FrameLayout ? (ViewParent) near : near.getParent();
        while (p instanceof ViewGroup) {
            if (p instanceof CoordinatorLayout || p instanceof FrameLayout) return (ViewGroup) p;
            p = p.getParent();
        }
        return null;
    }

    static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }
}
