package com.calmtv.home;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Shader;

import java.util.Random;

/**
 * Paints nature scenes (mountains, sea, aurora, forest, dunes, moonlit lake) from
 * a random seed, so every wallpaper is different and nothing is stored on the TV.
 */
final class Wallpapers {
    static final int SCENES = 6;

    private Wallpapers() {}

    /**
     * 16-bit colour halves the memory of a full-screen image; every paint dithers,
     * so the gradients stay smooth.
     */
    static Bitmap render(int index, int w, int h, long seed) {
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
        Canvas c = new Canvas(b);
        Random r = new Random(seed);
        switch (Math.floorMod(index, SCENES)) {
            case 0: dawnMountains(c, w, h, r); break;
            case 1: oceanSunset(c, w, h, r); break;
            case 2: aurora(c, w, h, r); break;
            case 3: mistyForest(c, w, h, r); break;
            case 4: dunes(c, w, h, r); break;
            default: moonLake(c, w, h, r); break;
        }
        vignette(c, w, h);
        shade(b);
        return b;
    }

    private static void dawnMountains(Canvas c, int w, int h, Random r) {
        sky(c, w, h, new int[]{0xFF22305E, 0xFF7A5C8E, 0xFFF0A07A, 0xFFFFD9A8}, new float[]{0f, 0.35f, 0.62f, 0.8f});
        float sx = w * (0.25f + 0.5f * r.nextFloat()), sy = h * 0.56f;
        glow(c, sx, sy, w * 0.35f, 0x88FFE7B0);
        disc(c, sx, sy, h * 0.045f, 0xFFFFF4D6);
        int far = 0xFFB98AA0, near = 0xFF1A1726;
        for (int i = 0; i < 5; i++) {
            float base = h * (0.52f + 0.1f * i);
            Paint p = fill();
            p.setColor(mix(far, near, i / 4f));
            c.drawPath(ridge(w, h, base, h * (0.16f - 0.02f * i), 1f, r), p);
            if (i < 4) haze(c, w, base - h * 0.04f, base + h * 0.08f, 0x55FFD2B0);
        }
    }

    private static void oceanSunset(Canvas c, int w, int h, Random r) {
        float hz = h * 0.6f;
        sky(c, w, h, new int[]{0xFF14213D, 0xFF6B3E75, 0xFFE76F51, 0xFFF4A261}, new float[]{0f, 0.3f, 0.5f, 0.6f});
        float sx = w * (0.3f + 0.4f * r.nextFloat());
        glow(c, sx, hz, w * 0.4f, 0x99FFB070);
        disc(c, sx, hz - h * 0.02f, h * 0.07f, 0xFFFFE0A3);
        Paint sea = fill();
        sea.setShader(new LinearGradient(0, hz, 0, h, new int[]{0xFF7A4A6A, 0xFF1E2A44, 0xFF0B1222},
                new float[]{0f, 0.4f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, hz, w, h, sea);
        reflection(c, sx, hz, h, w, r, 255, 200, 140);
        // A low island that rises from the horizon and slopes back down into the sea.
        Paint land = fill();
        land.setColor(0xFF231B35);
        float x0 = w * 0.04f * r.nextFloat(), x1 = x0 + w * (0.18f + 0.15f * r.nextFloat());
        float peak = h * (0.03f + 0.03f * r.nextFloat());
        Path island = new Path();
        island.moveTo(x0, hz + 1);
        for (float x = x0; x <= x1; x += 3) {
            double t = (x - x0) / (x1 - x0);
            double bump = Math.pow(Math.sin(Math.PI * t), 0.6) * (1 + 0.08 * Math.sin(t * 40));
            island.lineTo(x, (float) (hz - peak * bump));
        }
        island.lineTo(x1, hz + 1);
        island.close();
        c.drawPath(island, land);
    }

    private static void aurora(Canvas c, int w, int h, Random r) {
        sky(c, w, h, new int[]{0xFF020617, 0xFF0A1A33, 0xFF0F3B4A}, new float[]{0f, 0.6f, 1f});
        stars(c, w, h * 0.75f, r, 260);
        Paint p = new Paint(Paint.DITHER_FLAG);
        p.setStrokeWidth(3.5f);
        for (int band = 0; band < 3; band++) {
            float base = h * (0.38f + 0.1f * band + 0.05f * r.nextFloat());
            float amp = h * 0.08f, f = 1 + r.nextFloat() * 2, ph = r.nextFloat() * 6.28f;
            int rgb = band == 1 ? 0x00A98BFF : 0x0034F5A8;
            for (int x = 0; x < w; x += 3) {
                float t = x / (float) w;
                float y = base + amp * (float) Math.sin(t * f * Math.PI * 2 + ph);
                float len = h * (0.1f + 0.18f * (0.5f + 0.5f * (float) Math.sin(t * 7 + ph * 2)));
                int a = 40 + r.nextInt(50);
                p.setShader(new LinearGradient(x, y, x, y - len, (a << 24) | rgb, rgb, Shader.TileMode.CLAMP));
                c.drawLine(x, y, x, y - len, p);
            }
        }
        Paint m = fill();
        m.setColor(0xFF0B1420);
        c.drawPath(ridge(w, h, h * 0.82f, h * 0.08f, 1f, r), m);
        trees(c, w, h, h * 0.92f, h * 0.12f, 0xFF050A10, r);
    }

    private static void mistyForest(Canvas c, int w, int h, Random r) {
        sky(c, w, h, new int[]{0xFFDDE6E8, 0xFFB9C9C6, 0xFF8FA7A0}, new float[]{0f, 0.6f, 1f});
        glow(c, w * (0.2f + 0.6f * r.nextFloat()), h * 0.22f, w * 0.3f, 0x66FFFFFF);
        int far = 0xFFA9BDB6, near = 0xFF14261D;
        for (int i = 0; i < 5; i++) {
            float base = h * (0.55f + 0.11f * i);
            trees(c, w, h, base, h * (0.18f + 0.07f * i), mix(far, near, i / 4f), r);
            if (i < 4) haze(c, w, base - h * 0.12f, base + h * 0.02f, 0x66E6EEF0);
        }
    }

    private static void dunes(Canvas c, int w, int h, Random r) {
        sky(c, w, h, new int[]{0xFF5B86B5, 0xFFA9C2D8, 0xFFF1D6B0}, new float[]{0f, 0.45f, 0.62f});
        glow(c, w * (0.2f + 0.6f * r.nextFloat()), h * 0.3f, w * 0.3f, 0x55FFF3D0);
        int[][] cols = {{0xFFE9B97A, 0xFFC98A4B}, {0xFFE0A462, 0xFFB8743A}, {0xFFD38F4D, 0xFFA05E2B}, {0xFFC17A3A, 0xFF7E4520}};
        for (int i = 0; i < 4; i++) {
            float base = h * (0.6f + 0.1f * i);
            Paint p = fill();
            p.setShader(new LinearGradient(0, base - h * 0.1f, w * 0.3f, h, cols[i][0], cols[i][1], Shader.TileMode.CLAMP));
            c.drawPath(ridge(w, h, base, h * (0.06f + 0.015f * i), 0f, r), p);
        }
    }

    private static void moonLake(Canvas c, int w, int h, Random r) {
        float hz = h * 0.66f;
        sky(c, w, h, new int[]{0xFF070B1E, 0xFF16224A, 0xFF2C3F6E}, new float[]{0f, 0.6f, 1f});
        stars(c, w, hz, r, 220);
        float mx = w * (0.2f + 0.6f * r.nextFloat()), my = h * (0.18f + 0.15f * r.nextFloat());
        glow(c, mx, my, h * 0.3f, 0x55C9D6FF);
        disc(c, mx, my, h * 0.055f, 0xFFF4F1DE);
        Paint mtn = fill();
        mtn.setColor(0xFF121A33);
        c.drawPath(ridge(w, h, hz, h * 0.14f, 1f, r), mtn);
        trees(c, w, h, hz + 1, h * 0.08f, 0xFF080D1C, r);
        Paint lake = fill();
        lake.setShader(new LinearGradient(0, hz, 0, h, 0xFF1B2850, 0xFF060914, Shader.TileMode.CLAMP));
        c.drawRect(0, hz, w, h, lake);
        reflection(c, mx, hz, h, w, r, 200, 210, 255);
    }

    // --- helpers ---

    /** Names of the bundled nature photos (assets/wallpapers/*.jpg, 960x540, Unsplash). */
    static String[] photos(android.content.Context c) {
        try {
            java.util.List<String> out = new java.util.ArrayList<>();
            for (String f : c.getAssets().list("wallpapers")) if (f.endsWith(".jpg")) out.add(f);
            return out.toArray(new String[0]);
        } catch (java.io.IOException e) {
            return new String[0];
        }
    }

    /**
     * Decodes a bundled photo in 16-bit colour with dithering: ~1 MB in memory,
     * the same as a painted scene. Returns null if it can't be read.
     */
    static Bitmap photo(android.content.Context c, String name) {
        android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
        // Full colour: 16-bit photos showed bands in smooth skies under the shading (+1 MB a photo).
        o.inPreferredConfig = Bitmap.Config.ARGB_8888;
        o.inDither = true;
        o.inMutable = true;  // so the shading can be painted in (see shade)
        try (java.io.InputStream in = c.getAssets().open("wallpapers/" + name)) {
            Bitmap b = android.graphics.BitmapFactory.decodeStream(in, null, o);
            if (b != null) shade(b);
            return b;
        } catch (java.io.IOException e) {
            return null;
        }
    }

    /**
     * Darkens the top and bottom of the scene (behind the clock/Recents and the dock) by
     * painting it into the image once, instead of blending two large overlay layers over
     * the whole screen on every frame.
     */
    static void shade(Bitmap b) {
        int w = b.getWidth(), h = b.getHeight();
        Canvas c = new Canvas(b);
        // Top band, plus a soft pool of shade in the top-left corner where the big clock sits and a
        // lighter one top-right behind the status row: text stays readable with no panels at all.
        Paint top = fill();
        top.setShader(new LinearGradient(0, 0, 0, h * 0.5f, new int[]{0xD1000000, 0x73000000, 0x00000000},  // darker top: clock, greeting, weather
                new float[]{0f, 0.45f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h * 0.5f, top);
        Paint corner = fill();
        corner.setShader(new RadialGradient(w * 0.12f, h * 0.18f, w * 0.55f,
                new int[]{0x8C000000, 0x40000000, 0x00000000}, new float[]{0f, 0.5f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, corner);  // whole canvas: the gradient fades out on its own (a smaller rect left hard edges)
        Paint right = fill();
        // Mirror of the left pool, so the weather and Wi-Fi column reads as well as the clock does.
        right.setShader(new RadialGradient(w * 0.86f, h * 0.24f, w * 0.5f,
                new int[]{0xB3000000, 0x52000000, 0x00000000}, new float[]{0f, 0.5f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, right);
        Paint bottom = fill();
        bottom.setShader(new LinearGradient(0, h * 0.45f, 0, h, new int[]{0x00000000, 0x40000000, 0xB3000000},
                new float[]{0f, 0.45f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, h * 0.45f, w, h, bottom);
    }

    /** A tiny copy that the GPU's smooth upscaling turns into a frosted blur (~10 KB). */
    static Bitmap frosted(Bitmap src) {
        return Bitmap.createScaledBitmap(src, 64, 36, true);
    }

    private static Paint fill() {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG);
        p.setStyle(Paint.Style.FILL);
        return p;
    }

    private static void sky(Canvas c, int w, int h, int[] colors, float[] stops) {
        Paint p = fill();
        p.setShader(new LinearGradient(0, 0, 0, h, colors, stops, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
    }

    private static void glow(Canvas c, float x, float y, float radius, int color) {
        Paint p = fill();
        p.setShader(new RadialGradient(x, y, radius, color, color & 0x00FFFFFF, Shader.TileMode.CLAMP));
        c.drawCircle(x, y, radius, p);
    }

    private static void disc(Canvas c, float x, float y, float radius, int color) {
        Paint p = fill();
        p.setColor(color);
        c.drawCircle(x, y, radius, p);
    }

    /** A band that fades from clear at the top to {@code color} at the bottom. */
    private static void haze(Canvas c, int w, float top, float bottom, int color) {
        Paint p = fill();
        p.setShader(new LinearGradient(0, top, 0, bottom, color & 0x00FFFFFF, color, Shader.TileMode.CLAMP));
        c.drawRect(0, top, w, bottom, p);
    }

    /** A hill or mountain line made of layered sine waves, filled down to the bottom. */
    private static Path ridge(int w, int h, float base, float amp, float rough, Random r) {
        float f1 = 1.5f + r.nextFloat() * 2, f2 = 4 + r.nextFloat() * 5, f3 = 12 + r.nextFloat() * 14;
        float p1 = r.nextFloat() * 6.28f, p2 = r.nextFloat() * 6.28f, p3 = r.nextFloat() * 6.28f;
        Path p = new Path();
        p.moveTo(0, h);
        for (int x = 0; x <= w; x += 4) {
            double t = x / (double) w;
            double y = base - amp * (0.55 * Math.sin(t * f1 * Math.PI + p1)
                    + 0.3 * Math.sin(t * f2 * Math.PI + p2)
                    + rough * 0.15 * Math.sin(t * f3 * Math.PI + p3));
            p.lineTo(x, (float) y);
        }
        p.lineTo(w, h);
        p.close();
        return p;
    }

    private static void trees(Canvas c, int w, int h, float baseY, float maxH, int color, Random r) {
        Paint p = fill();
        p.setColor(color);
        Path path = new Path();
        for (float x = -10; x < w + 10; x += maxH * 0.18f + r.nextFloat() * maxH * 0.25f) {
            float th = maxH * (0.5f + 0.5f * r.nextFloat()), tw = th * 0.32f, top = baseY - th;
            for (int k = 0; k < 3; k++) {
                float ty = top + th * 0.28f * k, bw = tw * (0.55f + 0.25f * k);
                path.moveTo(x, ty);
                path.lineTo(x - bw, ty + th * 0.42f);
                path.lineTo(x + bw, ty + th * 0.42f);
                path.close();
            }
        }
        c.drawPath(path, p);
        c.drawRect(0, baseY, w, h, p);
    }

    private static void stars(Canvas c, int w, float maxY, Random r, int n) {
        Paint p = fill();
        for (int i = 0; i < n; i++) {
            p.setColor(Color.argb(60 + r.nextInt(190), 255, 255, 255));
            c.drawCircle(r.nextFloat() * w, r.nextFloat() * maxY, 0.4f + r.nextFloat() * 1.1f, p);
        }
    }

    /** Shimmering light path on water below a sun or moon. */
    private static void reflection(Canvas c, float sx, float hz, int h, int w, Random r, int red, int green, int blue) {
        Paint line = fill();
        for (float y = hz + 2; y < h; y += 3 + (y - hz) * 0.03f) {
            float d = (y - hz) / (h - hz);
            float half = w * (0.02f + 0.1f * d) * (0.4f + r.nextFloat());
            line.setColor(Color.argb((int) (140 * (1 - d) + 15), red, green, blue));
            c.drawRect(sx - half, y, sx + half, y + 1 + d * 2, line);
        }
    }

    private static void vignette(Canvas c, int w, int h) {
        Paint p = fill();
        p.setShader(new RadialGradient(w / 2f, h / 2f, w * 0.75f, new int[]{0x00000000, 0x00000000, 0x66000000},
                new float[]{0f, 0.6f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
    }

    private static int mix(int a, int b, float t) {
        return Color.argb(
                Math.round(Color.alpha(a) + (Color.alpha(b) - Color.alpha(a)) * t),
                Math.round(Color.red(a) + (Color.red(b) - Color.red(a)) * t),
                Math.round(Color.green(a) + (Color.green(b) - Color.green(a)) * t),
                Math.round(Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t));
    }
}
