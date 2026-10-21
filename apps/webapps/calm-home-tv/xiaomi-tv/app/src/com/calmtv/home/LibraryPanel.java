package com.calmtv.home;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Every app, grouped A-Z, with a letter rail on the left: the page *below* Home, in Home's own
 * window. Down on the dock scrolls the whole screen up to it; Up from its top row (or Back)
 * scrolls back. Being part of the same screen is what makes the move one continuous motion, and
 * it skips creating a new window (the costliest part of the old separate Library screen).
 *
 * Moving along the rail glides the grid to that letter; Right jumps into its apps; Left from the
 * first column jumps back to the rail. Hold OK (or Menu) on an app to add/remove it from the dock.
 * Sections are built on demand, and everything is freed when Home goes to the background.
 */
final class LibraryPanel extends FrameLayout {
    interface Host {
        void closeLibrary(boolean animate);
        HomeActivity activity();
    }

    private static final int COLUMNS = 5;
    private static final DecelerateInterpolator EASE = new DecelerateInterpolator(1.5f);
    private static final ExecutorService io = Executors.newSingleThreadExecutor();

    private final Host host;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final List<Tile> tiles = new ArrayList<>();
    /** Section key ("★", "A", "B", ... "⇄", "⚙") to its header view and first tile. */
    private final Map<String, View> headers = new LinkedHashMap<>();
    private final Map<String, Tile> firstTiles = new LinkedHashMap<>();
    private final Map<String, TextView> railLetters = new LinkedHashMap<>();
    private final Map<Tile, String> sectionOf = new java.util.HashMap<>();
    private ScrollView scroll;  // (not final: the Top button's listener, set earlier, refers to it)
    private final LinearLayout list, rail;
    private final TextView topButton;
    private LinearLayout firstRow;
    private String activeLetter;
    private List<Runnable> sectionWork = new ArrayList<>();
    private List<String> sectionKeys = new ArrayList<>();
    private int built;
    private int generation;      // bumps on release: stale background loads are ignored
    private boolean loaded, loading;

    LibraryPanel(Host host) {
        super(host.activity());
        this.host = host;
        Context c = getContext();
        LinearLayout content = new LinearLayout(c);
        content.setOrientation(LinearLayout.HORIZONTAL);
        content.setPadding(dp(48), dp(26), dp(48), 0);  // same side margins as Home
        content.setClipChildren(false);

        // Side column: Home button, letter rail, and a Top button that appears once you've scrolled.
        LinearLayout side = new LinearLayout(c);
        side.setOrientation(LinearLayout.VERTICAL);
        side.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView home = sideButton("⌂", "Home");
        home.setOnClickListener(v -> host.closeLibrary(true));
        LinearLayout.LayoutParams homeLp = new LinearLayout.LayoutParams(dp(40), dp(40));
        homeLp.topMargin = dp(10);
        side.addView(home, homeLp);
        ScrollView railScroll = new ScrollView(c);
        railScroll.setVerticalScrollBarEnabled(false);
        rail = new LinearLayout(c);
        rail.setOrientation(LinearLayout.VERTICAL);
        rail.setGravity(Gravity.CENTER_HORIZONTAL);
        rail.setPadding(0, dp(16), 0, dp(8));
        railScroll.addView(rail);
        side.addView(railScroll, new LinearLayout.LayoutParams(dp(44), 0, 1f));
        topButton = sideButton("▲", "Top");
        topButton.setOnClickListener(v -> {
            scroll.smoothScrollTo(0, 0);
            if (!tiles.isEmpty()) tiles.get(0).requestFocus();
        });
        topButton.setVisibility(View.GONE);
        LinearLayout.LayoutParams topLp = new LinearLayout.LayoutParams(dp(40), dp(40));
        topLp.bottomMargin = dp(22);
        side.addView(topButton, topLp);
        content.addView(side, new LinearLayout.LayoutParams(dp(48), -1));

        // Grid.
        scroll = new ScrollView(c);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setClipChildren(false);
        scroll.setSmoothScrollingEnabled(true);
        list = new LinearLayout(c);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setClipChildren(false);
        list.setClipToPadding(false);
        list.setPadding(dp(18), 0, dp(8), dp(60));
        scroll.addView(list);
        scroll.setOnScrollChangeListener((v, x, y, ox, oy) -> {
            boolean show = y > dp(160);
            if (show == (topButton.getVisibility() == View.VISIBLE)) return;
            if (show) {
                topButton.setAlpha(0f);
                topButton.setTranslationX(-dp(16));
                topButton.setVisibility(View.VISIBLE);
                topButton.animate().alpha(1f).translationX(0).setDuration(200).start();
            } else {
                topButton.setVisibility(View.GONE);
            }
        });
        content.addView(scroll, new LinearLayout.LayoutParams(0, -1, 1f));
        addView(content, new LayoutParams(-1, -1));
        addTitle();
    }

    private void addTitle() {
        list.addView(text("All apps", 28, "sans-serif-light", 1f));
        TextView hint = text("◀  letters    ·    hold OK to add to or remove from your dock    ·    ▲ back home", 12, "sans-serif", 0.55f);
        hint.setText(Emph.key(hint.getText()));
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(-2, -2);
        hlp.topMargin = dp(2);
        list.addView(hint, hlp);
    }

    /**
     * The dock's frosted glass, full screen: Home's tiny blurred copy of the current photo,
     * smoothly stretched, under the dock's own tint, a shade darker so names read easily.
     */
    private android.graphics.drawable.Drawable glass() {
        int base = HomeActivity.sGlassBase;
        GradientDrawable tint = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xD9000000 | base, 0xC7000000 | base, 0xE6000000 | base});
        android.graphics.Bitmap frost = HomeActivity.sFrost;
        if (frost == null) {
            return new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xFF182133, 0xFF0B0E14});
        }
        android.graphics.drawable.BitmapDrawable photo = new android.graphics.drawable.BitmapDrawable(getResources(), frost);
        photo.setFilterBitmap(true);
        return new android.graphics.drawable.LayerDrawable(new android.graphics.drawable.Drawable[]{photo, tint});
    }

    private boolean showing;

    /**
     * Called just before the panel scrolls into view: background for the current photo, and the
     * first screen of cards built now (from data kept since last time), so they slide in with it.
     */
    void prepare() {
        showing = true;
        setBackground(glass());
        if (loaded) buildFirstScreen();
        else if (!loading) load();
    }

    void hidden() {
        showing = false;
    }

    /** Load the app data in the background ahead of time (Home calls this when it appears). */
    void prefetch() {
        if (loading) return;
        if (!loaded) { load(); return; }
        // Kept data: still current? (apps can change without a broadcast; installed() notices.)
        Context c = getContext();
        io.execute(() -> {
            boolean stale = Apps.installed(c) != loadedFrom;
            if (stale) ui.post(() -> { if (!showing) { invalidateData(); load(); } });
        });
    }

    private volatile Map<String, Apps.Entry> loadedFrom;

    /** Apps were installed or removed: the kept data is stale. */
    void invalidateData() {
        generation++;
        loaded = loading = false;
        sectionWork = new ArrayList<>();
        sectionKeys = new ArrayList<>();
    }

    private void buildFirstScreen() {
        if (built > 0 || sectionWork.isEmpty()) return;
        for (String k : sectionKeys) addRailLetter(k);  // the whole rail; sections come on demand
        while (built < sectionWork.size() && tiles.size() < COLUMNS * 2) sectionWork.get(built++).run();
        refreshPins();
        if (showing && !tiles.isEmpty()) tiles.get(0).requestFocus();
    }

    /** Put focus on the first app (or wait for the content to arrive). */
    void focusFirst() {
        scroll.scrollTo(0, 0);
        if (!tiles.isEmpty()) tiles.get(0).requestFocus();
        else requestFocus();
    }

    /** Free every card (Home went to the background). The app data is kept, so the next open is quick. */
    void release() {
        showing = false;
        ui.removeCallbacksAndMessages(null);
        while (list.getChildCount() > 2) list.removeViewAt(2);  // keep the title and hint
        rail.removeAllViews();
        tiles.clear();
        headers.clear();
        firstTiles.clear();
        railLetters.clear();
        sectionOf.clear();
        built = 0;
        firstRow = null;
        activeLetter = null;
        setBackground(null);
    }

    private void load() {
        loading = true;
        int gen = generation;
        Context c = getContext();
        io.execute(() -> {
            Map<String, Apps.Entry> all = Apps.installed(c);
            loadedFrom = all;
            List<Apps.Entry> recent = Apps.recents(c, all, COLUMNS);
            List<Apps.Entry> fresh = new ArrayList<>();
            for (Apps.Pick p : Apps.recentlyInstalled(c, all, COLUMNS)) fresh.add(p.entry);
            List<Apps.Entry> apps = new ArrayList<>(), inputs = new ArrayList<>();
            for (Apps.Entry e : all.values()) (e.id.startsWith("hdmi:") ? inputs : apps).add(e);
            Collections.sort(apps, (a, b) -> a.label.toString().compareToIgnoreCase(b.label.toString()));
            List<Apps.Entry> system = new ArrayList<>();
            Apps.Entry gtv = Apps.googleHome(c);
            if (gtv != null) system.add(gtv);
            system.add(Apps.settings());
            Map<String, List<Apps.Entry>> byLetter = new LinkedHashMap<>();
            for (Apps.Entry e : apps) {
                char ch = Character.toUpperCase(e.label.length() > 0 ? e.label.charAt(0) : '#');
                String key = Character.isLetter(ch) ? String.valueOf(ch) : "#";
                List<Apps.Entry> g = byLetter.get(key);
                if (g == null) byLetter.put(key, g = new ArrayList<>());
                g.add(e);
            }
            List<Runnable> work = new ArrayList<>();
            List<String> keys = new ArrayList<>();
            if (!recent.isEmpty()) { keys.add("★"); work.add(() -> section("★", "Recent", recent)); }
            if (!fresh.isEmpty()) { keys.add("✦"); work.add(() -> section("✦", "Recently installed", fresh)); }
            for (Map.Entry<String, List<Apps.Entry>> g : byLetter.entrySet()) { keys.add(g.getKey()); work.add(() -> section(g.getKey(), g.getKey(), g.getValue())); }
            if (!inputs.isEmpty()) { keys.add("⇄"); work.add(() -> section("⇄", "Inputs", inputs)); }
            keys.add("⚙");
            work.add(() -> section("⚙", "System", system));
            ui.post(() -> {
                if (gen != generation) return;
                loading = false;
                loaded = true;
                sectionWork = work;
                sectionKeys = keys;
                if (showing) {          // opened before the data was ready: show it now
                    buildFirstScreen();
                    entrance();
                }
            });
        });
    }

    /** Build ahead when the main thread is idle, never inside the frame that handles a key. */
    private void buildAheadWhenIdle(int upTo) {
        if (built > upTo) return;
        android.os.Looper.myQueue().addIdleHandler(() -> {
            if (showing) ensureBuilt(upTo);
            return false;
        });
    }

    /** Make sure sections up to and including upTo exist (builds only what's missing). */
    private void ensureBuilt(int upTo) {
        boolean any = false;
        while (built < sectionWork.size() && built <= upTo) {
            sectionWork.get(built++).run();
            any = true;
        }
        if (any) refreshPins();
    }

    /** Keys while the panel is showing. Returns true when handled. */
    boolean onKey(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            host.closeLibrary(true);
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_TV_INPUT) {
            HomeActivity.pickInput(host.activity());
            return true;
        }
        View f = findFocus();
        if (keyCode == KeyEvent.KEYCODE_MENU && f instanceof Tile) {
            toggle((Tile) f);
            return true;
        }
        // Up from the top row, or from the first letter on the rail: back up to Home.
        if (keyCode == KeyEvent.KEYCODE_DPAD_UP && f != null
                && (f instanceof Tile && f.getParent() == firstRow || f.getParent() == rail && rail.indexOfChild(f) == 0)) {
            host.closeLibrary(true);
            return true;
        }
        // Right from the rail: into that letter's apps.
        if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT && f != null && f.getParent() == rail) {
            ensureBuilt(sectionKeys.indexOf((String) f.getTag()));
            Tile t = firstTiles.get((String) f.getTag());
            if (t != null) t.requestFocus();
            return true;
        }
        // Left from the first column: out to the rail, on this app's letter.
        if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT && f instanceof Tile
                && ((LinearLayout) f.getParent()).indexOfChild(f) == 0) {
            TextView letter = railLetters.get(sectionOf.get(f));
            if (letter != null) letter.requestFocus();
            return true;
        }
        return false;
    }

    private void section(String key, String title, List<Apps.Entry> entries) {
        Context c = getContext();
        TextView header = text(title, 15, "sans-serif-medium", 0.7f);
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(-2, -2);
        hlp.topMargin = dp(18);
        hlp.bottomMargin = dp(8);
        list.addView(header, hlp);
        headers.put(key, header);
        LinearLayout row = null;
        for (int i = 0; i < entries.size(); i++) {
            if (i % COLUMNS == 0) {
                row = new LinearLayout(c);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setClipChildren(false);
                row.setClipToPadding(false);
                list.addView(row, new LinearLayout.LayoutParams(-1, -2));
                if (firstRow == null) firstRow = row;
            }
            Apps.Entry e = entries.get(i);
            Tile t = new Tile(c, e, 136, 77);
            t.setOnClickListener(v -> open(e));
            t.setOnLongClickListener(v -> {
                toggle(t);
                return true;
            });
            t.setOnFocused(tile -> {
                setActive(key, false);
                buildAheadWhenIdle(sectionKeys.indexOf(key) + 1);  // keep one section ready ahead
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.setMargins(0, 0, dp(18), dp(2));
            row.addView(t, lp);
            tiles.add(t);
            sectionOf.put(t, key);
            if (i == 0) firstTiles.put(key, t);
        }
    }

    private void addRailLetter(String key) {
        TextView l = new TextView(getContext());
        l.setText(key);
        l.setTag(key);
        l.setTextColor(Color.WHITE);
        l.setAlpha(0.5f);
        l.setTextSize(13);
        l.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        l.setGravity(Gravity.CENTER);
        l.setFocusable(true);
        l.setDefaultFocusHighlightEnabled(false);
        // Focus = solid white pill with dark text (no growing, so it can never be clipped).
        l.setOnFocusChangeListener((v, has) -> {
            if (has) setActive(key, true);
            GradientDrawable pill = new GradientDrawable();
            pill.setCornerRadius(dp(13));
            pill.setColor(has ? Color.WHITE : 0x33FFFFFF);
            l.setBackground(has || key.equals(activeLetter) ? pill : null);
            l.setTextColor(has ? 0xFF111111 : Color.WHITE);
            l.setAlpha(has || key.equals(activeLetter) ? 1f : 0.5f);
        });
        l.setOnClickListener(v -> {
            ensureBuilt(sectionKeys.indexOf(key));
            Tile t = firstTiles.get(key);
            if (t != null) t.requestFocus();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(30), dp(26));
        lp.bottomMargin = dp(2);
        rail.addView(l, lp);
        railLetters.put(key, l);
    }

    /** Highlight a letter on the rail; when the rail itself has focus, glide the grid to it. */
    private void setActive(String key, boolean scrollGrid) {
        if (!key.equals(activeLetter)) {
            TextView old = railLetters.get(activeLetter);
            if (old != null) {
                old.setBackground(null);
                old.setAlpha(0.5f);
            }
            TextView now = railLetters.get(key);
            if (now != null) {
                GradientDrawable pill = new GradientDrawable();
                pill.setCornerRadius(dp(13));
                pill.setColor(0x33FFFFFF);
                now.setBackground(pill);
                now.setAlpha(1f);
            }
            activeLetter = key;
        }
        if (scrollGrid && !headers.containsKey(key)) ensureBuilt(sectionKeys.indexOf(key));
        View h = headers.get(key);
        // (posted: a section built just now has no position until the next layout)
        if (scrollGrid && h != null) scroll.post(() -> scroll.smoothScrollTo(0, Math.max(0, h.getTop() - dp(8))));
    }

    /** First rows rise in one after another (movement only: no fading, which costs a layer each). */
    void entrance() {
        int n = Math.min(tiles.size(), COLUMNS * 2);
        for (int i = 0; i < n; i++) {
            Tile t = tiles.get(i);
            t.setTranslationY(dp(14));
            t.animate().translationY(0).setStartDelay(60L + 22L * i).setInterpolator(EASE)
                    .setDuration(300).start();
        }
    }

    private void open(Apps.Entry e) {
        if (Apps.GOOGLE_HOME.equals(e.id)) HomeWatcher.allowGoogleHome = true;
        Apps.launch(getContext(), e);
    }

    private void toggle(Tile t) {
        String id = t.entry.id;
        if (id.startsWith("sys:")) return;
        boolean added = Apps.toggleDock(getContext(), id);
        refreshPins();
        Toast.makeText(getContext(), (added ? "Added " : "Removed ") + t.entry.label + (added ? " to" : " from") + " your dock",
                Toast.LENGTH_SHORT).show();
    }

    private void refreshPins() {
        Set<String> dock = new HashSet<>(Apps.dock(getContext()));
        for (Tile t : tiles) t.setPinned(dock.contains(t.entry.id));
    }

    /** Round side button (Home / Top): white when focused. */
    private TextView sideButton(String glyph, String name) {
        TextView b = new TextView(getContext());
        b.setText(glyph);
        b.setContentDescription(name);
        b.setTextColor(Color.WHITE);
        b.setTextSize(16);
        b.setGravity(Gravity.CENTER);
        b.setFocusable(true);
        b.setDefaultFocusHighlightEnabled(false);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0x26FFFFFF);
        bg.setStroke(dp(1), 0x40FFFFFF);
        b.setBackground(bg);
        b.setOnFocusChangeListener((v, has) -> {
            bg.setColor(has ? Color.WHITE : 0x26FFFFFF);
            b.setTextColor(has ? 0xFF111111 : Color.WHITE);
            v.animate().scaleX(has ? 1.12f : 1f).scaleY(has ? 1.12f : 1f).setDuration(120).start();
        });
        return b;
    }

    private TextView text(String s, int sp, String family, float alpha) {
        TextView t = new TextView(getContext());
        t.setText(s);
        t.setTextColor(Color.WHITE);
        t.setTextSize(sp);
        t.setTypeface(Typeface.create(family, Typeface.NORMAL));
        t.setAlpha(alpha);
        return t;
    }

    private int dp(float v) {
        return Tile.dp(getContext(), v);
    }
}
