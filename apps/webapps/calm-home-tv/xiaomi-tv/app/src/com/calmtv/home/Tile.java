package com.calmtv.home;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * A rounded app card. When focused it lifts slightly (6%, up a few pixels), a
 * white ring fades in, a band of light sweeps across it and its name appears
 * underneath. Small enough that it never touches the dock's glass edges. All
 * animations are GPU property animations.
 */
final class Tile extends LinearLayout {
    interface OnFocused {
        void onFocused(Tile t);
    }

    private static final OvershootInterpolator SPRING = new OvershootInterpolator(1.2f);
    private static final DecelerateInterpolator EASE = new DecelerateInterpolator();

    final Apps.Entry entry;
    private final FrameLayout card;
    private final GradientDrawable ring;
    private final View pin, dim, recentDot;
    private final TextView caption;
    private boolean recent;
    private OnFocused onFocused;
    private ObjectAnimator wiggle;

    Tile(Context c, Apps.Entry e, int wDp, int hDp) {
        this(c, e, wDp, hDp, null);
    }

    /** With a note, the line under the card is always shown (e.g. "Usually around now"). */
    Tile(Context c, Apps.Entry e, int wDp, int hDp, String note) {
        this(c, e, wDp, hDp, note, false);
    }

    /** dock=true adds the dock-only extras (dim veil, recently-used dot); Library cards skip them. */
    Tile(Context c, Apps.Entry e, int wDp, int hDp, String note, boolean dock) {
        super(c);
        entry = e;
        setOrientation(VERTICAL);
        setGravity(Gravity.CENTER_HORIZONTAL);
        setFocusable(true);
        setClipChildren(false);
        setClipToPadding(false);
        setDefaultFocusHighlightEnabled(false);
        int w = dp(c, wDp), h = dp(c, hDp);
        float radius = dp(c, 14);  // same family as the Wi-Fi chip and For you circles

        card = new FrameLayout(c);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                e.colors != null ? e.colors : new int[]{0xFF2B303B, 0xFF1C2028});
        bg.setCornerRadius(radius);
        card.setBackground(bg);
        card.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        card.setClipToOutline(true);
        // No elevation/shadows: soft shadows on ~20 tiles were the costliest thing this TV's GPU drew.

        if (e.banner != null) {
            ImageView iv = new ImageView(c);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            iv.setImageDrawable(e.banner);
            card.addView(iv, new FrameLayout.LayoutParams(-1, -1));
        } else {
            LinearLayout inner = new LinearLayout(c);
            inner.setOrientation(VERTICAL);
            inner.setGravity(Gravity.CENTER);
            if (e.icon != null) {
                ImageView iv = new ImageView(c);
                iv.setImageDrawable(e.icon);
                inner.addView(iv, new LayoutParams(h / 2, h / 2));
            }
            TextView t = new TextView(c);
            t.setText(e.glyph != null ? e.glyph + "  " + e.label : e.label);
            t.setTextColor(Color.WHITE);
            t.setTextSize(e.icon != null ? 11 : 15);
            t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
            t.setSingleLine();
            t.setEllipsize(TextUtils.TruncateAt.END);
            t.setGravity(Gravity.CENTER);
            t.setPadding(dp(c, 8), dp(c, 4), dp(c, 8), 0);
            inner.addView(t, new LayoutParams(-1, -2));
            card.addView(inner, new FrameLayout.LayoutParams(-1, -1));
        }

        // (The light sweep is gone: a rotated layer inside a rounded clip for half a second on every
        //  focus was too much for this GPU. The lift + ring carry the focus on their own.)

        // Focus ring drawn on top of the card, faded in on focus.
        ring = new GradientDrawable();
        ring.setCornerRadius(radius);
        ring.setStroke(dp(c, 2), 0xF2FFFFFF);  // thin and soft, still clear from the sofa
        ring.setColor(0x00000000);
        ring.setAlpha(0);
        card.setForeground(ring);

        pin = new View(c);
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(Color.WHITE);
        dot.setStroke(dp(c, 1), 0x66000000);
        pin.setBackground(dot);
        pin.setVisibility(GONE);
        FrameLayout.LayoutParams plp = new FrameLayout.LayoutParams(dp(c, 8), dp(c, 8), Gravity.TOP | Gravity.END);
        plp.setMargins(0, dp(c, 7), dp(c, 7), 0);
        card.addView(pin, plp);
        // Dim veil for when another dock app has focus: toggled, never animated (no per-frame cost).
        if (dock) {
            dim = new View(c);
            dim.setBackgroundColor(0x24000000);  // only a hint: the others stay easy to see
            dim.setVisibility(INVISIBLE);        // INVISIBLE, not GONE: toggling never re-lays out the dock
            card.addView(dim, new FrameLayout.LayoutParams(-1, -1));
        } else {
            dim = null;
        }
        addView(card, new LayoutParams(w, h));

        caption = new TextView(c);
        caption.setText(note != null ? note : e.label);
        caption.setTextColor(Color.WHITE);
        caption.setTextSize(note != null ? 11 : 12);
        caption.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        caption.setSingleLine();
        caption.setEllipsize(TextUtils.TruncateAt.END);
        caption.setGravity(Gravity.CENTER);
        caption.setShadowLayer(4, 0, 1, 0xF0000000);  // tight shadow: crisp letters, not a halo
        float restAlpha = note != null ? 0.7f : 0f;
        caption.setAlpha(restAlpha);
        LayoutParams clp = new LayoutParams(w, -2);
        clp.topMargin = dp(c, 7);
        if (dock) {
            // Caption slot: the name when focused; a small "recently used" dot when not.
            FrameLayout slot = new FrameLayout(c);
            slot.setClipChildren(false);
            slot.addView(caption, new FrameLayout.LayoutParams(w, -2));
            recentDot = new View(c);
            GradientDrawable rd = new GradientDrawable();
            rd.setShape(GradientDrawable.OVAL);
            rd.setColor(0xE6FFFFFF);
            recentDot.setBackground(rd);
            recentDot.setVisibility(INVISIBLE);
            FrameLayout.LayoutParams rdl = new FrameLayout.LayoutParams(dp(c, 5), dp(c, 5), Gravity.CENTER_HORIZONTAL | Gravity.TOP);
            rdl.topMargin = dp(c, 3);
            slot.addView(recentDot, rdl);
            addView(slot, clp);
        } else {
            recentDot = null;
            addView(caption, clp);
        }

        setOnFocusChangeListener((v, has) -> {
            card.animate().cancel();
            if (has) {
                card.animate().scaleX(1.05f).scaleY(1.05f).translationY(-dp(c, 3))  // soft lift
                        .setInterpolator(SPRING).setDuration(200).start();
                if (ringDelay > 0) settleRing(); else setRing(255);
                if (onFocused != null) onFocused.onFocused(this);
            } else {
                card.animate().scaleX(1f).scaleY(1f).translationY(0)
                        .setInterpolator(EASE).setDuration(120).start();
                if (ringFade != null) ringFade.cancel();
                setRing(0);
            }
            // withLayer: the shadowed caption fades as one cached texture, not a fresh blur per frame.
            if (recentDot != null) recentDot.setVisibility(recent && !has ? VISIBLE : INVISIBLE);
            caption.animate().alpha(has ? 1f : restAlpha).setDuration(has ? 160 : 90).withLayer().start();
        });
    }

    /**
     * Children never overlap in a way alpha could reveal, so fading a whole tile (the dock's edge
     * fades) can draw straight through instead of via an offscreen buffer per frame.
     */
    @Override
    public boolean hasOverlappingRendering() {
        return false;
    }

    /** Ring on/off instantly: the lift already animates, and fading it cost a redraw per frame. */
    /** The dock shows the focused app's name centred above its frame, so no caption under the card. */
    void hideCaption() {
        caption.setVisibility(GONE);
    }

    /** The dock draws one fixed frame at the centre instead of a ring on each tile. */
    void setOwnRing(boolean on) {
        ownRing = on;
        if (!on) setRing(0);
    }

    private boolean ownRing = true;
    private long ringDelay;
    private ValueAnimator ringFade;

    /** Dock: the ring fades in as the app lands in the focus spot, instead of sitting there first. */
    void setRingDelay(long ms) {
        ringDelay = ms;
    }

    private void settleRing() {
        if (ringFade != null) ringFade.cancel();
        setRing(0);
        ringFade = ValueAnimator.ofInt(0, 255);
        ringFade.setStartDelay(ringDelay);
        ringFade.setDuration(180);
        ringFade.addUpdateListener(a -> setRing((Integer) a.getAnimatedValue()));
        ringFade.start();
    }

    private void setRing(int alpha) {
        if (!ownRing) alpha = 0;
        ring.setAlpha(alpha);
        card.invalidate();
    }

    /** Reorder mode: a gentle wiggle, like rearranging icons on a phone. */
    void setWiggling(boolean on) {
        if (wiggle != null) wiggle.cancel();
        if (on) {
            wiggle = ObjectAnimator.ofFloat(card, View.ROTATION, -1.6f, 1.6f);
            wiggle.setDuration(130);
            wiggle.setRepeatCount(ValueAnimator.INFINITE);
            wiggle.setRepeatMode(ValueAnimator.REVERSE);
            wiggle.start();
        } else {
            wiggle = null;
            card.setRotation(0f);
        }
    }

    void setOnFocused(OnFocused l) {
        onFocused = l;
    }

    /** Another dock app has focus: sit back a little. */
    void setDimmed(boolean d) {
        if (dim == null) return;
        int v = d ? VISIBLE : INVISIBLE;
        if (dim.getVisibility() != v) dim.setVisibility(v);
    }

    /** Opened recently: a small dot under the card (hidden while focused, when the name shows). */
    void setRecent(boolean r) {
        recent = r;
        if (recentDot != null) recentDot.setVisibility(r && !hasFocus() ? VISIBLE : INVISIBLE);
    }

    void setPinned(boolean pinned) {
        pin.setVisibility(pinned ? VISIBLE : GONE);
    }

    static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }
}
