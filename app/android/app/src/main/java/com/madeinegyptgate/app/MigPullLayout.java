package com.madeinegyptgate.app;

import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

/**
 * Pull to reload around a WebView, the way Chrome does it (android-pull-to-reload). A WebView tells its parent only whether the
 * page itself is at its top, not whether the finger is in the phone menu, a live call, a scrolling box or a map, so a plain
 * SwipeRefreshLayout would reload there too. Here the page answers at every touch (MigPage.SCRIPT → MIGAppPull → pageAnswer):
 * a pull starts only after the page said yes for this touch. At the touch itself (ACTION_DOWN) the layout notes where it began
 * whenever the page is at its top; the answer arrives before the finger has moved far enough to start a pull, and a late
 * answer only means no pull for that touch.
 *
 * Chrome never reloads from a pinch or a sideways swipe, and SwipeRefreshLayout starts a pull as soon as the first finger has gone
 * down by the touch slop, whatever a second finger or the sideways movement do. So a touch is not a pull, for the rest of it, once a
 * second finger is down (pinch-zoom: zoomEnabled) or once its finger has moved sideways at least as much as down beyond the touch slop
 * before a pull started (a row of chips, a slider or a wide table that scrolls sideways: the row keeps the swipe) — the way Chrome
 * keeps a gesture on the scroller its first movement chose. A pull that has started stays a pull until the finger is lifted (a later
 * second finger never leaves the spinner half-way). The decisions are plain functions (pinchOrSideways, refusesPull: MigLogicTest).
 */
public class MigPullLayout extends SwipeRefreshLayout {

    private final int slop;
    private volatile boolean pageSaysYes;
    private boolean atDown;
    private boolean notAPull;
    private boolean pulling;
    private float downX;
    private float downY;

    public MigPullLayout(Context context) {
        this(context, null);
    }

    public MigPullLayout(Context context, AttributeSet attrs) {
        super(context, attrs);
        slop = ViewConfiguration.get(context).getScaledTouchSlop();
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
            notAPull = false;
            pulling = false;
            downX = ev.getX();
            downY = ev.getY();
            atDown = true;
            try {
                return super.onInterceptTouchEvent(ev);
            } finally {
                atDown = false;
            }
        }
        // before SwipeRefreshLayout looks at this event: a second finger, or a first finger that went sideways, ends the pull for this touch
        if (!pulling && !notAPull && pinchOrSideways(ev.getPointerCount(), ev.getX() - downX, ev.getY() - downY, slop)) notAPull = true;
        boolean took = super.onInterceptTouchEvent(ev);
        if (took) pulling = true;
        return took;
    }

    @Override
    public boolean canChildScrollUp() {
        View target = getChildCount() > 0 ? findTarget() : null;
        boolean up = target != null && target.canScrollVertically(-1);
        return refusesPull(up, pageSaysYes, notAPull, atDown, pulling);
    }

    /**
     * Not a pull: a second finger (a pinch), or a first finger that has moved beyond the touch slop at least as far sideways as down
     * or up. dx / dy: the first finger's movement since it went down (pixels); slop: ViewConfiguration's touch slop (pixels).
     */
    static boolean pinchOrSideways(int pointerCount, float dx, float dy, float slop) {
        if (pointerCount > 1) return true;
        if (dx * dx + dy * dy <= slop * slop) return false; // not moved yet: undecided
        return Math.abs(dx) >= Math.abs(dy);
    }

    /**
     * SwipeRefreshLayout's question «can the page still scroll up?» (true = no pull now). up: the WebView can scroll up; atDown: the
     * touch itself (where it began is noted whenever the page is at its top); pulling: a pull under way (as SwipeRefreshLayout alone).
     */
    static boolean refusesPull(boolean up, boolean pageSaysYes, boolean notAPull, boolean atDown, boolean pulling) {
        if (atDown || pulling) return up;
        return up || !pageSaysYes || notAPull;
    }

    private View findTarget() {
        for (int i = 0; i < getChildCount(); i++) {
            View c = getChildAt(i);
            if (c instanceof android.webkit.WebView) return c;
        }
        return null;
    }
}
