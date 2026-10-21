package com.calmtv.home;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The dock's viewport. Only whole tiles are ever shown: when focus moves past
 * either end, the row glides over just far enough, tiles entering the window fade
 * in and tiles leaving it fade out. Nothing is ever drawn half-cut at the edges.
 */
final class Carousel extends FrameLayout {
    interface OnWindowChanged {
        /** Tiles currently out of view on each side, nearest first. */
        void onChanged(List<Tile> hiddenLeft, List<Tile> hiddenRight);
    }

    private static final DecelerateInterpolator EASE = new DecelerateInterpolator(1.6f);
    /** View-tag key for a tile's target visibility (any id unique within this app works). */
    private static final int R_TARGET = 0x7f0a0001;

    final LinearLayout row;
    private final int edge;
    private float offset;
    private OnWindowChanged listener;
    /** Centre-locked mode: Home positions every tile itself (focused one fixed in the middle), so the
     *  carousel neither scrolls its row nor hides tiles. */
    boolean centred;

    Carousel(Context c, int edgePx) {
        super(c);
        edge = edgePx;
        // Android's clipChildren crops each child to its *own* bounds, which shaved the top
        // off a lifted tile. Instead, let children draw freely and clip once, to this
        // view's outer edge (see dispatchDraw).
        setClipChildren(false);
        setClipToPadding(false);
        row = new LinearLayout(c);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setClipChildren(false);
        row.setClipToPadding(false);
        addView(row, new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    void setOnWindowChanged(OnWindowChanged l) {
        listener = l;
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        // Let the row be as wide as its tiles; this view stays as wide as the glass.
        row.measure(MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED),
                MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
        setMeasuredDimension(MeasureSpec.getSize(widthSpec),
                row.getMeasuredHeight() + getPaddingTop() + getPaddingBottom());
    }

    @Override
    protected void dispatchDraw(android.graphics.Canvas canvas) {
        int save = canvas.save();
        canvas.clipRect(0, 0, getWidth(), getHeight());
        super.dispatchDraw(canvas);
        canvas.restoreToCount(save);
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        row.layout(getPaddingLeft(), getPaddingTop(),
                getPaddingLeft() + row.getMeasuredWidth(), getPaddingTop() + row.getMeasuredHeight());
        // Re-check which tiles fit after every layout (e.g. the dock was rebuilt, even at the
        // same width): a check made before new tiles are laid out sees them all as fitting.
        // Layout only happens on rebuilds, never on focus moves, so this costs nothing day to day.
        if (!centred) post(() -> reveal(getFocusedChild() == row ? row.getFocusedChild() : null, false));  // (centred: Home places the row)
    }

    /** Called when a tile gains focus: slide just enough to show it whole, then refresh visibility. */
    void reveal(View tile, boolean animate) {
        if (centred) {  // Home drives the row (glide); nothing to hide or report
            if (listener != null) listener.onChanged(Collections.<Tile>emptyList(), Collections.<Tile>emptyList());
            return;
        }
        int w = getWidth() - getPaddingLeft() - getPaddingRight();
        if (w <= 0) return;
        float before = offset;
        float target = offset;
        if (tile != null) {
            if (tile.getRight() + edge > target + w) target = tile.getRight() + edge - w;
            if (tile.getLeft() - edge < target) target = tile.getLeft() - edge;
        }
        // Snap so the window starts exactly at a tile: no empty gap where a tile was hidden.
        // (At the far end that may leave space after the last tile, which reads as "the end".)
        target = Math.max(0, Math.min(target, Math.max(0, row.getWidth() - w)));
        if (target > 0) {
            for (int i = 0; i < row.getChildCount(); i++) {
                View v = row.getChildAt(i);
                if (v instanceof Tile && v.getLeft() - edge >= target - 1) {
                    if (tile == null || v.getLeft() <= tile.getLeft()) target = v.getLeft() - edge;
                    break;
                }
            }
        }
        offset = target;
        if (!animate) row.setTranslationX(-target);
        else if (target != before) row.animate().translationX(-target).setInterpolator(EASE).setDuration(260).start();

        List<Tile> hiddenLeft = new ArrayList<>(), hiddenRight = new ArrayList<>();
        for (int i = 0; i < row.getChildCount(); i++) {
            View v = row.getChildAt(i);
            boolean whole = v.getLeft() >= target - 1 && v.getRight() <= target + w + 1;
            // Animate only when a tile's target changes (tracked in a tag, not the mid-fade alpha):
            // re-starting 14 fades on every key press was causing dropped frames.
            Boolean shown = (Boolean) v.getTag(R_TARGET);
            if (shown == null || shown != whole || !animate) {
                v.setTag(R_TARGET, whole);
                float alpha = whole ? 1f : 0f;
                if (animate) v.animate().alpha(alpha).setDuration(whole ? 220 : 140).start();
                else {
                    v.animate().cancel();
                    v.setAlpha(alpha);
                }
            }
            if (!whole && v instanceof Tile) {
                if (v.getLeft() + v.getRight() < 2 * target + w) hiddenLeft.add((Tile) v);
                else hiddenRight.add((Tile) v);
            }
        }
        Collections.reverse(hiddenLeft);  // nearest first
        if (listener != null) listener.onChanged(hiddenLeft, hiddenRight);
    }

    /** Centred mode: slide the row so its scroll position is 	arget px. */
    void glide(float target, boolean animate) {
        if (target == offset && animate) return;
        offset = target;
        row.animate().cancel();
        if (!animate) row.setTranslationX(-target);
        else row.animate().translationX(-target).setInterpolator(EASE).setDuration(280).start();
    }

    void resetToStart() {
        offset = 0;
        row.animate().translationX(0).setDuration(260).start();
    }
}
