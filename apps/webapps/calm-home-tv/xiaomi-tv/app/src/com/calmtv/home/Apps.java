package com.calmtv.home;

import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.drawable.Drawable;
import android.media.tv.TvContract;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.os.Process;
import android.provider.Settings;
import android.text.TextUtils;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Finds launchable apps and HDMI inputs, and stores the dock. */
final class Apps {
    static final String PS4 = "ps4";
    static final String LIBRARY = "sys:library";
    static final String SETTINGS = "sys:settings";
    static final String GOOGLE_HOME = "sys:googletv";
    static final String INPUTS = "sys:inputs";
    static final String BOOST = "sys:boost";
    static final String WIFI = "sys:wifi";
    static final String MORE = "sys:more";
    static final String ADD = "sys:add";
    static final String GTV = "com.google.android.apps.tv.launcherx";

    /** Where the PS4 was found when this was set up (HDMI 2), used until it's seen elsewhere. */
    private static final String PS4_PORT_ON_THIS_TV = "hdmi:com.droidlogic.tvinput/.services.Hdmi2InputService/HW6";

    static final int[] PS4_COLORS = {0xFF0070D1, 0xFF00317A};
    static final int[] LIBRARY_COLORS = {0xFF3A4A6B, 0xFF222B3F};
    static final int[] SYSTEM_COLORS = {0xFF4A4F5A, 0xFF2B2F36};

    /** Apps missing from the TV are skipped, so this list can name apps not installed yet. */
    static final String[] DEFAULT_DOCK = {
            PS4,
            "com.netflix.ninja",
            "com.amazon.amazonvideo.livingroom",
            "in.startv.hotstar",
            "com.sonyliv",
            "com.google.android.youtube.tv",
            "com.google.android.youtube.tvmusic",
            "com.apple.android.music",
            "com.fancode.tv",
            "com.spotify.tv.android",
    };

    /** Settings already has its own tile, so it is never a "suggestion". */
    private static final Set<String> NOT_SUGGESTED = new HashSet<>(Arrays.asList(
            "com.android.tv.settings", "com.xiaomi.gtv.settings", "com.android.vending"));

    static final class Entry {
        final String id;
        final CharSequence label;
        final Drawable banner;
        final Drawable icon;
        final Intent intent;
        final int[] colors;
        /** Small symbol shown before the label on tiles without artwork (system tiles). */
        final String glyph;

        Entry(String id, CharSequence label, Drawable banner, Drawable icon, Intent intent, int[] colors) {
            this(id, label, banner, icon, intent, colors, null);
        }

        Entry(String id, CharSequence label, Drawable banner, Drawable icon, Intent intent, int[] colors, String glyph) {
            this.id = id;
            this.label = label;
            this.banner = banner;
            this.icon = icon;
            this.intent = intent;
            this.colors = colors;
            this.glyph = glyph;
        }
    }

    private Apps() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("calm", Context.MODE_PRIVATE);
    }

    private static volatile Map<String, Entry> cache;
    private static int changeSeq = 0;

    /** Forget the cached app list (called when an app is installed, updated or removed). */
    /** Lock-free: called on the main thread, so it must never wait for a background load. */
    static void invalidate() {
        cache = null;
        forgetRecents();
    }

    /**
     * All launchable apps (TV apps first, with banners) followed by HDMI inputs, keyed by id.
     * Cached, but every call first asks Android whether any app was installed, updated or
     * removed since the last look (one cheap call), so new apps always show up even if the
     * install broadcast never arrived.
     */
    static synchronized Map<String, Entry> installed(Context c) {
        android.content.pm.ChangedPackages changed = c.getPackageManager().getChangedPackages(changeSeq);
        if (changed != null) {
            changeSeq = changed.getSequenceNumber();
            cache = null;
        }
        if (cache == null) cache = Collections.unmodifiableMap(load(c.getApplicationContext()));
        return cache;
    }

    private static Map<String, Entry> load(Context c) {
        PackageManager pm = c.getPackageManager();
        Map<String, Entry> out = new LinkedHashMap<>();
        addFrom(pm, out, Intent.CATEGORY_LEANBACK_LAUNCHER, true);
        addFrom(pm, out, Intent.CATEGORY_LAUNCHER, false);
        out.remove(c.getPackageName());
        out.remove(GTV);
        // System plumbing, not something to open: Live TV is what displays HDMI (reach it via
        // the PS4 tile or Inputs), and the Mi Home helper belongs to the old launcher.
        out.remove("com.mitv.livetv");
        out.remove("com.mitv.tvhome.atv");
        for (Entry e : hdmiInputs(c)) out.put(e.id, e);
        return out;
    }

    private static void addFrom(PackageManager pm, Map<String, Entry> out, String category, boolean leanback) {
        Intent query = new Intent(Intent.ACTION_MAIN).addCategory(category);
        for (ResolveInfo ri : pm.queryIntentActivities(query, 0)) {
            ActivityInfo ai = ri.activityInfo;
            if (out.containsKey(ai.packageName)) continue;
            CharSequence label = ri.loadLabel(pm);
            if (label.toString().toLowerCase().contains("factory")) continue;  // Xiaomi service-menu app
            Intent launch = new Intent(Intent.ACTION_MAIN)
                    .addCategory(category)
                    .setClassName(ai.packageName, ai.name)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            Drawable banner = leanback ? ai.loadBanner(pm) : null;
            out.put(ai.packageName, new Entry(ai.packageName, label, banner, ri.loadIcon(pm), launch, null));
        }
    }

    static List<Entry> hdmiInputs(Context c) {
        List<Entry> list = new ArrayList<>();
        TvInputManager tim = (TvInputManager) c.getSystemService(Context.TV_INPUT_SERVICE);
        if (tim != null) {
            for (TvInputInfo info : tim.getTvInputList()) {
                if (info.getType() != TvInputInfo.TYPE_HDMI || info.getParentId() != null || info.isHidden(c)) continue;
                CharSequence label = info.loadCustomLabel(c);
                if (TextUtils.isEmpty(label)) label = info.loadLabel(c);
                list.add(hdmi(info.getId(), label, info.loadIcon(c)));
            }
        }
        if (list.isEmpty()) {
            // Fallback: the inputs this TV (MiTV-AXFR2) registers.
            list.add(hdmi("com.droidlogic.tvinput/.services.Hdmi1InputService/HW5", "HDMI 1", null));
            list.add(hdmi("com.droidlogic.tvinput/.services.Hdmi2InputService/HW6", "HDMI 2", null));
        }
        Collections.sort(list, (a, b) -> a.label.toString().compareToIgnoreCase(b.label.toString()));
        return list;
    }

    private static Entry hdmi(String inputId, CharSequence label, Drawable icon) {
        Intent i = new Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(inputId))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return new Entry("hdmi:" + inputId, label, null, icon, i, null);
    }

    /**
     * The PS4 tile: the HDMI input the user picked; otherwise whichever HDMI port
     * has something switched on; otherwise the first HDMI port.
     */
    static Entry ps4(Context c, Map<String, Entry> all) {
        SharedPreferences p = prefs(c);
        String want = p.getString("ps4_input", null);
        Entry in = want != null ? all.get(want) : null;
        if (in == null) {
            in = liveHdmi(c, all);
            // Remember where the PS4 was last seen switched on, for when it's in rest mode
            // (written only when it changes: this runs every time Home appears).
            if (in != null && !in.id.equals(p.getString("ps4_seen", null))) p.edit().putString("ps4_seen", in.id).apply();
        }
        if (in == null) in = all.get(p.getString("ps4_seen", PS4_PORT_ON_THIS_TV));
        if (in == null) {
            for (Entry e : all.values()) {
                if (e.id.startsWith("hdmi:")) { in = e; break; }
            }
        }
        if (in == null) return null;
        return new Entry(PS4, "PS4", new Ps4Art(in.label), null, in.intent, PS4_COLORS);
    }

    private static Entry liveHdmi(Context c, Map<String, Entry> all) {
        TvInputManager tim = (TvInputManager) c.getSystemService(Context.TV_INPUT_SERVICE);
        if (tim == null) return null;
        for (Entry e : all.values()) {
            if (!e.id.startsWith("hdmi:")) continue;
            try {
                if (tim.getInputState(e.id.substring(5)) == TvInputManager.INPUT_STATE_CONNECTED) return e;
            } catch (IllegalArgumentException ignored) {
                // input went away
            }
        }
        return null;
    }

    static void setPs4Input(Context c, String hdmiId) {
        prefs(c).edit().putString("ps4_input", hdmiId).apply();
    }

    static Entry library() {
        return new Entry(LIBRARY, "All Apps", null, null, null, LIBRARY_COLORS, "▦");
    }

    /** Opens the TV's Wi-Fi screen (add or switch networks). */
    static Entry wifi() {
        Intent i = new Intent("android.settings.WIFI_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return new Entry(WIFI, "Wi-Fi", null, null, i, new int[]{0xFF2F6FDE, 0xFF1D3F8F}, "📶");
    }

    /** "Excellent signal", "Weak signal", "Offline"... for the Wi-Fi tile's subtitle. */
    static String wifiState(Context c) {
        try {
            String s = Weather.wifi(c);
            return s.startsWith("Wi-Fi  ") ? s.substring(7) + " signal" : s;
        } catch (RuntimeException e) {
            return "";
        }
    }

    /** The "⋯" tile at the end of the dock: opens a small menu of the system shortcuts. */
    static Entry more() {
        return new Entry(MORE, "More", null, null, null, new int[]{0x40FFFFFF, 0x1AFFFFFF}, "⋯");
    }

    static Entry boost() {
        return new Entry(BOOST, "Boost", null, null, null, new int[]{0xFFFF8A4C, 0xFFB4386B}, "⚡");
    }

    static Entry addApp() {
        return new Entry(ADD, "Edit dock", null, null, null, new int[]{0x40FFFFFF, 0x1AFFFFFF}, "✎");
    }

    /** Recently opened apps, newest first, skipping any the user removed from Recents. */
    static List<Entry> recents(Context c, Map<String, Entry> all, int n) {
        List<Entry> out = new ArrayList<>();
        if (!hasUsageAccess(c)) return out;
        Set<String> hidden = prefs(c).getStringSet("recent_hidden", Collections.emptySet());
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        long now = System.currentTimeMillis();
        Map<String, UsageStats> stats = usm.queryAndAggregateUsageStats(now - 7L * 24 * 3600 * 1000, now);
        List<UsageStats> list = new ArrayList<>(stats.values());
        Collections.sort(list, (a, b) -> Long.compare(b.getLastTimeUsed(), a.getLastTimeUsed()));
        for (UsageStats u : list) {
            if (out.size() >= n) break;
            String p = u.getPackageName();
            if (hidden.contains(p) || NOT_SUGGESTED.contains(p) || u.getTotalTimeInForeground() < 15_000) continue;
            Entry e = all.get(p);
            if (e != null) out.add(e);
        }
        return out;
    }

    /** An app suggestion and the reason for it, e.g. "Usually around now" or "2h ago". */
    static final class Pick {
        final Entry entry;
        final String why;
        final boolean habit;

        Pick(Entry entry, String why, boolean habit) {
            this.entry = entry;
            this.why = why;
            this.habit = habit;
        }
    }

    /**
     * Smart Recents: ranks apps by habit (how often they were opened around this hour
     * over the last 3 weeks) plus recency. Falls back to plain recency when there is
     * no history yet.
     */
    private static volatile List<Pick> recentsMemo;
    private static volatile long recentsAt;
    private static volatile int recentsHour = -1, recentsN;
    private static volatile Map<String, Entry> recentsAll;

    /** Forget the memoised For you list (an app was opened, hidden, installed or removed). */
    static void forgetRecents() {  // lock-free: safe to call from the main thread
        recentsMemo = null;
    }

    /**
     * For you, memoised: reading three weeks of usage events every time Home appears cost CPU
     * right when you start navigating. Recomputed when the hour changes, after 5 minutes, when
     * the app list changes, or when something calls forgetRecents().
     */
    static List<Pick> smartRecents(Context c, Map<String, Entry> all, int n) {  // no lock: a rare double compute is harmless
        int hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
        long nowUp = android.os.SystemClock.uptimeMillis();
        if (recentsMemo != null && recentsAll == all && recentsHour == hour && recentsN == n
                && nowUp - recentsAt < 3 * 60_000) {
            return recentsMemo;
        }
        List<Pick> fresh = computeRecents(c, all, n);
        recentsMemo = fresh;
        recentsAt = nowUp;
        recentsHour = hour;
        recentsN = n;
        recentsAll = all;
        return fresh;
    }

    private static List<Pick> computeRecents(Context c, Map<String, Entry> all, int n) {
        List<Pick> out = new ArrayList<>();
        if (!hasUsageAccess(c)) return out;
        Set<String> hidden = prefs(c).getStringSet("recent_hidden", Collections.emptySet());
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        long now = System.currentTimeMillis();
        int hourNow = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
        Map<String, int[]> habit = new java.util.HashMap<>();   // package -> {launches near this hour}
        Map<String, Long> last = new java.util.HashMap<>();
        android.app.usage.UsageEvents ev = usm.queryEvents(now - 21L * 24 * 3600 * 1000, now);
        android.app.usage.UsageEvents.Event e = new android.app.usage.UsageEvents.Event();
        java.util.Calendar cal = java.util.Calendar.getInstance();
        while (ev.hasNextEvent()) {
            ev.getNextEvent(e);
            if (e.getEventType() != android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED) continue;
            String p = e.getPackageName();
            if (!all.containsKey(p) || hidden.contains(p) || NOT_SUGGESTED.contains(p)) continue;
            last.put(p, e.getTimeStamp());
            cal.setTimeInMillis(e.getTimeStamp());
            int d = Math.abs(cal.get(java.util.Calendar.HOUR_OF_DAY) - hourNow);
            if (Math.min(d, 24 - d) <= 1) {
                int[] h = habit.get(p);
                if (h == null) habit.put(p, h = new int[1]);
                h[0]++;
            }
        }
        List<String> pkgs = new ArrayList<>(last.keySet());
        Map<String, Double> score = new java.util.HashMap<>();
        for (String p : pkgs) {
            double hours = (now - last.get(p)) / 3_600_000.0;
            int h = habit.containsKey(p) ? habit.get(p)[0] : 0;
            score.put(p, Math.min(h, 10) * 1.5 + (hours < 24 ? 4 : hours < 72 ? 2 : 0) + 1.0 / (1 + hours));
        }
        Collections.sort(pkgs, (a, b) -> Double.compare(score.get(b), score.get(a)));
        for (String p : pkgs) {
            if (out.size() >= n) break;
            int h = habit.containsKey(p) ? habit.get(p)[0] : 0;
            boolean isHabit = h >= 3;
            out.add(new Pick(all.get(p), isHabit ? "Usually around now" : ago(now - last.get(p)), isHabit));
        }
        return out;
    }

    /** Apps installed in the last 14 days (not factory apps), newest first, with "Installed today" etc. */
    private static volatile List<Pick> installedMemo;
    private static volatile Map<String, Entry> installedMemoAll;
    private static volatile long installedMemoDay = -1;

    /** Memoised per app list and day: it asks Android about every app, which delayed the Library opening. */
    static List<Pick> recentlyInstalled(Context c, Map<String, Entry> all, int n) {
        long day = System.currentTimeMillis() / (24 * 3600 * 1000);
        List<Pick> memo = installedMemo;
        if (memo != null && installedMemoAll == all && installedMemoDay == day) return memo.size() > n ? memo.subList(0, n) : memo;
        List<Pick> fresh = computeRecentlyInstalled(c, all, 20);
        installedMemo = fresh;
        installedMemoAll = all;
        installedMemoDay = day;
        return fresh.size() > n ? fresh.subList(0, n) : fresh;
    }

    private static List<Pick> computeRecentlyInstalled(Context c, Map<String, Entry> all, int n) {
        PackageManager pm = c.getPackageManager();
        long now = System.currentTimeMillis();
        List<Pick> out = new ArrayList<>();
        List<long[]> times = new ArrayList<>();
        List<Entry> found = new ArrayList<>();
        for (Entry e : all.values()) {
            if (e.id.contains(":")) continue;
            try {
                android.content.pm.PackageInfo info = pm.getPackageInfo(e.id, 0);
                if ((info.applicationInfo.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0) continue;
                if (now - info.firstInstallTime > 14L * 24 * 3600 * 1000) continue;
                found.add(e);
                times.add(new long[]{info.firstInstallTime});
            } catch (PackageManager.NameNotFoundException ignored) {
                // removed meanwhile
            }
        }
        Integer[] order = new Integer[found.size()];
        for (int i = 0; i < order.length; i++) order[i] = i;
        java.util.Arrays.sort(order, (a, b) -> Long.compare(times.get(b)[0], times.get(a)[0]));
        for (int i = 0; i < order.length && out.size() < n; i++) {
            long days = (now - times.get(order[i])[0]) / (24 * 3600 * 1000);
            String when = days == 0 ? "Installed today" : days == 1 ? "Installed yesterday" : "Installed " + days + " days ago";
            out.add(new Pick(found.get(order[i]), when, false));
        }
        return out;
    }

    static String ago(long ms) {
        long m = ms / 60000;
        if (m < 2) return "Just now";
        if (m < 60) return m + " min ago";
        long h = m / 60;
        if (h < 24) return h + "h ago";
        long d = h / 24;
        return d == 1 ? "Yesterday" : d + " days ago";
    }

    static void hideRecent(Context c, String id) {
        Set<String> hidden = new HashSet<>(prefs(c).getStringSet("recent_hidden", Collections.emptySet()));
        hidden.add(id);
        forgetRecents();
        prefs(c).edit().putStringSet("recent_hidden", hidden).apply();
    }

    /**
     * Apps the system starts by itself (at boot, for channel syncing) that then sit in
     * memory: the old Google TV launcher, Xiaomi helpers and the video apps. Not Spotify
     * (music keeps playing in the background), not Assistant or Chromecast.
     */
    // (Not the Google TV launcher: it handles the remote's Netflix/Prime/YouTube buttons.)
    private static final String[] AUTO_TRIM = {
            "com.mitv.tvhome.atv", "com.google.android.videos", "com.xiaomi.mitv.updateservice",
            "com.google.android.youtube.tv", "com.amazon.amazonvideo.livingroom", "com.netflix.ninja",
            "in.startv.hotstar", "com.sonyliv", "com.graymatrix.did", "com.jio.media.stb.ondemand",
            "tv.airtel.xstream.tvapp", "com.crunchyroll.crunchyroid", "com.fancode.tv", "com.spotify.tv.android",
    };

    /**
     * Quietly closes AUTO_TRIM apps that are idle in the background, at most every
     * 20 minutes. Android only closes apps that aren't on screen or playing.
     */
    static void quietTrim(Context c) {
        quietTrim(c, false);
    }

    /** force: right after a power-on, when all of these start themselves at once and fill the RAM. */
    static void quietTrim(Context c, boolean force) {
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        if (!force && now - p.getLong("trim_at", 0) < 20 * 60 * 1000) return;
        p.edit().putLong("trim_at", now).apply();
        android.app.ActivityManager am = (android.app.ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
        for (String pkg : AUTO_TRIM) am.killBackgroundProcesses(pkg);
    }

    /**
     * Closes apps sitting idle in the background (never the one on screen, never system
     * services) and returns how much memory came free, in MB.
     */
    static long boost(Context c) {
        android.app.ActivityManager am = (android.app.ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
        android.app.ActivityManager.MemoryInfo before = new android.app.ActivityManager.MemoryInfo();
        am.getMemoryInfo(before);
        // Only apps you installed (plus the known idle hogs), never system services: killing Play
        // Services, the Assistant or Google's launcher just made them restart and churn.
        for (android.content.pm.ApplicationInfo ai : c.getPackageManager().getInstalledApplications(0)) {
            boolean system = (ai.flags & (android.content.pm.ApplicationInfo.FLAG_SYSTEM | android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0;
            if (!system && !ai.packageName.equals(c.getPackageName())) am.killBackgroundProcesses(ai.packageName);
        }
        for (String pkg : AUTO_TRIM) am.killBackgroundProcesses(pkg);
        try { Thread.sleep(1200); } catch (InterruptedException ignored) {}
        android.app.ActivityManager.MemoryInfo after = new android.app.ActivityManager.MemoryInfo();
        am.getMemoryInfo(after);
        return Math.max(0, (after.availMem - before.availMem) / (1024 * 1024));
    }

    static Entry inputs() {
        return new Entry(INPUTS, "Inputs", null, null, null, SYSTEM_COLORS, "⇄");
    }

    /** Which HDMI input the PS4 tile opens, for showing under its name. */
    static CharSequence ps4PortLabel(Context c) {
        Entry e = ps4(c, installed(c));
        if (e == null) return "";
        for (Entry in : hdmiInputs(c)) {
            if (in.intent.getData() != null && in.intent.getData().equals(e.intent.getData())) {
                return in.label;
            }
        }
        return "";
    }

    static Entry settings() {
        Intent i = new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return new Entry(SETTINGS, "Settings", null, null, i, SYSTEM_COLORS, "⚙");
    }

    static Entry googleHome(Context c) {
        Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setPackage(GTV)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (c.getPackageManager().resolveActivity(i, 0) == null) return null;
        return new Entry(GOOGLE_HOME, "Google TV home", null, null, i, SYSTEM_COLORS);
    }

    static List<String> dock(Context c) {
        String s = prefs(c).getString("dock", null);
        if (s == null) return new ArrayList<>(Arrays.asList(DEFAULT_DOCK));
        if (s.isEmpty()) return new ArrayList<>();
        return new ArrayList<>(Arrays.asList(s.split(",")));
    }

    static void saveDock(Context c, List<String> dock) {
        prefs(c).edit().putString("dock", TextUtils.join(",", dock)).apply();
    }

    /** Adds or removes an app from the dock; returns true if it is now in the dock. */
    static boolean toggleDock(Context c, String id) {
        List<String> dock = dock(c);
        boolean added = !dock.remove(id);
        if (added) dock.add(id);
        saveDock(c, dock);
        return added;
    }

    static void move(Context c, String id, int delta) {
        List<String> dock = dock(c);
        int i = dock.indexOf(id), j = i + delta;
        if (i < 0 || j < 0 || j >= dock.size()) return;
        Collections.swap(dock, i, j);
        saveDock(c, dock);
    }

    /** Recently used apps (last 14 days, at least a minute of use), most recent first. */
    static List<Entry> suggestions(Context c, Map<String, Entry> all, Set<String> skip, int n) {
        List<Entry> out = new ArrayList<>();
        if (!hasUsageAccess(c)) return out;
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        long now = System.currentTimeMillis();
        Map<String, UsageStats> stats = usm.queryAndAggregateUsageStats(now - 14L * 24 * 3600 * 1000, now);
        List<UsageStats> list = new ArrayList<>(stats.values());
        Collections.sort(list, (a, b) -> Long.compare(b.getLastTimeUsed(), a.getLastTimeUsed()));
        for (UsageStats u : list) {
            if (out.size() >= n) break;
            String p = u.getPackageName();
            if (skip.contains(p) || NOT_SUGGESTED.contains(p) || u.getTotalTimeInForeground() < 60_000) continue;
            Entry e = all.get(p);
            if (e != null) out.add(e);
        }
        return out;
    }

    @SuppressWarnings("deprecation")
    private static boolean hasUsageAccess(Context c) {
        AppOpsManager ao = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        return ao.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName())
                == AppOpsManager.MODE_ALLOWED;
    }

    static void launch(Context c, Entry e) {
        if (e.intent == null) return;
        try {
            c.startActivity(e.intent);
        } catch (ActivityNotFoundException | SecurityException ex) {
            Toast.makeText(c, "Couldn't open " + e.label, Toast.LENGTH_SHORT).show();
        }
    }
}
