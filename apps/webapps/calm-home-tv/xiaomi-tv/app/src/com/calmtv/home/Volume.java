package com.calmtv.home;

import android.accessibilityservice.AccessibilityService;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.PixelFormat;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;

/**
 * Shows the {@link VolumeStepper} whenever the TV volume changes.
 *
 * It only WATCHES the volume: the remote's buttons are still handled by the TV itself,
 * so Xiaomi's own behaviour stays exactly as it was (hold = fast seek, double-tap Down = mute).
 * The stepper is opaque and drawn over the spot where Xiaomi's white bar appears, slightly
 * larger, and stays a little longer than it, so you only ever see this one.
 */
final class Volume {
    private static final long HIDE_MS = 3200;  // outlasts Xiaomi's bar, so it never peeks out

    private final AccessibilityService service;
    private final AudioManager audio;
    private final WindowManager wm;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final VolumeStepper view;
    private boolean attached, started;
    private final Runnable hide = this::hide;

    private final BroadcastReceiver changed = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            int stream = i.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1);
            if (stream != AudioManager.STREAM_MUSIC) return;
            refresh();
        }
    };

    Volume(AccessibilityService s) {
        service = s;
        audio = (AudioManager) s.getSystemService(Context.AUDIO_SERVICE);
        wm = (WindowManager) s.getSystemService(Context.WINDOW_SERVICE);
        view = new VolumeStepper(s);
    }

    void start() {
        if (started || audio == null) return;
        IntentFilter f = new IntentFilter("android.media.VOLUME_CHANGED_ACTION");
        f.addAction("android.media.STREAM_MUTE_CHANGED_ACTION");
        service.registerReceiver(changed, f);
        started = true;
    }

    void stop() {
        if (!started) return;
        try {
            service.unregisterReceiver(changed);
        } catch (RuntimeException ignored) {
            // not registered
        }
        started = false;
        ui.removeCallbacks(hide);
        hide();
    }

    /** Test hook: show the stepper for the current level (delta is applied first). */
    void demo(int delta) {
        if (audio == null) return;
        if (delta != 0) audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,
                delta > 0 ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER, 0);
        refresh();
    }

    private void refresh() {
        int max = Math.max(1, audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        int level = audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 / max;
        show(level, audio.isStreamMute(AudioManager.STREAM_MUSIC));
    }

    private void show(int percent, boolean muted) {
        boolean fresh = !attached;
        if (!attached) {
            // Covers Xiaomi's bar (about 40 x 270 dp, centred on the right edge, ~20 dp in).
            int w = Tile.dp(service, 60), h = Tile.dp(service, 304);
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(w, h,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
            lp.x = Tile.dp(service, 10);
            try {
                wm.addView(view, lp);
                attached = true;
            } catch (RuntimeException ex) {
                return;
            }
            view.setAlpha(0f);
            view.setTranslationX(Tile.dp(service, 20));
            view.animate().alpha(1f).translationX(0).setInterpolator(new DecelerateInterpolator())
                    .setDuration(160).start();
        } else if (view.getAlpha() < 1f) {
            view.animate().cancel();
            view.animate().alpha(1f).translationX(0).setDuration(120).start();
        }
        view.set(percent, muted, !fresh);
        ui.removeCallbacks(hide);
        ui.postDelayed(hide, HIDE_MS);
    }

    private void hide() {
        if (!attached) return;
        view.stopAlive();  // nothing animates while hidden
        view.animate().alpha(0f).translationX(Tile.dp(service, 20)).setDuration(260)
                .withEndAction(() -> {
                    if (!attached) return;
                    try {
                        wm.removeView(view);
                    } catch (RuntimeException ignored) {
                        // already gone
                    }
                    attached = false;
                }).start();
    }
}
