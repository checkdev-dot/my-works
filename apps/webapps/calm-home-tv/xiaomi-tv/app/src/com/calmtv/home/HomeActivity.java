package com.calmtv.home;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.TextUtils;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextClock;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The home screen. Top left: weather and Wi-Fi chips, then Recents. Top right: clock
 * and a greeting. Bottom: the focused app's name and a frosted-glass dock (a carousel
 * that only ever shows whole tiles, with overflow folders at its ends). Behind it all,
 * a nature scene that changes every minute.
 *
 * Everything sits inside a 5% TV-safe margin so the TV's overscan never crops it.
 * Memory: while another app is in front, the wallpaper is released down to a ~10 KB
 * blurred copy so streaming apps and the PS4 get the RAM.
 */
public class HomeActivity extends Activity {
    private static final long ROTATE_MS = 5 * 60_000;   // a new photo every 5 minutes: calmer
    private static final long DIM_MS = 10_000, QUIET_MS = 30_000;  // idle: dim extras, then just clock + photo
    private static final int WALL_W = 960, WALL_H = 540;
    private static final int SAFE_X = 48, SAFE_BOTTOM = 40, GLASS_H = 128;  // (bottom room for the shelf peek)
    private static final int SHELF_H = GLASS_H + SAFE_BOTTOM + 190;  // the shade starts well above the dock
    /** The two top panels (For you | clock & weather): identical size; 2 x 420 + gap = the safe width. */
    private static final int PANEL_W = 420, PANEL_H = 212;
    private static final DecelerateInterpolator EASE = new DecelerateInterpolator(1.5f);

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private int scene = new Random().nextInt(Wallpapers.SCENES);
    private List<String> photoOrder;  // touched only on the io thread
    private int photoIndex;

    // Two stacked layers for cross-fading; the glass copies mirror them.
    private ImageView bgBottom, bgTop, glassBottom, glassTop;
    private Bitmap bottomFrost, topFrost;
    private boolean topShowing;
    private long photoAt;            // when the current photo appeared (uptime)
    private boolean released = true; // photo dropped to save memory; the next visit needs a new one
    private ObjectAnimator drift;

    private FrameLayout glass;
    private Carousel carousel;
    private LinearLayout dockRow, recentRow, installedRow;
    private View recentBlock, installedBlock;
    private TextView heroTitle, heroSub, greeting, greetingNote, recentLabel, recentEmpty;
    private String topHabit;  // app usually opened around now (from For you), for the greeting
    private TextView wSymbol, wTemp, wCondition, wDetails, netLine, aqiPill;
    private GradientDrawable aqiBg;
    private LinearLayout weatherBox, wifiChip;
    private WifiBars wifiBars;
    private TextView wifiText, wifiSub, wifiLabel, wRange;
    private GradientDrawable wifiBg;
    /** Current wallpaper's 64x36 frosted copy and glass tint, shared with the Library (tiny: ~4.6 KB). */
    static volatile Bitmap sFrost;
    static volatile int sGlassBase = 0x141414;
    private View lastDockTile, divider, dateView, weatherRow, forYouBlock;
    private int[] dockColors = {0xB3141414, 0x99141414};  // replaced by the photo's own tint
    private View wifiDot;
    private GradientDrawable wifiDotBg;
    private View spotlight, avatar;
    private MorePill moreLeft, moreRight;
    private String dockSignature = "";
    private View topLeftView, statusView, heroView;
    private View[] forYouViews;
    private GradientDrawable dockTint;
    private int idleStage;  // 0 = awake, 1 = extras dimmed, 2 = quiet (clock + photo only)
    private final Runnable dimIdle = () -> setIdle(1);
    private final Runnable quietIdle = () -> setIdle(2);
    private Tile moving;  // tile being repositioned in reorder mode

    private final Runnable rotate = new Runnable() {
        @Override
        public void run() {
            arrivalPending = false;
            nextWallpaper();
            // Nobody watching (quiet stage): change the photo far less often.
            ui.postDelayed(this, idleStage == 2 ? 3 * ROTATE_MS : ROTATE_MS);
        }
    };

    private final Runnable trim = () -> io.execute(() -> Apps.quietTrim(this));
    private final Runnable releaseLater = () -> {
        if (libraryShowing) return;
        this.library.release();  // the list's cards (its app data is kept for a quick next open)
        releaseWallpaper();
    };

    private final BroadcastReceiver packagesChanged = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            Apps.invalidate();
            if (library != null) library.invalidateData();  // the list's kept data is stale now
            dockSignature = "";
            reloadDock();  // show the new app straight away if Home is on screen
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));

        FrameLayout root = new FrameLayout(this);
        root.setClipChildren(false);
        bgBottom = layer(ImageView.ScaleType.CENTER_CROP);
        bgTop = layer(ImageView.ScaleType.CENTER_CROP);
        bgTop.setAlpha(0f);
        root.addView(bgBottom, new FrameLayout.LayoutParams(-1, -1));
        root.addView(bgTop, new FrameLayout.LayoutParams(-1, -1));

        // (Top/bottom shading is painted into each wallpaper image once; see Wallpapers.shade.)
        // Dims the scene while a Recent card is focused, to spotlight it.
        spotlight = new View(this) {
            @Override public boolean hasOverlappingRendering() { return false; }  // a plain fill: fade it directly
        };
        spotlight.setBackgroundColor(Color.BLACK);
        spotlight.setAlpha(0f);
        root.addView(spotlight, new FrameLayout.LayoutParams(-1, -1));

        // --- No panels anywhere: text floats on the photo, made readable by shade painted into the
        //     photo itself (Wallpapers.shade) plus soft text shadows. ---

        // Layout: two balanced columns on top, For you centred below a hairline.
        //   left:  greeting headline (name in bold) / note / Wi-Fi chip
        //   right: clock / date / weather line          (right edge = the dock's edge)
        // alignColumns lines the two up: same cap-top, same bottom.

        // --- top left ---
        LinearLayout topLeft = new LinearLayout(this);
        topLeft.setOrientation(LinearLayout.VERTICAL);
        topLeft.setClipChildren(false);
        topLeft.setClipToPadding(false);
        greeting = new TextView(this);
        style(greeting, 28, "sans-serif-light", 1f);  // name at 32; the phrase around it ~24
        greeting.setIncludeFontPadding(false);
        greeting.setSingleLine();
        greeting.setMaxWidth(dp(560));
        greeting.setEllipsize(android.text.TextUtils.TruncateAt.END);
        topLeft.addView(greeting, new LinearLayout.LayoutParams(-2, -2));
        greetingNote = new TextView(this);
        style(greetingNote, 14, "sans-serif", 0.85f);
        greetingNote.setMaxWidth(dp(520));
        LinearLayout.LayoutParams gnl = new LinearLayout.LayoutParams(-2, -2);
        gnl.topMargin = dp(10);
        gnl.leftMargin = dp(2);
        topLeft.addView(greetingNote, gnl);

        // Wi-Fi chip: [bars]  Network name  ● Connected   [ Change ]
        wifiChip = new LinearLayout(this);
        wifiChip.setGravity(Gravity.CENTER_VERTICAL);
        wifiChip.setFocusable(true);
        wifiChip.setDefaultFocusHighlightEnabled(false);
        wifiChip.setPadding(dp(16), 0, dp(7), 0);
        // Same dark tinted glass as the dock (setDockTint keeps both in step), so it reads on any photo.
        GradientDrawable wbg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, dockColors);
        wbg.setCornerRadius(dp(26));
        wbg.setStroke(dp(1), 0x1FFFFFFF);
        wifiChip.setBackground(wbg);
        wifiBg = wbg;
        wifiBars = new WifiBars();
        ImageView barsView = new ImageView(this);
        barsView.setImageDrawable(wifiBars);
        wifiChip.addView(barsView, new LinearLayout.LayoutParams(dp(19), dp(15)));  // Wi-Fi fan icon
        LinearLayout names = new LinearLayout(this);
        names.setOrientation(LinearLayout.VERTICAL);
        wifiText = new TextView(this);
        style(wifiText, 14, "sans-serif-medium", 1f);
        wifiText.setSingleLine();
        wifiText.setMaxWidth(dp(190));
        wifiText.setEllipsize(android.text.TextUtils.TruncateAt.END);
        wifiText.setIncludeFontPadding(false);
        names.addView(wifiText, new LinearLayout.LayoutParams(-2, -2));
        LinearLayout subRow = new LinearLayout(this);
        subRow.setGravity(Gravity.CENTER_VERTICAL);
        wifiDot = new View(this);
        wifiDotBg = new GradientDrawable();
        wifiDotBg.setShape(GradientDrawable.OVAL);
        wifiDotBg.setColor(0xFF34C759);
        wifiDot.setBackground(wifiDotBg);
        subRow.addView(wifiDot, new LinearLayout.LayoutParams(dp(7), dp(7)));
        wifiSub = new TextView(this);
        style(wifiSub, 12, "sans-serif", 0.8f);
        wifiSub.setText("Connected");
        wifiSub.setIncludeFontPadding(false);
        LinearLayout.LayoutParams wsl = new LinearLayout.LayoutParams(-2, -2);
        wsl.leftMargin = dp(5);
        subRow.addView(wifiSub, wsl);
        LinearLayout.LayoutParams srl = new LinearLayout.LayoutParams(-2, -2);
        srl.topMargin = dp(3);
        names.addView(subRow, srl);
        LinearLayout.LayoutParams nml = new LinearLayout.LayoutParams(-2, -2);
        nml.leftMargin = dp(14);
        wifiChip.addView(names, nml);
        TextView change = new TextView(this);     // the obvious "you can edit this" affordance
        change.setText("Change");
        change.setTextColor(Color.WHITE);
        change.setTextSize(12);
        change.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        change.setGravity(Gravity.CENTER);
        change.setPadding(dp(14), 0, dp(14), 0);
        GradientDrawable cbg = new GradientDrawable();
        cbg.setCornerRadius(dp(18));
        cbg.setColor(0);                          // ghost button: outline only until focused
        cbg.setStroke(dp(1), 0x59FFFFFF);
        change.setBackground(cbg);
        LinearLayout.LayoutParams chl = new LinearLayout.LayoutParams(-2, dp(28));
        chl.leftMargin = dp(22);
        wifiChip.addView(change, chl);
        wifiChip.setOnFocusChangeListener((v, has) -> {
            wbg.setColors(has ? new int[]{0xF2FFFFFF, 0xF2FFFFFF} : dockColors);
            wbg.setStroke(dp(1), has ? 0xFFFFFFFF : 0x1FFFFFFF);
            int fg = has ? 0xFF111111 : Color.WHITE;
            wifiBars.setColor(fg);
            wifiText.setTextColor(fg);
            wifiSub.setTextColor(fg);
            wifiText.setShadowLayer(has ? 0 : 6, 0, 1, 0xE6000000);
            wifiSub.setShadowLayer(has ? 0 : 6, 0, 1, 0xE6000000);
            cbg.setColor(has ? 0xFF2F6FDE : 0);
            cbg.setStroke(dp(1), has ? 0xFF2F6FDE : 0x59FFFFFF);
            v.setPivotX(0);  // grows into the screen, never past the left edge
            v.setPivotY(v.getHeight() / 2f);
            v.animate().scaleX(has ? 1.04f : 1f).scaleY(has ? 1.04f : 1f).setDuration(140).start();
            if (has) showHero("Wi-Fi", "Press OK to switch networks or add a new one");
        });
        wifiChip.setOnClickListener(v -> Apps.launch(this, Apps.wifi()));
        LinearLayout.LayoutParams wcl = new LinearLayout.LayoutParams(-2, dp(46));
        wcl.topMargin = dp(14);
        topLeft.addView(wifiChip, wcl);
        wifiLabel = new TextView(this);  // (no longer shown)
        FrameLayout.LayoutParams tlp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START);
        tlp.setMargins(dp(SAFE_X), dp(24), 0, 0);
        root.addView(topLeft, tlp);
        topLeftView = topLeft;

        // --- top right: clock, date, weather ---
        LinearLayout status = new LinearLayout(this);
        status.setOrientation(LinearLayout.VERTICAL);
        status.setGravity(Gravity.END);
        status.setClipChildren(false);
        status.setClipToPadding(false);
        TextClock time = new TextClock(this);
        time.setFormat12Hour("h:mm");
        time.setFormat24Hour("HH:mm");
        style(time, 56, "sans-serif-light", 0.96f);
        time.setLetterSpacing(-0.03f);
        time.setIncludeFontPadding(false);
        // Own LayoutParams: a vertical LinearLayout's default is match_parent, which squeezes rows.
        status.addView(time, new LinearLayout.LayoutParams(-2, -2));
        TextClock date = new TextClock(this);
        date.setFormat12Hour("EEEE, d MMMM");
        date.setFormat24Hour("EEEE, d MMMM");
        style(date, 14, "sans-serif", 0.9f);
        date.setLetterSpacing(0.04f);
        LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(-2, -2);
        dl.topMargin = dp(8);
        status.addView(date, dl);
        dateView = date;
        // One quiet line: ☾ 24°  ·  Clear night · Delhi  ·  ● AQI 159
        LinearLayout wRow = new LinearLayout(this);
        wRow.setGravity(Gravity.CENTER_VERTICAL);
        weatherBox = new LinearLayout(this);
        weatherBox.setGravity(Gravity.CENTER_VERTICAL);
        wSymbol = new TextView(this);
        style(wSymbol, 14, "sans-serif", 0.9f);
        weatherBox.addView(wSymbol);
        wTemp = new TextView(this);
        style(wTemp, 14, "sans-serif-medium", 1f);
        LinearLayout.LayoutParams wtl2 = new LinearLayout.LayoutParams(-2, -2);
        wtl2.leftMargin = dp(6);
        weatherBox.addView(wTemp, wtl2);
        wRow.addView(weatherBox);
        wCondition = new TextView(this);
        style(wCondition, 14, "sans-serif", 0.85f);
        wCondition.setSingleLine();
        LinearLayout.LayoutParams wcd = new LinearLayout.LayoutParams(-2, -2);
        wcd.leftMargin = dp(12);
        wRow.addView(wCondition, wcd);
        wRange = new TextView(this);  // (H/L: kept updated, not shown, to keep the line short)
        wRange.setVisibility(View.GONE);
        wRow.addView(wRange);
        aqiPill = new TextView(this);             // "● AQI 159": dot coloured by air-quality band
        style(aqiPill, 14, "sans-serif-medium", 0.95f);
        LinearLayout.LayoutParams al = new LinearLayout.LayoutParams(-2, -2);
        al.leftMargin = dp(12);
        wRow.addView(aqiPill, al);
        aqiBg = new GradientDrawable();  // (kept for refreshChips; no pill background)
        LinearLayout.LayoutParams wrl = new LinearLayout.LayoutParams(-2, -2);
        wrl.topMargin = dp(6);
        status.addView(wRow, wrl);
        weatherRow = wRow;
        FrameLayout.LayoutParams sl = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END);
        sl.setMargins(0, dp(18), dp(SAFE_X), 0);  // right edge = the dock's right edge
        root.addView(status, sl);
        statusView = status;

        // --- a hairline that fades in from both ends, then For you, centred ---
        divider = new View(this);
        GradientDrawable dv = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{0x00FFFFFF, 0x33FFFFFF, 0x33FFFFFF, 0x00FFFFFF});
        divider.setBackground(dv);
        FrameLayout.LayoutParams dvl = new FrameLayout.LayoutParams(-1, Math.max(1, dp(1)), Gravity.TOP);
        dvl.setMargins(dp(SAFE_X), dp(200), dp(SAFE_X), 0);
        root.addView(divider, dvl);

        LinearLayout forYou = new LinearLayout(this);
        forYou.setOrientation(LinearLayout.VERTICAL);
        forYou.setGravity(Gravity.START);
        forYou.setClipChildren(false);
        forYou.setClipToPadding(false);
        recentLabel = new TextView(this);
        style(recentLabel, 13, "sans-serif-medium", 0.85f);
        recentLabel.setLetterSpacing(0.04f);
        recentLabel.setText("For you");
        LinearLayout.LayoutParams rll = new LinearLayout.LayoutParams(-2, -2);
        rll.leftMargin = dp(2);  // optically level with the greeting note
        forYou.addView(recentLabel, rll);
        recentRow = new LinearLayout(this);
        recentRow.setOrientation(LinearLayout.HORIZONTAL);
        recentRow.setClipChildren(false);
        recentRow.setClipToPadding(false);
        recentRow.setPadding(0, dp(10), dp(4), dp(4));  // first bubble on the Wi-Fi chip's edge
        forYou.addView(recentRow, new LinearLayout.LayoutParams(-2, -2));
        recentEmpty = new TextView(this);
        style(recentEmpty, 13, "sans-serif-light", 0.6f);
        recentEmpty.setText("Your favourite apps will appear here.");
        recentEmpty.setPadding(0, dp(8), 0, 0);
        forYou.addView(recentEmpty, new LinearLayout.LayoutParams(-2, -2));
        recentBlock = recentRow;
        FrameLayout.LayoutParams fyl = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START);
        fyl.leftMargin = dp(SAFE_X);  // same left line as the greeting and the Wi-Fi chip
        fyl.topMargin = dp(220);
        root.addView(forYou, fyl);
        forYouBlock = forYou;
        forYouViews = new View[]{recentLabel, recentRow, recentEmpty, greetingNote, divider};

        // One pending pass at a time: two passes in the same frame would each apply the same
        // correction (positions haven't moved yet), doubling it.
        Runnable alignPass = () -> alignColumns(topLeft, time);
        View.OnLayoutChangeListener align = (av, a1, a2, a3, a4, a5, a6, a7, a8) -> {
            ui.removeCallbacks(alignPass);
            ui.post(alignPass);
        };
        topLeft.addOnLayoutChangeListener(align);
        status.addOnLayoutChangeListener(align);
        forYou.addOnLayoutChangeListener(align);

        // Views that no longer show but are still updated elsewhere.
        wDetails = new TextView(this);
        netLine = new TextView(this);
        installedRow = new LinearLayout(this);
        installedBlock = installedRow;

        // --- focused app's name, above the dock ---
        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        // No box: readable thanks to the shade painted into the bottom of every photo plus shadows.
        // Shown only while you're moving around (it fades away when idle).

        heroView = hero;
        heroTitle = new TextView(this);
        style(heroTitle, 24, "sans-serif", 1f);  // regular weight, full white: crisp while scrolling
        heroSub = new TextView(this);
        style(heroSub, 14, "sans-serif", 1f);
        heroSub.setTextColor(0xCCFFFFFF);  // the line a touch softer; its key words full white (Emph)
        // Fixed size, one line each: changing the text on every focus move then never has to
        // re-measure the screen's layout.
        for (TextView t : new TextView[]{heroTitle, heroSub}) {
            t.setSingleLine();
            t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        }
        hero.addView(heroTitle, new LinearLayout.LayoutParams(dp(760), dp(34)));
        hero.addView(heroSub, new LinearLayout.LayoutParams(dp(760), dp(22)));
        FrameLayout.LayoutParams hlp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        hlp.setMargins(dp(SAFE_X), 0, 0, dp(SAFE_BOTTOM + GLASS_H - 8));  // left, just above the dock
        root.addView(hero, hlp);

        // --- the shelf: no floating box. A full-width shade rising from the bottom edge, tinted
        //     with the photo's own colour, so the dock reads as part of the scene (and it's one
        //     gradient fill: cheaper than the old frosted-glass pill). ---
        glass = new FrameLayout(this);
        glassBottom = layer(ImageView.ScaleType.FIT_XY);   // (kept for the wallpaper code; never shown)
        glassTop = layer(ImageView.ScaleType.FIT_XY);
        glassBottom.setVisibility(View.GONE);
        glassTop.setVisibility(View.GONE);
        glass.addView(glassBottom);
        glass.addView(glassTop);
        View tint = new View(this);
        GradientDrawable tintShape = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, shelfColors(0x141414));
        tint.setBackground(tintShape);
        dockTint = tintShape;
        glass.addView(tint, new FrameLayout.LayoutParams(-1, -1));
        FrameLayout.LayoutParams glp = new FrameLayout.LayoutParams(-1, dp(SHELF_H), Gravity.BOTTOM);
        root.addView(glass, glp);
        heroView.bringToFront();  // the app name sits above the shelf's shade, not under it (it was greying the text)
        // --- dock: carousel inside the glass, overflow folders at its ends ---
        carousel = new Carousel(this, 0);
        carousel.centred = true;  // focus stays in the middle; layoutDock places the ring
        carousel.setPadding(dp(70), dp(22), dp(70), dp(8));
        dockRow = carousel.row;
        FrameLayout.LayoutParams dlp = new FrameLayout.LayoutParams(-1, dp(GLASS_H), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        dlp.setMargins(0, 0, 0, dp(SAFE_BOTTOM));
        root.addView(carousel, dlp);
        moreLeft = new MorePill(this, false);
        moreRight = new MorePill(this, true);
        FrameLayout.LayoutParams mll = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        mll.setMargins(dp(SAFE_X + 14), 0, 0, dp(SAFE_BOTTOM + 30));
        root.addView(moreLeft, mll);
        FrameLayout.LayoutParams mrl = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END);
        mrl.setMargins(0, 0, dp(SAFE_X + 14), dp(SAFE_BOTTOM + 30));
        root.addView(moreRight, mrl);
        // Soft fades at both ends of the dock: apps dissolve into the shelf's colour toward the edges,
        // so the loop reads as going on beyond the screen. Two gradient fills, nothing per frame.
        edgeFadeL = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{0xB3141414, 0x00141414});
        edgeFadeR = new GradientDrawable(GradientDrawable.Orientation.RIGHT_LEFT, new int[]{0xB3141414, 0x00141414});
        for (GradientDrawable g : new GradientDrawable[]{edgeFadeL, edgeFadeR}) {
            View fade = new View(this);
            fade.setBackground(g);
            FrameLayout.LayoutParams fl = new FrameLayout.LayoutParams(dp(110), dp(GLASS_H - 22),
                    Gravity.BOTTOM | (g == edgeFadeL ? Gravity.START : Gravity.END));
            fl.bottomMargin = dp(SAFE_BOTTOM);  // the tiles' band only, clear of the app name above
            root.addView(fade, fl);
            if (g == edgeFadeL) edgeFadeLView = fade; else edgeFadeRView = fade;
        }
        // Shelf peek: a row of small icons half off the bottom edge, so it's clear there's a shelf of
        // apps below (Down). Static views, built only when the app list changes.
        shelfPeek = new LinearLayout(this) {
            @Override public boolean hasOverlappingRendering() { return false; }
        };
        shelfPeek.setGravity(Gravity.CENTER);
        shelfPeek.setAlpha(PEEK_ALPHA);
        FrameLayout.LayoutParams spl = new FrameLayout.LayoutParams(-2, dp(32), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        spl.bottomMargin = -dp(15);  // only the top half shows
        root.addView(shelfPeek, spl);
        // Signifier: "All apps" with a down chevron, centred over the peek, so it's clear what Down does.
        allApps = new LinearLayout(this);
        allApps.setGravity(Gravity.CENTER);
        // A small capsule: soft dark glass with a hairline edge, so it reads as a label, not loose text.
        GradientDrawable cap = new GradientDrawable();
        cap.setCornerRadius(dp(13));
        cap.setColor(0x66000000);
        cap.setStroke(Math.max(1, dp(1)), 0x33FFFFFF);
        allApps.setBackground(cap);
        allApps.setPadding(dp(12), dp(4), dp(10), dp(5));
        TextView aa = new TextView(this);
        style(aa, 11, "sans-serif-medium", 1f);
        aa.setText("All apps");
        aa.setLetterSpacing(0.04f);
        allApps.addView(aa);
        View chev = new View(this);
        chev.setBackground(chevron());
        LinearLayout.LayoutParams chl2 = new LinearLayout.LayoutParams(dp(10), dp(6));
        chl2.leftMargin = dp(6);
        allApps.addView(chev, chl2);
        allApps.setAlpha(0.75f);
        FrameLayout.LayoutParams aal = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        aal.bottomMargin = dp(27);  // clear of the peeking cards
        root.addView(allApps, aal);
        // The "N more" folders are replaced by peeks of the neighbouring apps at each end.
        moreLeft.setVisibility(View.GONE);
        moreRight.setVisibility(View.GONE);
        peekLeft = peek(true);
        peekRight = peek(false);
        root.addView(peekLeft, new FrameLayout.LayoutParams(dp(TILE_W), dp(TILE_H)));
        root.addView(peekRight, new FrameLayout.LayoutParams(dp(TILE_W), dp(TILE_H)));
        // When nothing is hidden on the left, that end of the dock shows the owner's avatar instead.
        avatar = avatar();
        FrameLayout.LayoutParams alp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        alp.setMargins(dp(SAFE_X + 9), 0, 0, dp(SAFE_BOTTOM + 24));
        root.addView(avatar, alp);
        avatar.setVisibility(View.GONE);  // the dock is apps only now
        carousel.setOnWindowChanged((left, right) -> {
            moreLeft.show(left);
            updatePeeks(left, right);
            if (right.isEmpty() && !left.isEmpty()) {
                // At the end: the dock wraps, so preview the first apps it loops back to.
                List<Tile> start = new ArrayList<>(left);
                java.util.Collections.reverse(start);
                moreRight.show(start, true);
            } else {
                moreRight.show(right);
            }
            boolean showAvatar = left.isEmpty();
            if (!Boolean.valueOf(showAvatar).equals(avatar.getTag())) {  // animate only on change
                avatar.setTag(showAvatar);
                avatar.animate().alpha(showAvatar ? 1f : 0f).setDuration(200).start();
            }
        });

        // Home and the app list are one tall page: the list sits just below Home in the same window,
        // and Down scrolls both together (openLibrary). No second screen to create, nothing to drift
        // out of step.
        stage = new FrameLayout(this);
        stage.addView(root, new FrameLayout.LayoutParams(-1, -1));
        homePage = root;
        library = new LibraryPanel(new LibraryPanel.Host() {
            @Override public void closeLibrary(boolean animate) { HomeActivity.this.closeLibrary(animate); }
            @Override public HomeActivity activity() { return HomeActivity.this; }
        });
        library.setVisibility(View.INVISIBLE);
        library.setDescendantFocusability(android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        stage.addView(library, new FrameLayout.LayoutParams(-1, -1));
        setContentView(stage);
        // Dock focus style in one place: the focused app lifts, the rest sit back a little and its
        // neighbours step aside. Runs once per focus change, nothing per frame.
        root.getViewTreeObserver().addOnGlobalFocusChangeListener((oldF, newF) -> styleDock(newF));

        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_CHANGED);
        f.addDataScheme("package");
        registerReceiver(packagesChanged, f);
        // Wi-Fi often connects *after* Home appears (e.g. after a reboot): update the chip whenever the
        // network comes, goes or changes, instead of only when Home is opened.
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            cm.registerDefaultNetworkCallback(netWatch);
        } catch (RuntimeException ignored) {
            // no network service: the chip just updates on each visit
        }
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(packagesChanged);
        try {
            ((android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE)).unregisterNetworkCallback(netWatch);
        } catch (RuntimeException ignored) {
            // wasn't registered
        }
        super.onDestroy();
    }

    @Override
    protected void onStart() {
        super.onStart();
        ui.removeCallbacks(releaseLater);  // back within 15 s: the photo is still here
        String[] g = Greeting.next(this, Apps.prefs(this).getString("name", "Sam"), Weather.cached(this), topHabit);
        greeting.setText(boldName(g[0], Apps.prefs(this).getString("name", "Sam")));
        greetingNote.setText(Emph.key(g[1]));
        // Fade in from 30%, never from zero, so an interrupted fade can't leave it invisible.
        greeting.animate().cancel();
        greetingNote.animate().cancel();
        greeting.setAlpha(0.3f);
        greeting.animate().alpha(1f).setDuration(500).withLayer().start();
        greetingNote.setAlpha(0.3f);
        greetingNote.animate().alpha(0.85f).setStartDelay(200).setDuration(500).withLayer().start();
        refreshChips();
        playEntrance();
        shelfPeek.animate().cancel();
        shelfPeek.setTranslationY(dp(10));
        shelfPeek.animate().translationY(0).alpha(PEEK_ALPHA).setStartDelay(150).setDuration(360).setInterpolator(EASE).withLayer().start();
        nudgeAllApps();
        // Top elements drift in gently on arrival.
        for (View v : new View[]{topLeftView, statusView, forYouBlock}) {
            v.setTranslationY(-dp(12));
            v.animate().translationY(0).setInterpolator(EASE).setDuration(450).start();
        }
        spotlight(false);  // applies the night dim
        wake();
        // Coming home from an app brings a fresh scene. Back from the Library the photo was kept,
        // so just carry on its timer: no decode, no 4 s of full-screen animation.
        ui.removeCallbacks(rotate);
        long due = photoAt + ROTATE_MS - android.os.SystemClock.uptimeMillis();
        // Back from an app: let the first key presses go through before the new photo arrives,
        // and skip its slow zoom (you're about to navigate, not admire).
        if (released) { calmArrival = true; arrivalPending = true; ui.postDelayed(rotate, ARRIVAL_QUIET_MS); }
        else if (due <= 0) ui.post(rotate);
        else ui.postDelayed(rotate, due);
    }

    @Override
    protected void onResume() {
        super.onResume();
        HomeWatcher.allowGoogleHome = false;  // back home: the Google TV screen may be swapped again
        reloadDock();
        // App data for the list, loaded in the background ahead of time. Right after a power-on the
        // TV is swamped (every app starting at once), so wait until it has settled first.
        long sinceBoot = android.os.SystemClock.elapsedRealtime();
        if (sinceBoot > BOOT_SETTLE_MS) library.prefetch();
        else ui.postDelayed(library::prefetch, BOOT_SETTLE_MS - sinceBoot);
        // (The boot-time clean-up of self-started apps lives in HomeWatcher: it runs even if the TV
        //  powers on to an HDMI input instead of Home.)
        // Give the system a moment to bind the service after a cold start before judging it.
        ui.postDelayed(() -> io.execute(() -> SelfHeal.ensureWatcher(this)), 3000);
        // A minute after Home appears (e.g. after boot), tidy away apps the system started by itself.
        ui.removeCallbacks(trim);
        ui.postDelayed(trim, 60_000);
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Off to an app: put the list away and free its cards (Back from the app lands on Home).
        if (libraryShowing) closeLibrary(false);
        // The list's cards are freed with the photo, after 15 s away (a Home press only blinks us).
        ui.removeCallbacks(rotate);
        ui.removeCallbacks(trim);  // never tidy while you're using another app
        stopMoving();
        // Keep the photo for a short while: pressing Home (Google's launcher flashes up first) or a
        // quick look at the Library would otherwise throw it away and decode a new one on return.
        ui.removeCallbacks(releaseLater);
        ui.postDelayed(releaseLater, 15_000);
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN && !libraryShowing) releaseWallpaper();
        // The TV is short of memory and we're in the background: drop the cached app icons and
        // banners too (they reload when Home is next shown).
        if (level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE) Apps.invalidate();  // last resort only: reloading all artwork is costly
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getBooleanExtra(EXTRA_OPEN_LIBRARY, false)) {  // the remote's grid button, Edit dock's "Add apps"
            stage.post(this::openLibrary);
            return;
        }
        if (libraryShowing) closeLibrary(false);  // Home pressed in the list: straight back to Home
        if (intent.getBooleanExtra("demo_ps4", false)) {  // test hook: show the PS4 countdown card
            HomeWatcher.demoPrompt();
            return;
        }
        if (intent.hasExtra("demo_volume")) {             // test hook: volume step + stepper
            HomeWatcher.demoVolume(intent.getIntExtra("demo_volume", 0));
            return;
        }
        // Home pressed while already home: back to the start of the dock.
        stopMoving();
        carousel.resetToStart();
        View land = landingTile();
        if (land != null) land.requestFocus();
        // Google's launcher flashes up first when Home is pressed; when our window gets focus back,
        // Android restores the old focus, so land again once it has.
        landOnFocus = true;
    }

    private boolean landOnFocus;
    private boolean calmArrival;  // next photo change: no zoom (just back from an app)
    private boolean arrivalPending; // that change is waiting for 3 s without key presses
    private static final long BOOT_SETTLE_MS = 3 * 60_000;
    private static boolean bootTrimDone;  // first minutes after power-on: no extra work
    private static final long ARRIVAL_QUIET_MS = 3000;

    static final String EXTRA_OPEN_LIBRARY = "open_library";
    static volatile boolean libraryShowing;
    private FrameLayout stage;
    private android.view.ViewGroup homePage;  // everything on Home: scrolls up as one when the app list comes in
    private LibraryPanel library;
    private static final android.view.animation.Interpolator PAGE = new android.view.animation.PathInterpolator(0.4f, 0f, 0.2f, 1f);

    /** Down on the dock: Home and the list scroll up together, one page, one motion. */
    private void openLibrary() {
        if (libraryShowing || stage.getHeight() == 0) return;
        libraryShowing = true;
        wake();
        lastDockTile = getCurrentFocus() instanceof Tile ? getCurrentFocus() : lastDockTile;
        int h = stage.getHeight();
        library.prepare();  // first rows built now from kept data, so they slide in with the page
        library.animate().cancel();
        homePage.animate().cancel();
        library.setTranslationY(h);
        library.setVisibility(View.VISIBLE);
        homePage.setDescendantFocusability(android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        library.setDescendantFocusability(android.view.ViewGroup.FOCUS_AFTER_DESCENDANTS);
        library.focusFirst();
        // Same duration, same curve, started together: they move as one sheet.
        // (No layers: on this GPU, drawing two full-screen pages into layers costs more than moving them.)
        homePage.animate().translationY(-h).setDuration(PAGE_MS).setInterpolator(PAGE).start();
        library.animate().translationY(0).setDuration(PAGE_MS).setInterpolator(PAGE).start();
        library.entrance();
    }

    /** Up from the list's top row, Back, or the ⌂ button: the page scrolls back down to Home. */
    void closeLibrary(boolean animate) {
        if (!libraryShowing) return;
        libraryShowing = false;
        library.hidden();
        int h = stage.getHeight();
        library.setDescendantFocusability(android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        homePage.setDescendantFocusability(android.view.ViewGroup.FOCUS_AFTER_DESCENDANTS);
        View back = lastDockTile != null && lastDockTile.getParent() == dockRow ? lastDockTile : landingTile();
        if (back != null) back.requestFocus();
        library.animate().cancel();
        homePage.animate().cancel();
        if (animate) {
            homePage.animate().translationY(0).setDuration(PAGE_MS).setInterpolator(PAGE).start();
            library.animate().translationY(h).setDuration(PAGE_MS).setInterpolator(PAGE)
                    .withEndAction(() -> { if (!libraryShowing) library.setVisibility(View.INVISIBLE); }).start();
        } else {
            homePage.setTranslationY(0);
            library.setTranslationY(h);
            library.setVisibility(View.INVISIBLE);
        }
        shelfPeek.animate().alpha(PEEK_ALPHA).setStartDelay(animate ? PAGE_MS / 2 : 0).setDuration(240).start();
        allApps.animate().alpha(0.75f).setStartDelay(animate ? PAGE_MS / 2 : 0).setDuration(240).start();
        wake();
    }

    private static final long PAGE_MS = 420;

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && landOnFocus) {
            landOnFocus = false;
            View land = landingTile();
            if (land != null) land.requestFocus();
        }
    }

    @Override
    public void onBackPressed() {
        if (libraryShowing) { closeLibrary(true); return; }
        if (moving != null) stopMoving();
        // Otherwise: this is home; there is nothing to go back to.
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN) {
            // Just back and already browsing: hold the new photo until the keys go quiet for a moment.
            if (arrivalPending) {
                ui.removeCallbacks(rotate);
                ui.postDelayed(rotate, ARRIVAL_QUIET_MS);
            }
            boolean wasQuiet = idleStage == 2;
            wake();
            if (wasQuiet) return true;  // from the quiet screen, the first press only wakes it
        }
        // The app list (below Home) takes the keys while it's showing.
        if (libraryShowing) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && library.onKey(e.getKeyCode(), e)) return true;
            return super.dispatchKeyEvent(e);
        }
        if (moving == null) return super.dispatchKeyEvent(e);
        // Reorder mode: Left/Right move the wiggling tile, OK/Back/Down drop it.
        if (e.getAction() == KeyEvent.ACTION_DOWN) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_LEFT: shift(-1); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: shift(+1); return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_BACK:
                case KeyEvent.KEYCODE_DPAD_DOWN:
                case KeyEvent.KEYCODE_DPAD_UP: stopMoving(); return true;
                default: return true;
            }
        }
        return true;
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        View f = getCurrentFocus();
        if (keyCode == KeyEvent.KEYCODE_TV_INPUT) {
            pickInput();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MENU && f instanceof Tile) {
            Tile t = (Tile) f;
            edit(t, isDocked(t.entry.id));
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN && f instanceof Tile && f.getParent() == dockRow) {
            openLibrary();
            return true;
        }
        // Up from the dock: to whatever sits above it (For you on the left half, Wi-Fi on the right).
        boolean inDock = f instanceof Tile && f.getParent() == dockRow;
        boolean inTop = f instanceof Bubble || f == wifiChip;
        // Vertical path: dock -> For you -> Wi-Fi (top right), and back down the same way.
        if (keyCode == KeyEvent.KEYCODE_DPAD_UP && inDock && idleStage == 0) {
            lastDockTile = f;
            int[] at = new int[2];
            f.getLocationOnScreen(at);
            View target = nearestBubble(at[0] + f.getWidth() / 2f);
            (target != null ? target : wifiChip).requestFocus();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_UP && f instanceof Bubble) {
            wifiChip.requestFocus();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN && f == wifiChip && recentRow.getChildCount() > 0) {
            recentRow.getChildAt(0).requestFocus();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN && inTop) {
            View back = lastDockTile != null && lastDockTile.getParent() == dockRow ? lastDockTile : firstTile();
            if (back != null) back.requestFocus();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_UP && f == wifiChip) return true;  // top of the screen
        if ((keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) && f == wifiChip) return true;
        // Left/Right step through the dock; past either end it jumps to the other (layoutDock frames it).
        if ((keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || keyCode == KeyEvent.KEYCODE_DPAD_LEFT)
                && f instanceof Tile && f.getParent() == dockRow) {
            List<View> ring = dockTiles();
            int i = ring.indexOf(f), n = ring.size();
            if (n == 0 || i < 0) return true;
            boolean right = keyCode == KeyEvent.KEYCODE_DPAD_RIGHT;
            View next;
            // Holding the key stops at the ends; only a fresh press past an end jumps to the other.
            boolean held = event.getRepeatCount() > 0;
            if (right) next = i == n - 1 ? (held ? null : landingTile()) : ring.get(i + 1);  // past "More": back to the start
            else next = i == 0 ? (held ? null : ring.get(n - 1)) : ring.get(i - 1);       // Left from the first: straight to "More"
            if (next != null) next.requestFocus();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private View nearestBubble(float cx) {
        View best = null;
        float bestD = Float.MAX_VALUE;
        int[] at = new int[2];
        for (int i = 0; i < recentRow.getChildCount(); i++) {
            View b = recentRow.getChildAt(i);
            b.getLocationOnScreen(at);
            float d = Math.abs(at[0] + b.getWidth() / 2f - cx);
            if (d < bestD) { bestD = d; best = b; }
        }
        return best;
    }

    // --- dock ---

    private void reloadDock() {
        io.execute(() -> {
            Map<String, Apps.Entry> all = Apps.installed(this);
            List<String> dock = Apps.dock(this);
            List<Apps.Entry> items = new ArrayList<>();
            for (String id : dock) {
                Apps.Entry e = Apps.PS4.equals(id) ? Apps.ps4(this, all) : all.get(id);
                if (e != null) items.add(e);
            }
            List<Apps.Pick> recent = Apps.smartRecents(this, all, 3);
            // Icons for the shelf peek under the dock: apps that aren't in the dock, A-Z order of discovery.
            List<Apps.Entry> peekApps = new ArrayList<>();
            for (Apps.Entry e : all.values()) {
                if (peekApps.size() >= 14) break;
                if (e.id.contains(":") || dock.contains(e.id) || e.banner == null && e.icon == null) continue;
                peekApps.add(e);
            }
            // Recently installed now lives in the Library only (less work each time Home appears).
            List<Apps.Pick> fresh = java.util.Collections.emptyList();
            CharSequence port = Apps.ps4PortLabel(this);
            StringBuilder sig = new StringBuilder();
            for (Apps.Entry e : items) sig.append(e.id).append(e.intent).append(',');
            sig.append('|');
            for (Apps.Pick p : recent) sig.append(p.entry.id).append(p.why).append(',');
            sig.append('|');
            for (Apps.Pick p : fresh) sig.append(p.entry.id).append(p.why).append(',');
            String s = sig.toString();
            boolean weatherChanged = Weather.refresh(this);
            ui.post(() -> {
                if (weatherChanged) refreshChips();
                if (moving != null) return;  // don't rebuild the dock under a tile being moved
                if (s.equals(dockSignature)) return;
                dockSignature = s;
                pendingPeek = peekApps;
                render(items, recent, fresh, port);
            });
        });
    }

    private void render(List<Apps.Entry> items, List<Apps.Pick> recent, List<Apps.Pick> fresh, CharSequence ps4Port) {
        View f = getCurrentFocus();
        String focusedId = f instanceof Tile ? ((Tile) f).entry.id : null;
        dockRow.removeAllViews();
        for (Apps.Entry e : items) {
            addTile(e, true, Apps.PS4.equals(e.id) ? "PlayStation · " + ps4Port + "   ·   hold OK to move or remove"
                    : "Hold OK to move or remove");
        }
        // Apps only; everything else lives behind one "⋯" tile.
        addTile(Apps.more(), false, "Inputs, all apps, edit dock, boost, settings");
        buildShelfPeek(pendingPeek);
        // A small dot under apps you've used lately (the For you picks).
        java.util.Set<String> used = new java.util.HashSet<>();
        for (Apps.Pick p : recent) used.add(p.entry.id);
        for (int i = 0; i < dockRow.getChildCount(); i++) {
            View v = dockRow.getChildAt(i);
            if (v instanceof Tile) ((Tile) v).setRecent(used.contains(((Tile) v).entry.id));
        }

        recentRow.removeAllViews();
        boolean anyHabit = false;
        for (int i = 0; i < recent.size(); i++) {
            Apps.Pick p = recent.get(i);
            Apps.Entry e = p.entry;
            if (p.habit && !anyHabit) topHabit = e.label.toString();  // for the greeting
            anyHabit |= p.habit;
            Bubble card = new Bubble(this, e);  // round icon; the name shows below on focus
            card.setOnClickListener(v -> Apps.launch(this, e));
            card.setOnLongClickListener(v -> {
                recentOptions(e);
                return true;
            });
            card.setOnFocusChangeListener((v, has) -> {
                card.focus(has);
                if (has) {
                    showHero(e.label.toString(), p.why + "   ·   hold OK for options");
                    spotlight(true);
                } else {
                    spotlight(false);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(56), dp(56));
            if (i < recent.size() - 1) lp.rightMargin = dp(20);
            recentRow.addView(card, lp);
            // Staggered reveal: each icon fades up a beat after the one before.
            card.setAlpha(0f);
            card.setTranslationY(dp(6));
            card.animate().alpha(1f).translationY(0).setStartDelay(120 + i * 60L)
                    .setInterpolator(EASE).setDuration(320).start();
        }
        recentLabel.setText(anyHabit ? "For you, right now" : "Recent");
        recentEmpty.setVisibility(recent.isEmpty() ? View.VISIBLE : View.GONE);

        installedRow.removeAllViews();
        for (Apps.Pick p : fresh) {
            Apps.Entry e = p.entry;
            Tile card = new Tile(this, e, 104, 58, p.why);
            card.setOnClickListener(v -> Apps.launch(this, e));
            card.setOnLongClickListener(v -> {
                recentOptions(e);
                return true;
            });
            card.setOnFocused(t -> {
                showHero(e.label, p.why + "   ·   hold OK to add it to your dock");
                spotlight(true);
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.rightMargin = dp(12);
            installedRow.addView(card, lp);
        }
        installedBlock.setVisibility(fresh.isEmpty() ? View.GONE : View.VISIBLE);

        View target = null;
        for (int i = 0; i < dockRow.getChildCount(); i++) {
            View v = dockRow.getChildAt(i);
            if (v instanceof Tile && ((Tile) v).entry.id.equals(focusedId)) target = v;
        }
        if (target == null) target = landingTile();
        if (target != null) target.requestFocus();
        View focus = target;
        carousel.post(() -> {
            sizeDock();
            carousel.reveal(focus, false);
            layoutDock(focus instanceof Tile ? focus : getCurrentFocus(), false);
        });
    }

    private void addTile(Apps.Entry e, boolean inDock, String plainSubtitle) {
        CharSequence subtitle = Emph.key(plainSubtitle);  // worked out once, not on every D-pad move
        Tile t = new Tile(this, e, TILE_W, TILE_H, null, true);  // 16:9, with the dock extras
        t.setRingDelay(150);  // the ring settles onto the app as it slides into the focus spot
        t.setOnClickListener(v -> open(e));
        t.setOnLongClickListener(v -> {
            edit(t, inDock);
            return true;
        });
        t.setOnFocused(tile -> {
            if (moving == null) showHero(e.label, subtitle);
            spotlight(false);
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.setMargins(dp(7), 0, dp(7), 0);
        dockRow.addView(t, lp);
    }

    private void styleDock(View focused) {
        View f = focused instanceof Tile && focused.getParent() == dockRow ? focused : null;
        int fi = f == null ? -1 : dockRow.indexOfChild(f);
        for (int i = 0; i < dockRow.getChildCount(); i++) {
            View v = dockRow.getChildAt(i);
            if (!(v instanceof Tile)) continue;
            ((Tile) v).setDimmed(f != null && v != f);
        }
        if (f != null) layoutDock(f, true);
    }

    private List<View> dockTiles() {
        List<View> out = new ArrayList<>();
        for (int i = 0; i < dockRow.getChildCount(); i++) if (dockRow.getChildAt(i) instanceof Tile) out.add(dockRow.getChildAt(i));
        return out;
    }

    /**
     * The dock is one straight row that moves as a single piece (so cards can never drift apart,
     * however fast you scroll). The focused app always sits in the same spot, one app in from the
     * left: exactly one neighbour shows on the left and the rest of the row opens out to the right.
     * The row ends on "More"; one more Right jumps back to the start (see onKeyDown).
     */
    private void layoutDock(View focused, boolean animate) {
        List<View> ring = dockTiles();
        int n = ring.size();
        if (n == 0 || carousel.getWidth() == 0) return;
        int fi = Math.max(0, ring.indexOf(focused));
        View f = ring.get(fi);
        int slot = dp(TILE_W) + dp(DOCK_GAP);
        int focusX = dp(SAFE_X) + slot;
        int padL = carousel.getPaddingLeft(), width = carousel.getWidth(), edge = dp(SAFE_X);
        float target = padL + f.getLeft() - focusX;
        // At either end the row stops so the screen stays full (first app on the greeting's edge,
        // "More" on the clock's edge) and the focus moves out to it.
        float min = padL - edge;
        float max = Math.max(min, padL + dockRow.getWidth() - (width - edge));
        target = Math.max(min, Math.min(target, max));
        for (int k = 0; k < n; k++) {
            View v = ring.get(k);
            if (v.getTranslationX() != 0) {
                v.animate().cancel();
                v.setTranslationX(0);
            }
            // Hide only what would be cut off at the left edge: never leaves a hole in the row.
            float screenLeft = padL + v.getLeft() - target;
            float alpha = screenLeft < edge - dp(8) ? 0f : 1f;
            if (v.getAlpha() != alpha) {
                if (animate) v.animate().alpha(alpha).setDuration(180).start();
                else v.setAlpha(alpha);
            }
        }
        carousel.glide(target, animate);
    }


    /** Tiles rise into place one after another when Home appears. */
    private void playEntrance() {
        int n = 0;
        for (int i = 0; i < dockRow.getChildCount(); i++) {
            View v = dockRow.getChildAt(i);
            if (!(v instanceof Tile) || v.getAlpha() == 0f) continue;
            v.setTranslationY(dp(16));
            v.animate().translationY(0).setStartDelay(35L * n++).setInterpolator(EASE).setDuration(320).start();
        }
    }

    private void showHero(CharSequence title, CharSequence subtitle) {
        // Same app (e.g. focus came back to it): nothing to redo.
        if (TextUtils.equals(title, heroTitle.getText()) && heroTitle.getAlpha() == 1f) return;
        heroTitle.animate().cancel();
        heroSub.animate().cancel();
        heroTitle.setText(title);
        // Plain strings get their key words emphasised here; dock tiles pass text prepared once.
        heroSub.setText(subtitle == null ? "" : subtitle instanceof String ? Emph.key(subtitle) : subtitle);
        heroTitle.setAlpha(0f);
        heroTitle.setTranslationY(dp(8));
        // withLayer: shadowed text fades as one cached texture instead of re-blurring every frame.
        heroTitle.animate().alpha(1f).translationY(0).setDuration(180).withLayer().start();
        heroSub.setAlpha(0f);
        heroSub.animate().alpha(1f).setStartDelay(40).setDuration(180).withLayer().start();
    }

    /**
     * Where focus lands when Home opens: the app after the first (normally after PS4), so one OK
     * never switches inputs by accident, choosing the PS4 is a deliberate step left, and there's
     * an app on each side from the start, which reads as "this scrolls".
     */
    private View landingTile() {
        List<View> ring = dockTiles();
        if (ring.isEmpty()) return null;
        int i = ring.size() > 1 ? 1 : 0;
        // Never land on the PS4 tile, wherever it sits in the dock.
        if (Apps.PS4.equals(((Tile) ring.get(i)).entry.id) && ring.size() > 2) i = 2;
        return ring.get(i);
    }

    private View firstTile() {
        for (int i = 0; i < dockRow.getChildCount(); i++) {
            if (dockRow.getChildAt(i) instanceof Tile) return dockRow.getChildAt(i);
        }
        return null;
    }

    private View lastTile() {
        for (int i = dockRow.getChildCount() - 1; i >= 0; i--) {
            if (dockRow.getChildAt(i) instanceof Tile) return dockRow.getChildAt(i);
        }
        return null;
    }

    private boolean isDocked(String id) {
        return Apps.dock(this).contains(id);
    }

    private void open(Apps.Entry e) {
        switch (e.id) {
            case Apps.LIBRARY:
                openLibrary();
                break;
            case Apps.ADD:
                startActivity(new Intent(this, EditDockActivity.class));
                break;
            case Apps.INPUTS:
                pickInput();
                break;
            case Apps.MORE:
                moreMenu();
                break;
            case Apps.BOOST:
                Toast.makeText(this, "⚡  Boosting…", Toast.LENGTH_SHORT).show();
                io.execute(() -> {
                    long mb = Apps.boost(this);
                    ui.post(() -> Toast.makeText(this,
                            mb > 0 ? "⚡  Freed " + mb + " MB. Your TV has room to breathe." : "⚡  Already running lean.",
                            Toast.LENGTH_LONG).show());
                });
                break;
            default:
                Apps.launch(this, e);
        }
    }

    /** The "⋯" tile: system shortcuts in one small menu, keeping the dock for apps only. */
    private void moreMenu() {
        String[] items = {"⇄   Inputs (HDMI, PS4)", "▦   All apps", "✎   Edit dock", "⚡   Boost", "⚙   Settings"};
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setItems(items, (d, which) -> {
                    switch (which) {
                        case 0: open(Apps.inputs()); break;
                        case 1: open(Apps.library()); break;
                        case 2: open(Apps.addApp()); break;
                        case 3: open(Apps.boost()); break;
                        default: Apps.launch(this, Apps.settings()); break;
                    }
                })
                .show();
    }

    /**
     * The dock pill is only as wide as its apps (centred), up to the safe width; when the apps
     * don't fit, it uses the full width and the overflow folders appear at its ends.
     */
    private void sizeDock() {
        // An even grid: as many whole tiles as fit with one fixed gap, centred, so the spacing is
        // identical everywhere, including before each peek. When the apps scroll, a slice of the
        // next app shows at each end (the dock loops, so there is always a next one both ways).
        FrameLayout.LayoutParams clp = (FrameLayout.LayoutParams) carousel.getLayoutParams();
        if (clp.width != -1 || clp.leftMargin != 0 || clp.rightMargin != 0) {
            clp.width = -1;
            clp.leftMargin = clp.rightMargin = 0;
            carousel.setLayoutParams(clp);
        }
        int screen = getResources().getDisplayMetrics().widthPixels;
        int tileW = dp(TILE_W), gap = dp(DOCK_GAP), count = 0;
        for (int i = 0; i < dockRow.getChildCount(); i++) if (dockRow.getChildAt(i) instanceof Tile) count++;
        int room = screen - 2 * dp(SAFE_X + PEEK_MIN);            // leave at least a peek's worth each side
        int n = Math.max(1, (room + gap) / (tileW + gap));
        dockFits = count <= n;
        int shown = dockFits ? count : n;
        int content = shown * tileW + Math.max(0, shown - 1) * gap;
        int pad = Math.max(dp(SAFE_X), (screen - content) / 2);
        // Tile spacing: the gap between every pair, none before the first (so the row starts flush).
        boolean first = true;
        for (int i = 0; i < dockRow.getChildCount(); i++) {
            View v = dockRow.getChildAt(i);
            if (!(v instanceof Tile)) continue;
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) v.getLayoutParams();
            int l = first ? 0 : gap;
            first = false;
            if (lp.leftMargin != l || lp.rightMargin != 0) {
                lp.leftMargin = l;
                lp.rightMargin = 0;
                v.setLayoutParams(lp);
            }
        }
        // Row edges line up with the greeting and the clock; layoutDock scrolls it (no peeks needed:
        // partly visible apps at the edges already show there's more).
        dockFits = true;
        if (carousel.getPaddingLeft() != 0 || carousel.getPaddingRight() != 0) carousel.setPadding(0, dp(22), 0, dp(8));
    }
    private boolean dockFits;
    private static final int TILE_W = 128, TILE_H = 72, DOCK_GAP = 16, PEEK_MIN = 36;  // dp
    private PeekView peekLeft, peekRight;
    private View edgeFadeLView, edgeFadeRView;
    private GradientDrawable edgeFadeL, edgeFadeR;
    private LinearLayout shelfPeek, allApps;

    /** A small down chevron, drawn in code. */
    private android.graphics.drawable.Drawable chevron() {
        android.graphics.Paint p = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.WHITE);
        p.setStyle(android.graphics.Paint.Style.STROKE);
        p.setStrokeCap(android.graphics.Paint.Cap.ROUND);
        p.setStrokeJoin(android.graphics.Paint.Join.ROUND);
        p.setStrokeWidth(dp(1.8f));
        return new android.graphics.drawable.Drawable() {
            @Override public void draw(android.graphics.Canvas cv) {
                android.graphics.Rect b = getBounds();
                float s = p.getStrokeWidth();
                android.graphics.Path path = new android.graphics.Path();
                path.moveTo(b.left + s, b.top + s);
                path.lineTo(b.exactCenterX(), b.bottom - s);
                path.lineTo(b.right - s, b.top + s);
                cv.drawPath(path, p);
            }
            @Override public void setAlpha(int a) {}
            @Override public void setColorFilter(android.graphics.ColorFilter cf) {}
            @Override public int getOpacity() { return android.graphics.PixelFormat.TRANSLUCENT; }
        };
    }

    /** A soft double nudge downward: "there's more this way". Once per visit. */
    private void nudgeAllApps() {
        allApps.animate().cancel();
        allApps.setTranslationY(0);
        ObjectAnimator bob = ObjectAnimator.ofFloat(allApps, View.TRANSLATION_Y, 0, dp(4), 0, dp(3), 0);
        bob.setStartDelay(900);
        bob.setDuration(1100);
        bob.setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator());
        bob.start();
    }              // little icons peeking up from the bottom edge: "more apps below"
    private List<Apps.Entry> pendingPeek = java.util.Collections.emptyList();
    private String shelfPeekSig = "";
    private static final float PEEK_ALPHA = 0.55f;

    private void buildShelfPeek(List<Apps.Entry> apps) {
        StringBuilder sig = new StringBuilder();
        for (Apps.Entry e : apps) sig.append(e.id).append(',');
        if (sig.toString().equals(shelfPeekSig)) return;  // same apps: keep the views
        shelfPeekSig = sig.toString();
        shelfPeek.removeAllViews();
        // Mini versions of the Library's cards (same 16:9 shape and rounded corners, scaled down),
        // so the peek previews exactly what Down opens.
        for (Apps.Entry e : apps) {
            ImageView iv = new ImageView(this);
            boolean banner = e.banner != null;
            // Drawn once into a bitmap the card's exact size: the GPU then holds a ~13 KB texture
            // instead of the app's full banner (~230 KB), and it stays crisp at this size.
            int bw = dp(56), bh = dp(32);
            Bitmap mini = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas cv = new android.graphics.Canvas(mini);
            android.graphics.drawable.Drawable d = Bubble.own(banner ? e.banner : e.icon);
            if (d != null) {
                if (banner) {
                    // centre-crop into the card
                    float sw = Math.max(1, d.getIntrinsicWidth()), sh = Math.max(1, d.getIntrinsicHeight());
                    float s = Math.max(bw / sw, bh / sh);
                    int dw = Math.round(sw * s), dh = Math.round(sh * s);
                    d.setBounds((bw - dw) / 2, (bh - dh) / 2, (bw + dw) / 2, (bh + dh) / 2);
                } else {
                    int side = bh - dp(8);
                    d.setBounds((bw - side) / 2, dp(4), (bw + side) / 2, dp(4) + side);
                }
                d.draw(cv);
            }
            iv.setImageBitmap(mini);
            iv.setScaleType(ImageView.ScaleType.FIT_XY);
            GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                    e.colors != null ? e.colors : new int[]{0xFF2B303B, 0xFF1C2028});
            bg.setCornerRadius(dp(6));
            iv.setBackground(bg);
            iv.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
            iv.setClipToOutline(true);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(56), dp(32));
            lp.setMargins(dp(6), 0, dp(6), 0);
            shelfPeek.addView(iv, lp);
        }
    }
    private String peekLeftId, peekRightId;

    /** A neighbour app glimpsed at the dock's edge: blurred, dimmed, fading out. Drawn straight, no layer. */
    static final class PeekView extends ImageView {
        PeekView(Context c) { super(c); }
        @Override public boolean hasOverlappingRendering() { return false; }
    }

    private PeekView peek(boolean leftSide) {
        PeekView g = new PeekView(this);
        g.setScaleType(ImageView.ScaleType.FIT_XY);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(14));
        bg.setColor(0xFF2B303B);
        g.setBackground(bg);
        g.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        g.setClipToOutline(true);
        // Fades toward the screen edge, so it reads as "more this way", not a cut-off card.
        g.setForeground(new GradientDrawable(leftSide ? GradientDrawable.Orientation.LEFT_RIGHT : GradientDrawable.Orientation.RIGHT_LEFT,
                new int[]{0xCC000000, 0x80000000, 0x59000000}));
        g.setAlpha(0.9f);
        g.setVisibility(View.GONE);
        return g;
    }

    /** Next app on the right, previous on the left, in loop order (so the left peek shows the last app at the start). */
    private void updatePeeks(List<Tile> left, List<Tile> right) {
        if (peekLeft == null) return;
        if (dockFits || dockRow.getChildCount() == 0) {
            peekLeft.setVisibility(View.GONE);
            peekRight.setVisibility(View.GONE);
            return;
        }
        View lt = !left.isEmpty() ? left.get(0) : lastTile();
        View rt = !right.isEmpty() ? right.get(0) : firstTile();
        float y = carousel.getTop() + carousel.getPaddingTop();
        int w = getResources().getDisplayMetrics().widthPixels;
        // Exactly one gap outside the window, like the gaps between tiles.
        peekLeftId = setPeek(peekLeft, (Tile) lt, peekLeftId, carousel.getPaddingLeft() - dp(DOCK_GAP) - dp(TILE_W), y);
        peekRightId = setPeek(peekRight, (Tile) rt, peekRightId, w - carousel.getPaddingRight() + dp(DOCK_GAP), y);
    }

    /** A centred symbol as a drawable, for tiles that have no artwork. */
    private android.graphics.drawable.Drawable glyphDrawable(String glyph) {
        android.graphics.Paint p = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.WHITE);
        p.setTextSize(dp(30));
        p.setTextAlign(android.graphics.Paint.Align.CENTER);
        return new android.graphics.drawable.Drawable() {
            @Override public void draw(android.graphics.Canvas cv) {
                android.graphics.Rect b = getBounds();
                cv.drawText(glyph, b.exactCenterX(), b.exactCenterY() - (p.descent() + p.ascent()) / 2, p);
            }
            @Override public void setAlpha(int a) {}
            @Override public void setColorFilter(android.graphics.ColorFilter cf) {}
            @Override public int getOpacity() { return android.graphics.PixelFormat.TRANSLUCENT; }
            @Override public int getIntrinsicWidth() { return dp(TILE_W); }
            @Override public int getIntrinsicHeight() { return dp(TILE_H); }
        };
    }

    private String setPeek(PeekView g, Tile t, String shownId, float x, float y) {
        if (t == null) { g.setVisibility(View.GONE); return null; }
        if (g.getX() != x) g.setX(x);
        if (g.getY() != y) g.setY(y);
        if (g.getVisibility() != View.VISIBLE) g.setVisibility(View.VISIBLE);
        if (t.entry.id.equals(shownId)) return shownId;  // same neighbour: nothing to redraw
        // Crisp, not blurred: the app's own banner, dimmed and fading toward the screen edge.
        int[] cols = t.entry.colors;
        ((GradientDrawable) g.getBackground()).setColor(cols != null && cols.length > 0 ? cols[0] : 0xFF2B303B);
        android.graphics.drawable.Drawable d = Bubble.own(t.entry.banner != null ? t.entry.banner : t.entry.icon);
        g.setScaleType(t.entry.banner != null ? ImageView.ScaleType.CENTER_CROP : ImageView.ScaleType.CENTER_INSIDE);
        if (d == null && t.entry.glyph != null) d = glyphDrawable(t.entry.glyph);  // e.g. the "⋯" tile
        g.setImageDrawable(d);
        return t.entry.id;
    }

    /**
     * Balances the two top columns and places section two:
     *   1. greeting cap-top = clock cap-top (same top line),
     *   2. Wi-Fi chip bottom = weather line bottom (same bottom line),
     *   3. hairline under both, then For you, centred.
     * Margins only change when something is off by more than a pixel, so it settles in one pass.
     */
    private void alignColumns(View left, TextView time) {
        View status = statusView;
        if (status == null || left.getHeight() == 0 || status.getHeight() == 0) return;
        int clockCap = status.getTop() + time.getTop() + capTop(time);
        int greetCap = left.getTop() + greeting.getTop() + capTop(greeting);
        int d1 = clockCap - greetCap;
        int rightBottom = status.getTop() + weatherRow.getBottom();
        int leftBottom = left.getTop() + d1 + wifiChip.getBottom();
        android.view.ViewGroup.MarginLayoutParams cl = (android.view.ViewGroup.MarginLayoutParams) wifiChip.getLayoutParams();
        int chipMargin = Math.max(dp(14), cl.topMargin + (rightBottom - leftBottom));  // never crowds the note
        int d2 = chipMargin - cl.topMargin;
        int line = Math.max(rightBottom, leftBottom + d2) + dp(24);
        FrameLayout.LayoutParams dl = (FrameLayout.LayoutParams) divider.getLayoutParams();
        if (Math.abs(dl.topMargin - line) > 1) {
            dl.topMargin = line;
            divider.setLayoutParams(dl);
        }
        int d3 = (line + dp(18)) - forYouBlock.getTop();
        boolean changed = nudge(left, d1) | nudge(wifiChip, d2) | nudge(forYouBlock, d3);
        if (changed) left.requestLayout();
        // Letters carry a little empty space after the last glyph; slide each line right by exactly
        // that much so the ink, not the box, sits on the dock's edge.
        time.setTranslationX(trailingSpace(time));
        dateView.setTranslationX(trailingSpace((TextView) dateView));
        weatherRow.setTranslationX(trailingSpace(aqiPill.getVisibility() == View.VISIBLE ? aqiPill : wCondition));
    }

    /**
     * "Good evening, Sam": the name is the star (full size, bold); the changing phrase
     * around it is smaller and light, so it reads as a lead-in to the name.
     */
    private static CharSequence boldName(String headline, String name) {
        int at = name == null || name.isEmpty() ? -1 : headline.indexOf(name);
        if (at < 0) return headline;
        android.text.SpannableString s = new android.text.SpannableString(headline);
        int end = at + name.length(), flags = android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE;
        s.setSpan(new android.text.style.StyleSpan(Typeface.BOLD), at, end, flags);
        if (at > 0) s.setSpan(new android.text.style.RelativeSizeSpan(0.74f), 0, at, flags);
        if (end < headline.length()) s.setSpan(new android.text.style.RelativeSizeSpan(0.74f), end, headline.length(), flags);
        return s;
    }

    private static float trailingSpace(TextView tv) {
        CharSequence s = tv.getText();
        if (s == null || s.length() == 0) return 0;
        String str = s.toString();
        android.graphics.Rect r = new android.graphics.Rect();
        tv.getPaint().getTextBounds(str, 0, str.length(), r);
        return Math.max(0f, tv.getPaint().measureText(str) - r.right);
    }

    /** Distance from a TextView's top to the top of its capital letters. */
    private static int capTop(TextView tv) {
        android.graphics.Rect r = new android.graphics.Rect();
        tv.getPaint().getTextBounds("H", 0, 1, r);
        return tv.getPaddingTop() + tv.getBaseline() + r.top;
    }

    private static boolean nudge(View v, int delta) {
        if (Math.abs(delta) <= 1) return false;
        android.view.ViewGroup.MarginLayoutParams lp = (android.view.ViewGroup.MarginLayoutParams) v.getLayoutParams();
        lp.topMargin += delta;
        v.setLayoutParams(lp);
        return true;
    }

    /**
     * The shelf: clear at the top, deepening to the photo's own colour (darkened) at the bottom
     * edge. A touch deeper at night.
     */
    private int[] shelfColors(int base) {
        boolean night = nightDim() > 0;
        return new int[]{0x00000000 | base, (night ? 0x99000000 : 0x80000000) | base, (night ? 0xF0000000 : 0xE0000000) | base};
    }

    /** Tint the dock glass with the photo's own colour (computed once per photo from its tiny copy). */
    private void setDockTint(Bitmap frost) {
        if (frost == null || dockTint == null) return;
        sFrost = frost;  // the Library reuses this tiny copy as its own frosted glass
        long r = 0, g = 0, b = 0;
        int n = 0;
        for (int y = 0; y < frost.getHeight(); y += 3) {
            for (int x = 0; x < frost.getWidth(); x += 3) {
                int c = frost.getPixel(x, y);
                r += Color.red(c); g += Color.green(c); b += Color.blue(c); n++;
            }
        }
        if (n == 0) return;
        float[] hsv = new float[3];
        Color.colorToHSV(Color.rgb((int) (r / n), (int) (g / n), (int) (b / n)), hsv);
        hsv[1] = Math.min(1f, hsv[1] * 1.4f + 0.1f);  // a little richer
        hsv[2] = 0.22f;                             // but dark enough for white icons and text
        int base = Color.HSVToColor(hsv) & 0x00FFFFFF;
        dockColors = new int[]{0xB3000000 | base, 0x99000000 | base};
        sGlassBase = base;
        dockTint.setColors(shelfColors(base));
        if (edgeFadeL != null) {
            int edge = 0xB3000000 | base;
            edgeFadeL.setColors(new int[]{edge, 0x00000000 | base});
            edgeFadeR.setColors(new int[]{edge, 0x00000000 | base});
        }
        if (wifiBg != null && !wifiChip.hasFocus()) wifiBg.setColors(dockColors);
    }

    // --- idle: after 10 s the extras dim; after 30 s only the clock and the photo remain ---

    private void wake() {
        ui.removeCallbacks(dimIdle);
        ui.removeCallbacks(quietIdle);
        ui.postDelayed(dimIdle, DIM_MS);
        ui.postDelayed(quietIdle, QUIET_MS);
        if (idleStage != 0) setIdle(0);
    }

    private void setIdle(int stage) {
        if (libraryShowing && stage != 0) return;  // never dim Home's page while you're in the list
        idleStage = stage;
        float extras = stage == 0 ? 1f : stage == 1 ? 0.45f : 0f;
        float main = stage == 2 ? 0f : 1f;
        for (View v : forYouViews) v.animate().alpha(stage == 0 ? (v == greetingNote ? 0.8f : v == recentLabel ? 0.85f : 1f) : extras * (v == recentRow ? 1f : 0.7f)).setDuration(600).withLayer().start();
        // The clock stays; everything around it dims, then goes.
        for (View v : new View[]{dateView, weatherRow, wifiChip}) {
            v.animate().alpha(stage == 2 ? 0f : stage == 1 ? 0.6f : 1f).setDuration(600).withLayer().start();
        }
        heroView.animate().alpha(stage == 0 ? 1f : 0f).setDuration(400).withLayer().start();
        // (layers: each fades as one cached texture instead of a fresh offscreen pass every frame)
        for (View v : new View[]{glass, carousel, edgeFadeLView, edgeFadeRView}) v.animate().alpha(main).setDuration(600).withLayer().start();

        shelfPeek.animate().alpha(stage == 0 ? PEEK_ALPHA : 0f).setDuration(600).withLayer().start();
        allApps.animate().alpha(stage == 0 ? 0.75f : 0f).setDuration(600).start();
        moreLeft.setDim(main);
        moreRight.setDim(main);
        greeting.animate().alpha(stage == 2 ? 0f : 1f).setDuration(600).withLayer().start();
    }

    /** After 10 pm the scene sits a little darker. */
    private float nightDim() {
        int h = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
        return h >= 22 || h < 6 ? 0.18f : 0f;
    }

    private void pickInput() {
        pickInput(this);
    }

    /** The remote's Input button, and Inputs in the ⋯ menu: pick an HDMI port. */
    static void pickInput(Activity a) {
        List<Apps.Entry> inputs = Apps.hdmiInputs(a);
        String[] labels = new String[inputs.size()];
        for (int i = 0; i < labels.length; i++) labels[i] = inputs.get(i).label.toString();
        new AlertDialog.Builder(a, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Switch input")
                .setItems(labels, (d, which) -> Apps.launch(a, inputs.get(which)))
                .show();
    }

    /** Hold OK (or press Menu) on a tile: move it, remove it, add it, or pick the PS4's HDMI port. */
    private void edit(Tile t, boolean inDock) {
        Apps.Entry e = t.entry;
        if (e.id.startsWith("sys:")) return;
        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();
        if (inDock) {
            labels.add("Move  (◀ ▶ then OK)");
            actions.add(() -> startMoving(t));
            if (Apps.PS4.equals(e.id)) {
                for (Apps.Entry in : Apps.hdmiInputs(this)) {
                    labels.add("PS4 is plugged into " + in.label);
                    actions.add(() -> {
                        Apps.setPs4Input(this, in.id);
                        reloadAfterEdit();
                    });
                }
            }
            labels.add("Edit whole dock…");
            actions.add(() -> startActivity(new Intent(this, EditDockActivity.class)));
            labels.add("Remove from dock");
        } else {
            labels.add("Add to dock");
        }
        actions.add(() -> {
            Apps.toggleDock(this, e.id);
            reloadAfterEdit();
        });
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(e.label)
                .setItems(labels.toArray(new String[0]), (d, which) -> actions.get(which).run())
                .show();
    }

    private void recentOptions(Apps.Entry e) {
        boolean docked = isDocked(e.id);
        String[] labels = {docked ? "Already in your dock" : "Add to dock", "Remove from Recent"};
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(e.label)
                .setItems(labels, (d, which) -> {
                    if (which == 0 && !docked) Apps.toggleDock(this, e.id);
                    if (which == 1) Apps.hideRecent(this, e.id);
                    reloadAfterEdit();
                })
                .show();
    }

    private void reloadAfterEdit() {
        dockSignature = "";
        reloadDock();
    }

    // --- reorder mode ---

    private void startMoving(Tile t) {
        moving = t;
        t.requestFocus();
        t.setWiggling(true);
        showHero(t.entry.label, "Moving  ·  ◀ ▶ to move, OK to place");
    }

    private void shift(int dir) {
        Tile t = moving;
        int i = dockRow.indexOfChild(t), j = i + dir;
        if (j < 0 || j >= dockRow.getChildCount() || !(dockRow.getChildAt(j) instanceof Tile)) return;
        Tile other = (Tile) dockRow.getChildAt(j);
        if (!isDocked(other.entry.id)) return;  // dock apps only move among dock apps
        Apps.move(this, t.entry.id, dir);
        dockRow.removeViewAt(i);
        dockRow.addView(t, j);
        t.requestFocus();
        t.post(() -> layoutDock(t, true));
    }

    private void stopMoving() {
        if (moving == null) return;
        Tile t = moving;
        moving = null;
        t.setWiggling(false);
        showHero(t.entry.label, "Placed");
        dockSignature = "";  // next reload rebuilds from the saved order
    }

    private void spotlight(boolean on) {
        float a = on ? 0.35f : 0f;  // (night dim is a filter on the photo now, not this full-screen layer)
        if (spotlight.getAlpha() != a) spotlight.animate().alpha(a).setDuration(260).start();
        applyNightDim();
    }

    /** A round "P" badge (first letter of the name) with the name under it. */
    private View avatar() {
        String name = Apps.prefs(this).getString("name", "Sam");
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView badge = new TextView(this);
        badge.setText(name.isEmpty() ? "☺" : name.substring(0, 1).toUpperCase());
        badge.setTextColor(Color.WHITE);
        badge.setTextSize(20);
        badge.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        badge.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xFF7B5CFF, 0xFFFF7AA8});
        bg.setShape(GradientDrawable.OVAL);
        bg.setStroke(dp(2), 0x66FFFFFF);
        badge.setBackground(bg);
        box.addView(badge, new LinearLayout.LayoutParams(dp(44), dp(44)));
        TextView label = new TextView(this);
        style(label, 10, "sans-serif-medium", 0.8f);
        label.setText(name);
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(-2, -2);
        llp.topMargin = dp(4);
        box.addView(label, llp);
        return box;
    }

    // --- weather + network, in the clock panel ---

    private final Runnable netRefresh = this::refreshChips;

    /** Called on a system thread: hop to the UI, and settle bursts of changes into one refresh. */
    private final android.net.ConnectivityManager.NetworkCallback netWatch = new android.net.ConnectivityManager.NetworkCallback() {
        private void changed() {
            ui.removeCallbacks(netRefresh);
            ui.postDelayed(netRefresh, 600);
            ui.postDelayed(netRefresh, 3500);  // the network name can arrive a moment after the link
        }
        @Override public void onAvailable(android.net.Network n) { changed(); }
        @Override public void onLost(android.net.Network n) { changed(); }
        @Override public void onCapabilitiesChanged(android.net.Network n, android.net.NetworkCapabilities nc) { changed(); }
    };

    private void refreshChips() {
        Weather.Now w = Weather.cached(this);
        int vis = w == null ? View.GONE : View.VISIBLE;
        weatherBox.setVisibility(vis);
        wSymbol.setVisibility(vis);
        wTemp.setVisibility(vis);
        wCondition.setVisibility(vis);
        ((View) wRange.getParent()).setVisibility(vis);
        if (w != null) {
            wSymbol.setText(w.symbol);
            wTemp.setText(w.temp + "°");
            wCondition.setText(w.city.isEmpty() ? w.condition : w.condition + " · " + w.city);
            wRange.setText("H " + w.high + "°  L " + w.low + "°");
            wDetails.setText("H " + w.high + "°  L " + w.low + "°  ·  Feels " + w.feels + "°  ·  " + w.humidity + "%");
            aqiPill.setVisibility(w.aqi < 0 ? View.GONE : View.VISIBLE);
            if (w.aqi >= 0) {
                android.text.SpannableString s = new android.text.SpannableString(
                        "● AQI " + w.aqi);
                s.setSpan(new android.text.style.ForegroundColorSpan(Weather.aqiColor(w.aqi)), 0, 1, 0);
                aqiPill.setText(s);
                aqiBg.setColor((Weather.aqiColor(w.aqi) & 0x00FFFFFF) | 0x33000000);  // faint tint of the band colour
            }
        }
        // Network status asks the system over binder (several calls): do it off the main thread,
        // then show the result.
        io.execute(() -> {
            String net;
            try {
                net = Weather.wifi(this);
            } catch (RuntimeException e) {
                net = null;  // a status line must never take the home screen down
            }
            int bars = Weather.wifiBars(this);
            boolean offline = net == null || net.startsWith("Offline");
            String name = offline ? "No network" : net.startsWith("Ethernet") ? "Ethernet" : Weather.wifiName(this);
            ui.post(() -> {
                netLine.setVisibility(View.GONE);  // status lives in the Wi-Fi chip
                wifiBars.setLevel4(bars);
                wifiDotBg.setColor(offline ? 0xFFFF453A : 0xFF34C759);
                // Name on top (always shown, so it's clear what "Change" changes), status underneath.
                wifiText.setText(name == null ? "Wi-Fi" : name);
                wifiSub.setText(offline ? "Not connected" : "Connected");
            });
        });
    }

    /** The soft glass behind the two top panels: big rounded corners, no hard outline. */
    private GradientDrawable softPanel() {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0x8C000000, 0x73000000});
        g.setCornerRadius(dp(28));
        return g;
    }

    /** A horizontal row whose children share one text baseline. */
    private LinearLayout row() {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setBaselineAligned(true);
        return r;
    }

    /** Small caps label: 11sp medium, letter-spaced, dimmed. */
    private void label(TextView t) {
        style(t, 11, "sans-serif-medium", 0.65f);
        t.setAllCaps(true);
        t.setLetterSpacing(0.12f);
        t.setSingleLine();
    }

    // --- wallpaper ---

    private ImageView layer(ImageView.ScaleType type) {
        ImageView v = new ImageView(this);
        v.setScaleType(type);
        return v;
    }

    /** Sizes the glass images to the full screen and shifts them so they line up with the wallpaper. */
    /**
     * Next scene: the bundled nature photos in a shuffled order. A painted scene is used
     * only as a fallback if a photo can't be read.
     */
    private void nextWallpaper() {
        int idx = scene++;
        long seed = System.nanoTime();
        io.execute(() -> {
            if (photoOrder == null) {
                photoOrder = new ArrayList<>(java.util.Arrays.asList(Wallpapers.photos(this)));
                java.util.Collections.shuffle(photoOrder);
            }
            Bitmap sharp = null;
            if (!photoOrder.isEmpty()) {
                sharp = Wallpapers.photo(this, photoOrder.get(photoIndex++ % photoOrder.size()));
            }
            if (sharp == null) sharp = Wallpapers.render(idx, WALL_W, WALL_H, seed);
            Bitmap frost = Wallpapers.frosted(sharp);
            // Upload to the GPU here in the background, not in the first frame that shows it.
            sharp.prepareToDraw();
            frost.prepareToDraw();
            Bitmap shown = sharp;
            ui.post(() -> {
                if (isFinishing() || isDestroyed()) return;
                show(shown, frost);
                setDockTint(frost);
            });
        });
    }

    /** Cross-fade: the top layer fades in over the bottom one, or out to reveal it. */
    /**
     * After 10 pm the photo sits a little darker. Done as a colour filter on the photo itself, not
     * a translucent full-screen layer blended over everything on every frame.
     */
    private void applyNightDim() {
        float d = nightDim();
        android.graphics.ColorFilter cf = d <= 0 ? null
                : new android.graphics.PorterDuffColorFilter(Color.argb(Math.round(d * 255), 0, 0, 0), android.graphics.PorterDuff.Mode.SRC_ATOP);
        if (bgTop.getColorFilter() == null && cf == null) return;
        bgTop.setColorFilter(cf);
        bgBottom.setColorFilter(cf);
    }

    private void show(Bitmap sharp, Bitmap frost) {
        getWindow().setBackgroundDrawable(null);  // the photo covers the screen: skip a full-screen fill per frame
        photoAt = android.os.SystemClock.uptimeMillis();
        released = false;
        if (!topShowing) {
            topFrost = frost;
            bgTop.setImageBitmap(sharp);
            glassTop.setImageBitmap(frost);
            settle(bgTop);
            fade(1f, () -> {
                bgBottom.setImageDrawable(null);
                glassBottom.setImageDrawable(null);
                bottomFrost = null;
            });
        } else {
            bottomFrost = frost;
            bgBottom.setImageBitmap(sharp);
            glassBottom.setImageBitmap(frost);
            settle(bgBottom);
            fade(0f, () -> {
                bgTop.setImageDrawable(null);
                glassTop.setImageDrawable(null);
                topFrost = null;
            });
        }
        topShowing = !topShowing;
    }

    private void fade(float topAlpha, Runnable done) {
        bgTop.animate().alpha(topAlpha).setDuration(1600).withEndAction(done).start();
        glassTop.animate().alpha(topAlpha).setDuration(1600).start();
    }

    /**
     * A short settle-in when a new scene arrives (1.04x down to 1x while it fades in).
     * A continuous drift redrew the whole screen 60 times a second, which this TV's
     * GPU can't sustain while you move through the dock.
     */
    private void settle(View v) {
        if (drift != null) drift.cancel();
        if (idleStage == 2 || calmArrival) {  // nobody's looking / just arrived: cross-fade only, no zoom
            calmArrival = false;
            v.setScaleX(1f);
            v.setScaleY(1f);
            return;
        }
        drift = ObjectAnimator.ofPropertyValuesHolder(v,
                PropertyValuesHolder.ofFloat(View.SCALE_X, 1.04f, 1f),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, 1.04f, 1f));
        drift.setInterpolator(EASE);
        drift.setDuration(2400);
        drift.start();
    }

    /** Swap the sharp wallpaper for its blurred thumbnail so the RAM goes to the app in front. */
    private void releaseWallpaper() {
        released = true;
        if (drift != null) drift.cancel();
        bgTop.animate().cancel();
        glassTop.animate().cancel();
        ImageView visible = topShowing ? bgTop : bgBottom;
        Bitmap frost = topShowing ? topFrost : bottomFrost;
        if (frost != null) visible.setImageBitmap(frost);
        if (topShowing) {
            bgTop.setAlpha(1f);
            glassTop.setAlpha(1f);
            bgBottom.setImageDrawable(null);
            glassBottom.setImageDrawable(null);
            bottomFrost = null;
        } else {
            bgTop.setAlpha(0f);
            glassTop.setAlpha(0f);
            bgTop.setImageDrawable(null);
            glassTop.setImageDrawable(null);
            topFrost = null;
        }
    }

    // --- helpers ---

    private void style(TextView t, int sp, String family, float alpha) {
        t.setTextColor(Color.WHITE);
        t.setTextSize(sp);
        t.setTypeface(Typeface.create(family, Typeface.NORMAL));
        t.setAlpha(alpha);
        // Tight, dense shadow: gives letters an edge on bright skies, still soft on dark ones.
        t.setShadowLayer(6, 0, 1, 0xE6000000);
    }

    private int dp(float v) {
        return Tile.dp(this, v);
    }

    /** A round app icon for the Recent row: lifts and gets a ring when focused. */
    static final class Bubble extends FrameLayout {
        private final GradientDrawable ring;

        Bubble(Context c, Apps.Entry e) {
            super(c);
            setFocusable(true);
            setDefaultFocusHighlightEnabled(false);
            GradientDrawable bg = new GradientDrawable();
            bg.setShape(GradientDrawable.OVAL);
            bg.setColor(0x59FFFFFF);
            setBackground(bg);
            setOutlineProvider(ViewOutlineProvider.BACKGROUND);
            setClipToOutline(true);
            ImageView iv = new ImageView(c);
            iv.setImageDrawable(own(e.icon));  // own copy: one Drawable shared by several views fights over bounds
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            addView(iv, new LayoutParams(-1, -1));
            ring = new GradientDrawable();
            ring.setShape(GradientDrawable.OVAL);
            ring.setStroke(Tile.dp(c, 2), Color.WHITE);
            ring.setColor(0);
            ring.setAlpha(0);
            setForeground(ring);
        }

        @Override
        public boolean hasOverlappingRendering() {
            return false;
        }

        static android.graphics.drawable.Drawable own(android.graphics.drawable.Drawable d) {
            if (d == null || d.getConstantState() == null) return d;
            return d.getConstantState().newDrawable().mutate();
        }

        void focus(boolean has) {
            animate().scaleX(has ? 1.15f : 1f).scaleY(has ? 1.15f : 1f)
                    .translationY(has ? -Tile.dp(getContext(), 3) : 0).setDuration(160).start();  // no shadow: cheap on the GPU
            ring.setAlpha(has ? 255 : 0);
            invalidate();
        }
    }
}
