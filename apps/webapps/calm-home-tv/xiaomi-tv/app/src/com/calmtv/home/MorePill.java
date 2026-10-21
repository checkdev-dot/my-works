package com.calmtv.home;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.ViewOutlineProvider;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.List;

/**
 * Overflow "folder" sitting inside the dock's glass at one end: a small rounded
 * square previewing the apps out of view on that side as a 2x2 grid of mini icons,
 * with "+N" underneath when there are more than four.
 */
final class MorePill extends LinearLayout {
    private final GridLayout grid;
    private final TextView count;
    private String shownIds = "";
    private float targetAlpha = 0f;
    private float dim = 1f;

    MorePill(Context c, boolean pointsRight) {
        super(c);
        setOrientation(VERTICAL);
        setGravity(Gravity.CENTER_HORIZONTAL);
        setAlpha(0f);

        FrameLayout box = new FrameLayout(c);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(11));
        bg.setColor(0x40000000);
        bg.setStroke(dp(1), 0x4DFFFFFF);
        box.setBackground(bg);
        grid = new GridLayout(c);
        grid.setColumnCount(2);
        box.addView(grid, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        addView(box, new LayoutParams(dp(46), dp(46)));

        count = new TextView(c);
        count.setTextColor(Color.WHITE);
        count.setTextSize(10);
        count.setAlpha(0.8f);
        count.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        count.setGravity(Gravity.CENTER);
        LayoutParams clp = new LayoutParams(-2, -2);
        clp.topMargin = dp(4);
        addView(count, clp);
    }

    @Override
    public boolean hasOverlappingRendering() {
        return false;  // fades draw straight through, no offscreen buffer
    }

    void show(List<Tile> hidden) {
        show(hidden, false);
    }

    /** @param wrap true when previewing where the dock loops round to (shows "↻ back to start"). */
    /** Idle dimming from Home: multiplies the pill's own visibility rather than overriding it. */
    void setDim(float d) {
        dim = d;
        animate().alpha(targetAlpha * dim).setDuration(600).start();
    }

    void show(List<Tile> hidden, boolean wrap) {
        float a = hidden.isEmpty() ? 0f : 1f;
        if (a != targetAlpha) {  // compare with where we're heading, not the mid-fade value
            targetAlpha = a;
            animate().alpha(a * dim).setDuration(200).start();
        }
        if (hidden.isEmpty()) return;

        StringBuilder ids = new StringBuilder(wrap ? "wrap:" : "");
        for (Tile t : hidden) ids.append(t.entry.id).append(',');
        if (ids.toString().equals(shownIds)) return;
        shownIds = ids.toString();

        grid.removeAllViews();
        int n = Math.min(4, hidden.size());
        for (int i = 0; i < n; i++) {
            Apps.Entry e = hidden.get(i).entry;
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
            lp.width = dp(16);
            lp.height = dp(16);
            lp.setMargins(dp(2), dp(2), dp(2), dp(2));
            grid.addView(e.icon != null || Apps.PS4.equals(e.id) ? icon(e) : glyph(e), lp);
        }
        count.setText(wrap ? "↻ back to start"
                : hidden.size() > 4 ? "+" + (hidden.size() - 4) + " more" : hidden.size() + " more");
        // Little pop so the change is noticed.
        setScaleX(0.9f);
        setScaleY(0.9f);
        animate().scaleX(1f).scaleY(1f).setDuration(180).start();
    }

    private ImageView icon(Apps.Entry e) {
        ImageView iv = new ImageView(getContext());
        Drawable d = e.icon != null ? HomeActivity.Bubble.own(e.icon) : new Ps4Art(null);
        iv.setImageDrawable(d);
        iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable clip = new GradientDrawable();
        clip.setCornerRadius(dp(4));
        iv.setBackground(clip);
        iv.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        iv.setClipToOutline(true);
        return iv;
    }

    /** Tiles without an app icon (Inputs, All Apps, Settings, Boost): a mini swatch with their symbol. */
    private TextView glyph(Apps.Entry e) {
        TextView t = new TextView(getContext());
        t.setText(e.glyph != null ? e.glyph : e.label.toString().substring(0, 1));
        t.setTextColor(Color.WHITE);
        t.setTextSize(9);
        t.setGravity(Gravity.CENTER);
        t.setIncludeFontPadding(false);
        GradientDrawable sw = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                e.colors != null ? e.colors : new int[]{0xFF4A4F5A, 0xFF2B2F36});
        sw.setCornerRadius(dp(4));
        t.setBackground(sw);
        return t;
    }

    private int dp(float v) {
        return Tile.dp(getContext(), v);
    }
}
