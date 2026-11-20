package com.madeinegyptgate.app;

import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

/**
 * Pull to reload around a WebView, the way Chrome does it (android-pull-to-reload). A WebView tells its parent only whether the
 * page itself is at its top, not whether the finger is in the phone menu, a live call, a scrolling box or a map, so a plain
 * SwipeRefreshLayout would reload there too. Here the page answers at every touch (MigPage.SCRIPT → MIGAppPull → pageAnswer):
 * a pull starts only after the page said yes for this touch. At the touch itself (ACTION_DOWN) the layout notes where it began
 * whenever the page is at its top; the answer arrives before the finger has moved far enough to start a pull, and a late
 * answer only means no pull for that touch.
 */
public class MigPullLayout extends SwipeRefreshLayout {

    private volatile boolean pageSaysYes;
    private boolean atDown;

    public MigPullLayout(Context context) {
        this(context, null);
    }

    public MigPullLayout(Context context, AttributeSet attrs) {
        super(context, attrs);
        setColorSchemeColors(ContextCompat.getColor(context, R.color.mig_red));
    }

    /** the page's answer for the current touch (MigPage) */
    void pageAnswer(boolean yes) {
        pageSaysYes = yes;
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent ev) {
        if (ev.getActionMasked() == MotionEvent.ACTION_DOWN) {
            pageSaysYes = false; // a new touch: no pull until the page says so
            atDown = true;
            try {
                return super.onInterceptTouchEvent(ev);
            } finally {
                atDown = false;
            }
        }
        return super.onInterceptTouchEvent(ev);
    }

    @Override
    public boolean canChildScrollUp() {
        View target = getChildCount() > 0 ? findTarget() : null;
        boolean up = target != null && target.canScrollVertically(-1);
        if (atDown) return up; // where the touch began, if the page is at its top
        return up || !pageSaysYes;
    }

    private View findTarget() {
        for (int i = 0; i < getChildCount(); i++) {
            View c = getChildAt(i);
            if (c instanceof android.webkit.WebView) return c;
        }
        return null;
    }
}
