package com.calmtv.home;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;

/**
 * PS4 tile artwork, drawn in code (no image file): deep PlayStation blue with a
 * soft glow, the four face-button symbols in a diamond, and "PS4" lettering.
 */
final class Ps4Art extends Drawable {
    private final Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG);
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint sub = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final CharSequence port;

    Ps4Art(CharSequence port) {
        this.port = port;
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        text.setColor(Color.WHITE);
        text.setTypeface(Typeface.create("sans-serif-black", Typeface.ITALIC));
        text.setLetterSpacing(0.04f);
        sub.setColor(0xCCFFFFFF);
        sub.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        sub.setLetterSpacing(0.12f);
    }

    @Override
    protected void onBoundsChange(Rect b) {
        bg.setShader(new LinearGradient(b.left, b.top, b.right, b.bottom,
                new int[]{0xFF06123A, 0xFF0A3A9E, 0xFF0070D1}, new float[]{0f, 0.55f, 1f}, Shader.TileMode.CLAMP));
        float r = b.width() * 0.55f;
        glow.setShader(new RadialGradient(b.left + b.width() * 0.3f, b.top + b.height() * 0.5f, r,
                0x6600B4FF, 0x0000B4FF, Shader.TileMode.CLAMP));
    }

    @Override
    public void draw(Canvas c) {
        Rect b = getBounds();
        float w = b.width(), h = b.height();
        c.drawRect(b, bg);
        c.drawRect(b, glow);

        // Face buttons in a diamond on the left.
        float cx = b.left + w * 0.27f, cy = b.top + h * 0.5f;
        float gap = h * 0.2f, s = h * 0.085f;
        stroke.setStrokeWidth(h * 0.035f);
        stroke.setShadowLayer(h * 0.06f, 0, 0, 0x99FFFFFF);

        stroke.setColor(0xFF41E8B4);                       // triangle, top
        Path tri = new Path();
        float ty = cy - gap;
        tri.moveTo(cx, ty - s);
        tri.lineTo(cx + s * 1.05f, ty + s * 0.75f);
        tri.lineTo(cx - s * 1.05f, ty + s * 0.75f);
        tri.close();
        c.drawPath(tri, stroke);

        stroke.setColor(0xFFFF6B7D);                       // circle, right
        c.drawCircle(cx + gap, cy, s, stroke);

        stroke.setColor(0xFF8EC5FF);                       // cross, bottom
        float xy = cy + gap;
        c.drawLine(cx - s * 0.8f, xy - s * 0.8f, cx + s * 0.8f, xy + s * 0.8f, stroke);
        c.drawLine(cx + s * 0.8f, xy - s * 0.8f, cx - s * 0.8f, xy + s * 0.8f, stroke);

        stroke.setColor(0xFFF7A8E6);                       // square, left
        c.drawRect(cx - gap - s * 0.85f, cy - s * 0.85f, cx - gap + s * 0.85f, cy + s * 0.85f, stroke);

        // Lettering on the right.
        text.setTextSize(h * 0.36f);
        text.setShadowLayer(h * 0.08f, 0, 0, 0x8800B4FF);
        float tx = b.left + w * 0.52f;
        c.drawText("PS4", tx, cy + h * 0.1f, text);
        if (port != null && port.length() > 0) {
            sub.setTextSize(h * 0.11f);
            c.drawText(port.toString().toUpperCase(), tx + w * 0.01f, cy + h * 0.28f, sub);
        }
    }

    @Override public void setAlpha(int alpha) {}
    @Override public void setColorFilter(ColorFilter cf) {}
    @Override public int getOpacity() { return PixelFormat.OPAQUE; }
}
