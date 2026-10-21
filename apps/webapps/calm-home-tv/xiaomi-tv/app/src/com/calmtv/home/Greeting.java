package com.calmtv.home;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Random;

/**
 * A different greeting every time Home appears: a headline for the time of day, and a note
 * picked from what's true right now (weather, air quality, day of the week, the owner's habits,
 * the PS4) mixed with general lines. The last few shown are remembered so nothing repeats
 * back to back. Everything is local: no network, no cost.
 */
final class Greeting {
    private static final Random RANDOM = new Random();

    private Greeting() {}

    /**
     * @param topApp the app usually opened around this hour (or null)
     * @return {headline, note}
     */
    static String[] next(Context c, String name, Weather.Now w, String topApp) {
        Calendar cal = Calendar.getInstance();
        int h = cal.get(Calendar.HOUR_OF_DAY), day = cal.get(Calendar.DAY_OF_WEEK);
        String n = name == null || name.isEmpty() ? "" : name;

        List<String> heads = new ArrayList<>();
        if (h >= 5 && h < 12) {
            add(heads, "Good morning, %s", "Morning, %s", "Rise and shine, %s", "Hello, %s",
                    "Fresh start, %s", "Top of the morning, %s");
        } else if (h >= 12 && h < 17) {
            add(heads, "Good afternoon, %s", "Hey %s", "Afternoon, %s", "Welcome back, %s",
                    "Hi %s", "There you are, %s");
        } else if (h >= 17 && h < 22) {
            add(heads, "Good evening, %s", "Evening, %s", "Welcome back, %s", "Hey %s",
                    "There you are, %s", "Hi %s, the couch missed you", "Look who's here, %s");
        } else {
            add(heads, "Still up, %s?", "Late one, %s?", "Hey night owl", "Hi %s",
                    "Burning the midnight oil, %s?", "Quiet hours, %s");
        }

        List<String> notes = new ArrayList<>();
        // What's true right now goes in twice, so it turns up more often than the general lines.
        List<String> now = new ArrayList<>();
        if (w != null) {
            if (w.aqi >= 151) now.add("AQI is " + w.aqi + " outside. A good night to stay in.");
            else if (w.aqi >= 0 && w.aqi <= 50) now.add("The air's clean today, AQI " + w.aqi + ".");
            String cond = w.condition.toLowerCase();
            if (cond.contains("rain") || cond.contains("drizzle") || cond.contains("thunder")) {
                now.add("Rain outside. Perfect for a long movie.");
            }
            if (w.temp >= 35) now.add("It's " + w.temp + "° out there. Stay cool in here.");
            if (w.temp <= 14) now.add("A chilly " + w.temp + "°. Blanket weather.");
            if (cond.contains("clear") && h >= 18 && !w.city.isEmpty()) now.add("Clear skies over " + w.city + " tonight.");
            if (cond.contains("sunny") && !w.city.isEmpty()) now.add("Sunny in " + w.city + ". Matinee, anyone?");
        }
        if (day == Calendar.FRIDAY && h >= 17) now.add("It's Friday. You've earned a binge.");
        if (day == Calendar.SATURDAY || day == Calendar.SUNDAY) now.add("Weekend mode: on.");
        if (day == Calendar.MONDAY) now.add("Easy Monday. Something light?");
        if (topApp != null) now.add(topApp + " is usually your pick around now.");
        if (h >= 18 && h < 24) now.add("PS4 is one click away. Game night?");
        if (h >= 0 && h < 5) now.add("One more episode won't hurt. Probably.");
        notes.addAll(now);
        notes.addAll(now);

        if (h >= 5 && h < 12) {
            add(notes, "Coffee and something good to watch?", "A little something before the day gets going?",
                    "Morning news, or straight to music?", "Hope you slept well.");
        } else if (h >= 12 && h < 17) {
            add(notes, "Taking a break? You've earned it.", "A quick episode before the evening?",
                    "Hope the day's treating you well.", "Afternoon slump? Music helps.");
        } else if (h >= 17 && h < 22) {
            add(notes, "Kick back. Something good to watch tonight?", "Long day? The couch is calling.",
                    "Dinner and a show?", "Pick up where you left off?", "Feels like a movie night.",
                    "Sports, a series or a game?");
        } else {
            add(notes, "Quiet night in. Enjoy it.", "Don't stay up too late, okay?",
                    "Something calm before bed?", "The best shows are the late ones.");
        }
        add(notes, "What are we watching today?", "Your apps are right where you left them.",
                "Good to see you.", "Grab the snacks.", "Hold OK on any app to move it.",
                "Press Down for all your apps.");

        SharedPreferences p = Apps.prefs(c);
        String head = pick(heads, p, "greet_h").replace("%s", n).replace(", " + "?", "?").trim();
        if (n.isEmpty()) head = head.replace(", ", " ").replace(" ,", "").trim();
        String note = pick(notes, p, "greet_n");
        return new String[]{head, note};
    }

    /** Random pick that avoids the last two shown for this key. */
    private static String pick(List<String> pool, SharedPreferences p, String key) {
        String last = p.getString(key, "");
        List<String> fresh = new ArrayList<>();
        for (String s : pool) if (!last.contains("|" + s + "|")) fresh.add(s);
        if (fresh.isEmpty()) fresh = pool;
        String chosen = fresh.get(RANDOM.nextInt(fresh.size()));
        String[] prev = last.split("\\|");
        String keep = prev.length > 1 ? prev[prev.length - 1] : "";
        p.edit().putString(key, "|" + keep + "|" + chosen + "|").apply();
        return chosen;
    }

    private static void add(List<String> list, String... items) {
        for (String s : items) list.add(s);
    }
}
