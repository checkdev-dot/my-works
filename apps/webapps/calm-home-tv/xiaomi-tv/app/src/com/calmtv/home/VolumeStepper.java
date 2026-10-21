package com.calmtv.home;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.view.View;
import android.view.animation.DecelerateInterpolator;

/**
 * The volume stepper: an opaque dark capsule (it covers Xiaomi's bar) with
 *  - 20 segments that fill from the bottom, coloured teal -> blue -> violet as they climb;
 *  - a soft coloured light inside the capsule that rises with the level and gently breathes;
 *  - the level on top and a speaker glyph at the bottom (crossed out when muted).
 * Every gradient is made once per size; the breathing redraws only this small view, and
 * only while it's on screen.
 */
final class VolumeStepper extends View {
    private static final int SEGMENTS = 20;
    // Bottom -> top of the bar.
    private static final int TEAL = 0xFF5EEAD4, BLUE = 0xFF60A5FA, VIOLET = 0xFFB794F6;

    private final Paint capsule = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint rim = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint seg = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint icon = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF();
    private final Path speaker = new Path();
    private final Path clip = new Path();
    private final Matrix glowMatrix = new Matrix();

    private float shown;          // level being drawn (0..100), glides to target
    private int target;
    private boolean muted;
    private float breath;         // 0..1, the gentle pulse of the inner light
    private ValueAnimator glide, alive;

    private int[] segColor;       // per-segment colour, made once
    private RadialGradient glow;  // unit-radius light, positioned by glowMatrix
    private float madeFor = -1f;

    VolumeStepper(Context c) {
        super(c);
        capsule.setColor(0xFF12161C);  // fully opaque: it sits over Xiaomi's white bar and hides it
        rim.setStyle(Paint.Style.STROKE);
        rim.setStrokeWidth(Tile.dp(c, 1));
        rim.setColor(0x40FFFFFF);
        text.setColor(Color.WHITE);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        icon.setColor(Color.WHITE);
        icon.setStrokeCap(Paint.Cap.ROUND);
        icon.setStrokeJoin(Paint.Join.ROUND);
    }

    void set(int level, boolean mute, boolean animate) {
        target = level;
        muted = mute;
        if (glide != null) glide.cancel();
        if (!animate) {
            shown = level;
            invalidate();
        } else {
            glide = ValueAnimator.ofFloat(shown, level);
            glide.setDuration(160);
            glide.setInterpolator(new DecelerateInterpolator());
            glide.addUpdateListener(a -> {
                shown = (float) a.getAnimatedValue();
                invalidate();
            });
            glide.start();
        }
        startAlive();
    }

    /** The inner light's slow breathing; runs only while the stepper is on screen. */
    void startAlive() {
        if (alive != null && alive.isStarted()) return;
        alive = ValueAnimator.ofFloat(0f, 1f);
        alive.setDuration(1400);
        alive.setRepeatMode(ValueAnimator.REVERSE);
        alive.setRepeatCount(ValueAnimator.INFINITE);
        alive.addUpdateListener(a -> {
            breath = (float) a.getAnimatedValue();
            invalidate();
        });
        alive.start();
    }

    void stopAlive() {
        if (alive != null) alive.cancel();
    }

    @Override
    protected void onDetachedFromWindow() {
        stopAlive();
        super.onDetachedFromWindow();
    }

    private void make(float w, float h) {
        madeFor = w * 10000 + h;
        segColor = new int[SEGMENTS];
        for (int i = 0; i < SEGMENTS; i++) {
            float t = i / (float) (SEGMENTS - 1);
            segColor[i] = t < 0.5f ? mix(TEAL, BLUE, t * 2) : mix(BLUE, VIOLET, (t - 0.5f) * 2);
        }
        glow = new RadialGradient(0, 0, 1f, new int[]{0x8C60A5FA, 0x405EEAD4, 0x00000000},
                new float[]{0f, 0.55f, 1f}, Shader.TileMode.CLAMP);
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight(), rad = w / 2f;
        if (madeFor != w * 10000 + h) make(w, h);

        r.set(0, 0, w, h);
        c.drawRoundRect(r, rad, rad, capsule);

        float top = w * 0.95f, bottom = h - w * 1.05f;
        float level = shown / 100f;

        // Soft light inside the capsule, rising with the level and breathing gently.
        if (!muted && level > 0f) {
            c.save();
            clip.reset();
            clip.addRoundRect(r, rad, rad, Path.Direction.CW);
            c.clipPath(clip);
            float lightY = bottom - (bottom - top) * level;            // the top of the lit part
            float radius = w * (1.1f + 0.5f * level) * (1f + 0.08f * breath);
            glowMatrix.setScale(radius, (bottom - lightY) * 0.75f + radius);
            glowMatrix.postTranslate(w / 2f, (lightY + bottom) / 2f);
            glow.setLocalMatrix(glowMatrix);
            glowPaint.setShader(glow);
            glowPaint.setAlpha((int) (150 + 70 * breath));
            c.drawRect(r, glowPaint);
            c.restore();
        }
        r.set(0, 0, w, h);
        r.inset(rim.getStrokeWidth() / 2, rim.getStrokeWidth() / 2);
        c.drawRoundRect(r, rad, rad, rim);

        // Level number at the top.
        text.setTextSize(w * 0.34f);
        text.setAlpha(muted ? 140 : 255);
        c.drawText(muted ? "—" : String.valueOf(target), w / 2f, w * 0.62f, text);

        // Segments, filling from the bottom, teal -> blue -> violet.
        float gap = (bottom - top) * 0.018f;
        float segH = ((bottom - top) - gap * (SEGMENTS - 1)) / SEGMENTS;
        float left = w * 0.3f, right = w * 0.7f, sr = segH / 2f;
        float lit = level * SEGMENTS;
        seg.setShader(null);
        for (int i = 0; i < SEGMENTS; i++) {
            float y1 = bottom - i * (segH + gap), y0 = y1 - segH;
            float fill = Math.max(0f, Math.min(1f, lit - i));   // 0..1 for a partly lit segment
            r.set(left, y0, right, y1);
            seg.setColor(0x1FFFFFFF);
            c.drawRoundRect(r, sr, sr, seg);
            if (fill > 0f) {
                seg.setColor(muted ? 0x59FFFFFF : segColor[i]);
                seg.setAlpha((int) (255 * (0.35f + 0.65f * fill)));
                c.drawRoundRect(r, sr, sr, seg);
            }
        }

        // Speaker glyph at the bottom.
        float cx = w / 2f, cy = h - w * 0.55f, s = w * 0.13f;
        speaker.reset();
        speaker.moveTo(cx - s * 1.6f, cy - s * 0.55f);
        speaker.lineTo(cx - s * 0.8f, cy - s * 0.55f);
        speaker.lineTo(cx + s * 0.2f, cy - s * 1.3f);
        speaker.lineTo(cx + s * 0.2f, cy + s * 1.3f);
        speaker.lineTo(cx - s * 0.8f, cy + s * 0.55f);
        speaker.lineTo(cx - s * 1.6f, cy + s * 0.55f);
        speaker.close();
        icon.setStyle(Paint.Style.FILL);
        icon.setAlpha(muted ? 160 : 255);
        c.drawPath(speaker, icon);
        icon.setStyle(Paint.Style.STROKE);
        icon.setStrokeWidth(w * 0.045f);
        if (muted) {
            c.drawLine(cx + s * 0.8f, cy - s * 0.7f, cx + s * 2.0f, cy + s * 0.7f, icon);
            c.drawLine(cx + s * 2.0f, cy - s * 0.7f, cx + s * 0.8f, cy + s * 0.7f, icon);
        } else {
            int waves = target == 0 ? 0 : target < 34 ? 1 : target < 67 ? 2 : 3;
            for (int i = 1; i <= waves; i++) {
                float rr = s * (0.6f + 0.55f * i);
                r.set(cx + s * 0.2f - rr, cy - rr, cx + s * 0.2f + rr, cy + rr);
                c.drawArc(r, -45, 90, false, icon);
            }
        }
    }

    private static int mix(int a, int b, float t) {
        int ar = (a >> 16) & 0xFF, ag = (a >> 8) & 0xFF, ab = a & 0xFF;
        int br = (b >> 16) & 0xFF, bg = (b >> 8) & 0xFF, bb = b & 0xFF;
        return 0xFF000000 | (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8)
                | Math.round(ab + (bb - ab) * t);
    }
}
