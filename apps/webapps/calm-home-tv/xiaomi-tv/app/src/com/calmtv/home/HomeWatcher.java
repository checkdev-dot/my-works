package com.calmtv.home;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.tv.TvInputManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Always-on helper (an accessibility service, so the system keeps it running):
 *  - Home button  -> Calm Home; the grid (PatchWall) button -> the Library.
 *  - Steps in if the Google TV home screen comes up on its own (e.g. right after boot).
 *  - Watches the PS4's HDMI port: when the PS4 wakes up, switches to it and shows a
 *    "PlayStation detected" card.
 * Every other button (Netflix, Prime, Hotstar, YouTube, Assistant, volume, power) passes through.
 */
public class HomeWatcher extends AccessibilityService {
    /** Set when the user picks "Google TV home" in the Library; cleared by the next Home press. */
    static volatile boolean allowGoogleHome;
    /** True while the system has this service bound (read by SelfHeal). */
    static volatile boolean running;

    private static final int COUNTDOWN = 5;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private TvInputManager tvInputs;
    private TvInputManager.TvInputCallback inputWatch;
    private String foreground = "";        // package of the app on screen (from window events)
    private View prompt;                   // the countdown card while it's showing
    private Runnable promptTick;
    private Volume volume;
    private Ps4Switch ps4;                 // all the auto-switch rules live there

    private final android.content.BroadcastReceiver screenOn = new android.content.BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            if (ps4 == null) return;
            if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) ps4.onScreenOff();
            else ps4.onScreenOn();
        }
    };

    @Override
    protected void onServiceConnected() {
        // No key filtering (see res/xml/home_watcher.xml): make sure the flag is off.
        AccessibilityServiceInfo info = getServiceInfo();
        info.flags &= ~AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS;
        setServiceInfo(info);
        running = true;
        instance = this;
        // The stock home may already be showing (see takeOverIfStockHome): check twice while the TV starts.
        ui.postDelayed(this::takeOverIfStockHome, 2500);
        ui.postDelayed(this::takeOverIfStockHome, 9000);
        watchPs4();
        volume = new Volume(this);
        volume.start();
        android.content.IntentFilter screen = new android.content.IntentFilter(Intent.ACTION_SCREEN_ON);
        screen.addAction(Intent.ACTION_SCREEN_OFF);
        registerReceiver(screenOn, screen);
        // A fresh boot may find the PS4 already on (rule 7); any later restart is not a power-on (rule 10).
        boolean freshBoot = android.os.SystemClock.elapsedRealtime() < 3 * 60_000;
        ui.postDelayed(() -> ps4.onServiceStart(freshBoot), 5000);
        // Right after a power-on, a pile of streaming apps start themselves in the background and fill
        // the RAM (the TV swaps hard and crawls). Close the idle ones twice while that settles. This
        // runs here, not in Home, because the TV often powers on to an HDMI input, not to Home.
        if (freshBoot) {
            long up = android.os.SystemClock.elapsedRealtime();
            for (long at : new long[]{90_000, 150_000}) {
                ui.postDelayed(() -> bg.execute(() -> Apps.quietTrim(this, true)), Math.max(0, at - up));
            }
        }
    }

    @Override
    public boolean onUnbind(Intent intent) {
        running = false;
        if (tvInputs != null && inputWatch != null) tvInputs.unregisterCallback(inputWatch);
        if (volume != null) volume.stop();
        try {
            unregisterReceiver(screenOn);
        } catch (RuntimeException ignored) {
            // not registered
        }
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || e.getPackageName() == null) return;
        String pkg = e.getPackageName().toString();
        // Track the app on screen. Ignore system pop-ups (volume bar, toasts) and our own overlay
        // cards: only real screens count, or "on HDMI" would be lost whenever a card shows.
        CharSequence cls = e.getClassName();
        boolean popup = "com.android.systemui".equals(pkg)
                || cls != null && cls.toString().contains("Toast")
                || getPackageName().equals(pkg) && (cls == null || !cls.toString().endsWith("Activity"));
        if (!popup && !pkg.equals(foreground)) {
            foreground = pkg;
            if (ps4 != null) ps4.onForeground(pkg);
        }
        String c = cls == null ? "" : cls.toString();
        if (Apps.GTV.equals(pkg) && !allowGoogleHome) {
            // Grid button (ALL_APPS) opens Google's app grid: show our Library instead.
            if (c.contains("moreapps") || c.contains("FullscreenApps")) {
                redirect("grid", Apps.GTV, this::openLibrary);
            } else if (!c.contains("gateway") && !c.contains("profile")) {
                // (gateway = a deep link passing through to another screen; profile = the account
                // check that Settings shows. Neither is Google's home, so leave them be.)
                redirect("home", Apps.GTV, this::goHome);
            }
        }
        // The remote's PatchWall button opens Xiaomi's ad-filled home: open Crunchyroll instead.
        // PatchWall opens in two steps (a BannerLogo splash, then PatchWallActivity a second or two
        // later), so every PatchWall screen within a few seconds of a press means "Crunchyroll".
        // Long after a press it means you pressed Back in Crunchyroll and landed on PatchWall
        // underneath it: go Home then, or Back could never get you out of Crunchyroll.
        if (PATCHWALL.equals(pkg)) {
            android.util.Log.i("CalmWatch", "PatchWall window: " + c);
            // A press shows PatchWall's splash first (it reports as a plain FrameLayout or BannerLogo);
            // Back from Crunchyroll reveals PatchWallActivity directly, with no splash.
            if (!c.contains("PatchWallActivity")) patchwallPressAt = android.os.SystemClock.uptimeMillis();
            redirect("patchwall", PATCHWALL, () -> {
                if (android.os.SystemClock.uptimeMillis() - patchwallPressAt < 6000) openCrunchyroll();
                else goHome();
            });
        }
    }

    private long patchwallPressAt;

    private static final String PATCHWALL = "com.mitv.tvhome.atv";

    /**
     * Swap an unwanted screen for ours. Acts at once (one action per press, so an app's burst of
     * window events can't stack copies), then double-checks what is really on screen a moment
     * later: if the unwanted screen is still there (a second press inside the burst window, a slow
     * start), it acts again. Up to three checks, so it can never loop.
     */
    private void redirect(String what, String unwantedPkg, Runnable action) {
        if (once(what)) action.run();
        Runnable old = verifiers.get(what);
        if (old != null) ui.removeCallbacks(old);
        Runnable check = new Runnable() {
            int tries = 0;

            @Override
            public void run() {
                if (!unwantedPkg.equals(foreground) || ++tries > 3) return;
                lastRedirect.put(what, android.os.SystemClock.uptimeMillis());
                action.run();
                ui.postDelayed(this, 700);
            }
        };
        verifiers.put(what, check);
        ui.postDelayed(check, 700);
    }

    private final java.util.Map<String, Runnable> verifiers = new java.util.HashMap<>();

    private void openCrunchyroll() {
        Intent cr = getPackageManager().getLeanbackLaunchIntentForPackage(CRUNCHYROLL);
        if (cr == null) cr = getPackageManager().getLaunchIntentForPackage(CRUNCHYROLL);
        if (cr != null) {
            startActivity(cr.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED));
        } else {
            openLibrary();  // Crunchyroll not installed: the Library is the next best thing
        }
    }

    private static final String CRUNCHYROLL = "com.crunchyroll.crunchyroid";
    private final java.util.Map<String, Long> lastRedirect = new java.util.HashMap<>();

    /**
     * One redirect per button press: an app reports several window changes as it opens, and
     * acting on each one stacked up copies of the Library.
     */
    private boolean once(String what) {
        long now = android.os.SystemClock.uptimeMillis();
        Long last = lastRedirect.get(what);
        if (last != null && now - last < 2000) return false;
        lastRedirect.put(what, now);
        return true;
    }

    private void openLibrary() {
        startActivity(new Intent(this, HomeActivity.class).putExtra(HomeActivity.EXTRA_OPEN_LIBRARY, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }

    /**
     * When this service starts (after a reboot or an update), Google's or Xiaomi's home may already
     * be on screen. Pressing Home on a screen that's already showing sends no new window event, so
     * without this check the TV could stay on the stock home with its ads. Ask the usage history
     * which app came to the front last, and take over if it's one of the stock homes.
     */
    private void takeOverIfStockHome() {
        if (allowGoogleHome) return;
        try {
            android.app.usage.UsageStatsManager usm = (android.app.usage.UsageStatsManager) getSystemService(USAGE_STATS_SERVICE);
            long now = System.currentTimeMillis();
            android.app.usage.UsageEvents ev = usm.queryEvents(now - 10 * 60_000, now);
            android.app.usage.UsageEvents.Event e = new android.app.usage.UsageEvents.Event();
            String last = null;
            while (ev.hasNextEvent()) {
                ev.getNextEvent(e);
                if (e.getEventType() == android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED) last = e.getPackageName();
            }
            if (last != null) foreground = last;
            if (Apps.GTV.equals(last) || PATCHWALL.equals(last)) goHome();
        } catch (RuntimeException ignored) {
            // no usage access: the next window change will redirect as usual
        }
    }

    private void goHome() {
        startActivity(new Intent(this, HomeActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }

    // --- PS4 auto-switch ---

    private void watchPs4() {
        tvInputs = (TvInputManager) getSystemService(Context.TV_INPUT_SERVICE);
        ps4 = new Ps4Switch(new Ps4Switch.Host() {
            @Override public String ps4InputId() { return ps4Id; }  // cached; worked out off the main thread
            @Override public int inputState(String id) {
                try {
                    return tvInputs == null ? TvInputManager.INPUT_STATE_DISCONNECTED : tvInputs.getInputState(id);
                } catch (IllegalArgumentException e) {
                    return TvInputManager.INPUT_STATE_DISCONNECTED;
                }
            }
            @Override public String foreground() { return foreground; }
            @Override public boolean promptShowing() { return prompt != null; }
            @Override public void showPrompt() { HomeWatcher.this.showPrompt(); }
            @Override public void cancelPrompt() { closePrompt(); }
            @Override public void switchToPs4() { HomeWatcher.this.switchToPs4(); }
            @Override public void ps4OffGoHome() {
                goHome();
                ui.postDelayed(() -> showCard("PS4 turned off", "Back to Home", 3000, null), 500);
            }
            @Override public boolean enabled() { return Apps.prefs(HomeWatcher.this).getBoolean("ps4_autoswitch", true); }
        });
        if (tvInputs == null || inputWatch != null) return;
        inputWatch = new TvInputManager.TvInputCallback() {
            @Override
            public void onInputStateChanged(String inputId, int state) {
                // Which port is the PS4 can change with what's switched on: re-check it in the
                // background (it reads every app and input), then let the rules run on main.
                bg.execute(() -> {
                    refreshPs4();
                    ui.post(() -> ps4.onInputState(inputId));
                });
            }
        };
        tvInputs.registerCallback(inputWatch, ui);
        bg.execute(this::refreshPs4);
    }

    private volatile Apps.Entry ps4Entry;
    private volatile CharSequence ps4Port = "HDMI";

    /** Everything about the PS4 the cards need, worked out once off the main thread. */
    private void refreshPs4() {
        ps4Entry = Apps.ps4(this, Apps.installed(this));
        CharSequence p = Apps.ps4PortLabel(this);
        if (p != null) ps4Port = p;
        ps4Id = ps4InputId();
    }

    private volatile String ps4Id;
    private final java.util.concurrent.ExecutorService bg = java.util.concurrent.Executors.newSingleThreadExecutor();

    /** The PS4's input id (from the PS4 tile's HDMI port), or null. */
    private String ps4InputId() {
        Apps.Entry e = ps4Entry;
        if (e == null || e.intent.getData() == null || tvInputs == null) return null;
        for (android.media.tv.TvInputInfo in : tvInputs.getTvInputList()) {
            if (android.media.tv.TvContract.buildChannelUriForPassthroughInput(in.getId()).equals(e.intent.getData())) {
                return in.getId();
            }
        }
        return null;
    }

    private void showPrompt() {
        CharSequence port = ps4Port;
        TextView[] lines = new TextView[2];
        prompt = showCard("PlayStation detected", "", 0, lines);
        if (prompt == null) {
            ps4.switchConfirmed();
            return;
        }
        final int[] left = {COUNTDOWN};
        promptTick = new Runnable() {
            @Override
            public void run() {
                if (prompt == null) return;
                if (left[0] <= 0) {
                    switchNow();
                    return;
                }
                lines[1].setText(Emph.key("Switching to " + port + " in " + left[0] + "…   OK now  ·  Back to stay"));
                left[0]--;
                ui.postDelayed(this, 1000);
            }
        };
        ui.post(promptTick);
    }

    /** OK pressed or the countdown ran out: close the card and let the rules decide. */
    private void switchNow() {
        closePrompt();
        ps4.switchConfirmed();
    }

    /** Back pressed on the card. */
    private void dismissPrompt() {
        closePrompt();
        ps4.dismissed();
    }

    private void switchToPs4() {
        Apps.Entry target = ps4Entry;
        if (target == null) return;
        Apps.launch(this, target);
        ui.postDelayed(() -> showCard("Enjoy gaming! 🎮", "Switched to " + ps4Port, 3000, null), 700);
    }

    private void closePrompt() {
        if (promptTick != null) ui.removeCallbacks(promptTick);
        View p = prompt;
        prompt = null;
        promptTick = null;
        if (p != null) dismiss(p);
    }

    /**
     * A glass card at the top of the screen, drawn by this service over anything (HDMI too).
     * @param autoHideMs hide after this long, or 0 to keep it until dismiss()
     * @param lines if given, receives the title and subtitle views (for live updates)
     */
    private View showCard(String title, String sub, long autoHideMs, TextView[] lines) {
        WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (wm == null) return null;
        LinearLayout card = new LinearLayout(this);
        card.setGravity(Gravity.CENTER_VERTICAL);
        int p = Tile.dp(this, 16);
        card.setPadding(p, Tile.dp(this, 12), p + Tile.dp(this, 8), Tile.dp(this, 12));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xE60A1C4A, 0xE6003B8E});
        bg.setCornerRadius(Tile.dp(this, 20));
        bg.setStroke(Tile.dp(this, 1), 0x4DFFFFFF);
        card.setBackground(bg);

        FrameLayout badge = new FrameLayout(this);
        View art = new View(this);
        art.setBackground(new Ps4Art(null));
        GradientDrawable clip = new GradientDrawable();
        clip.setCornerRadius(Tile.dp(this, 10));
        badge.setBackground(clip);
        badge.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        badge.setClipToOutline(true);
        badge.addView(art, new FrameLayout.LayoutParams(-1, -1));
        card.addView(badge, new LinearLayout.LayoutParams(Tile.dp(this, 84), Tile.dp(this, 48)));

        LinearLayout text = new LinearLayout(this);
        text.setOrientation(LinearLayout.VERTICAL);
        text.setPadding(Tile.dp(this, 14), 0, 0, 0);
        TextView t1 = new TextView(this);
        t1.setText(title);
        t1.setTextColor(Color.WHITE);
        t1.setTextSize(18);
        t1.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        TextView t2 = new TextView(this);
        t2.setText(Emph.key(sub));
        t2.setTextColor(0xD9FFFFFF);
        t2.setTextSize(13);
        text.addView(t1);
        text.addView(t2);
        card.addView(text);
        if (lines != null) {
            lines[0] = t1;
            lines[1] = t2;
        }

        // A card that stays up (the PS4 countdown) takes the remote's focus, so OK and Back reach it;
        // brief cards never take focus.
        boolean interactive = autoHideMs == 0;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                (interactive ? 0 : WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE) | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT);
        if (interactive) {
            card.setFocusable(true);
            card.setFocusableInTouchMode(true);
            card.setOnKeyListener((v, keyCode, ev) -> {
                if (ev.getAction() != KeyEvent.ACTION_UP) return true;  // swallow, act on release
                if (keyCode == KeyEvent.KEYCODE_BACK) dismissPrompt();
                else if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) switchNow();
                else return false;
                return true;
            });
        }
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = Tile.dp(this, 28);
        try {
            wm.addView(card, lp);
        } catch (RuntimeException ex) {
            Log.w("CalmHome", "card overlay failed", ex);
            return null;
        }
        card.setAlpha(0f);
        card.setTranslationY(-Tile.dp(this, 20));
        card.animate().alpha(1f).translationY(0).setDuration(300).start();
        if (interactive) card.requestFocus();
        if (autoHideMs > 0) ui.postDelayed(() -> dismiss(card), autoHideMs);
        return card;
    }

    private void dismiss(View card) {
        WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        card.animate().alpha(0f).translationY(-Tile.dp(this, 20)).setDuration(300)
                .withEndAction(() -> {
                    try {
                        wm.removeView(card);
                    } catch (RuntimeException ignored) {
                        // already gone
                    }
                }).start();
    }

    static volatile HomeWatcher instance;

    /** For testing from the PC (am start ... --ei demo_volume N): step volume by N and show the stepper. */
    static void demoVolume(int delta) {
        HomeWatcher w = instance;
        if (w == null) return;
        w.ui.post(() -> {
            if (w.volume == null) w.volume = new Volume(w);
            w.volume.demo(delta);
        });
    }

    /** For testing from the PC (am start ... --ez demo_ps4 true): show the countdown card now. */
    static void demoPrompt() {
        HomeWatcher w = instance;
        if (w == null) return;
        w.ui.post(() -> {
            if (w.prompt != null) return;
            if (w.ps4Entry != null) w.showPrompt();
        });
    }

    @Override
    public void onInterrupt() {}
}
