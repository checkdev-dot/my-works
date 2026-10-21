package com.calmtv.home;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;

/**
 * The Wi-Fi fan: a dot and three arcs, lit from the dot outwards by signal strength
 * (`level` 0..4: 1 = dot only, 4 = full). Unlit parts stay as faint ghosts so the shape always
 * reads as "Wi-Fi". Drawn in code, no image.
 */
final class WifiBars extends Drawable {
    private final Paint on = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint off = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF arc = new RectF();
    private int level;

    WifiBars() {
        for (Paint p : new Paint[]{on, off}) {
            p.setStrokeCap(Paint.Cap.ROUND);
        }
        setColor(0xFFFFFFFF);
    }

    void setLevel4(int level) {
        this.level = Math.max(0, Math.min(4, level));
        invalidateSelf();
    }

    void setColor(int color) {
        on.setColor(color);
        off.setColor((color & 0x00FFFFFF) | 0x40000000);
        invalidateSelf();
    }

    @Override
    public void draw(Canvas c) {
        Rect b = getBounds();
        float stroke = Math.max(1.5f, b.height() * 0.15f);
        // Biggest radius that fits: the 90° fan is ~1.41 R wide and R tall.
        float r = Math.min(b.width() / 1.45f, b.height() - stroke * 0.6f);
        float cx = b.exactCenterX(), cy = b.bottom - stroke * 0.5f;
        // The dot (level 1).
        Paint dot = level >= 1 ? on : off;
        dot.setStyle(Paint.Style.FILL);
        c.drawCircle(cx, cy - stroke * 0.25f, stroke * 0.85f, dot);
        // Three arcs, inner to outer (levels 2..4).
        for (int i = 1; i <= 3; i++) {
            float ri = r * (0.18f + 0.82f * i / 3f);
            Paint p = level >= i + 1 ? on : off;
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(stroke);
            arc.set(cx - ri, cy - ri, cx + ri, cy + ri);
            c.drawArc(arc, 225, 90, false, p);
        }
    }

    @Override public void setAlpha(int alpha) {}
    @Override public void setColorFilter(ColorFilter cf) {}
    @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
}
