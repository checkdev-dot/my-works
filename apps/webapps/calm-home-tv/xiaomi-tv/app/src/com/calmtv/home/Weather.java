package com.calmtv.home;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Current weather for the TV's approximate location (city from its public IP via
 * ipwho.is, weather from Open-Meteo; both free, no account). Fetched at most every
 * 30 minutes and cached, so the home screen never waits on the network.
 */
final class Weather {
    private static final long REFRESH_MS = 30 * 60 * 1000;

    /** A cached reading. */
    static final class Now {
        String symbol, condition, city;
        int temp, feels, high, low, humidity, wind;
        int aqi = -1;  // US AQI, -1 if unknown
    }

    /** AQI band name and dot colour (US AQI scale). */
    static String aqiLabel(int aqi) {
        if (aqi <= 50) return "Good";
        if (aqi <= 100) return "Moderate";
        if (aqi <= 150) return "Unhealthy for some";
        if (aqi <= 200) return "Unhealthy";
        if (aqi <= 300) return "Very unhealthy";
        return "Hazardous";
    }

    static int aqiColor(int aqi) {
        if (aqi <= 50) return 0xFF4CD964;
        if (aqi <= 100) return 0xFFFFD60A;
        if (aqi <= 150) return 0xFFFF9F0A;
        if (aqi <= 200) return 0xFFFF453A;
        if (aqi <= 300) return 0xFFBF5AF2;
        return 0xFF9B1B30;
    }

    private Weather() {}

    /** The last reading, or null if nothing has been fetched yet. */
    static Now cached(Context c) {
        String s = Apps.prefs(c).getString("weather_json", null);
        if (s == null) return null;
        try {
            JSONObject j = new JSONObject(s);
            Now n = new Now();
            n.symbol = j.getString("symbol");
            n.condition = j.getString("condition");
            n.city = j.optString("city", "");
            n.temp = j.getInt("temp");
            n.feels = j.getInt("feels");
            n.high = j.getInt("high");
            n.low = j.getInt("low");
            n.humidity = j.getInt("humidity");
            n.wind = j.getInt("wind");
            n.aqi = j.optInt("aqi", -1);
            return n;
        } catch (Exception e) {
            return null;
        }
    }

    /** Refreshes the cache if it's stale. Call off the main thread. Returns true if it changed. */
    static boolean refresh(Context c) {
        SharedPreferences p = Apps.prefs(c);
        // Fresh enough, and already has air quality (older caches don't), so nothing to do.
        if (p.getString("weather_json", "").contains("\"aqi\"")
                && System.currentTimeMillis() - p.getLong("weather_at", 0) < REFRESH_MS) return false;
        try {
            JSONObject loc = new JSONObject(get("https://ipwho.is/?fields=city,latitude,longitude"));
            double lat = loc.getDouble("latitude"), lon = loc.getDouble("longitude");
            JSONObject all = new JSONObject(get("https://api.open-meteo.com/v1/forecast?latitude=" + lat
                    + "&longitude=" + lon
                    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m"
                    + "&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto"));
            JSONObject cur = all.getJSONObject("current");
            JSONObject day = all.getJSONObject("daily");
            int code = cur.getInt("weather_code");
            boolean isDay = cur.optInt("is_day", 1) == 1;
            JSONObject j = new JSONObject();
            j.put("symbol", symbol(code, isDay));
            j.put("condition", condition(code, isDay));
            j.put("city", loc.optString("city", ""));
            j.put("temp", (int) Math.round(cur.getDouble("temperature_2m")));
            j.put("feels", (int) Math.round(cur.getDouble("apparent_temperature")));
            j.put("humidity", cur.getInt("relative_humidity_2m"));
            j.put("wind", (int) Math.round(cur.getDouble("wind_speed_10m")));
            j.put("high", (int) Math.round(day.getJSONArray("temperature_2m_max").getDouble(0)));
            j.put("low", (int) Math.round(day.getJSONArray("temperature_2m_min").getDouble(0)));
            try {
                JSONObject air = new JSONObject(get("https://air-quality-api.open-meteo.com/v1/air-quality?latitude="
                        + lat + "&longitude=" + lon + "&current=us_aqi&timezone=auto")).getJSONObject("current");
                j.put("aqi", (int) Math.round(air.getDouble("us_aqi")));
            } catch (Exception e) {
                j.put("aqi", -1);  // air quality unavailable: weather still shows
            }
            p.edit().putString("weather_json", j.toString()).putLong("weather_at", System.currentTimeMillis()).apply();
            return true;
        } catch (Exception e) {
            // Offline or service down: keep showing the last value; try again in 5 minutes.
            p.edit().putLong("weather_at", System.currentTimeMillis() - REFRESH_MS + 5 * 60 * 1000).apply();
            return false;
        }
    }

    /** WMO weather code to a symbol. */
    private static String symbol(int code, boolean day) {
        if (code == 0) return day ? "☀" : "☾";
        if (code <= 2) return day ? "⛅" : "☁";
        if (code == 3) return "☁";
        if (code == 45 || code == 48) return "🌫";
        if (code >= 51 && code <= 67 || code >= 80 && code <= 82) return "🌧";
        if (code >= 71 && code <= 77 || code == 85 || code == 86) return "❄";
        if (code >= 95) return "⛈";
        return "☁";
    }

    private static String condition(int code, boolean day) {
        if (code == 0) return day ? "Sunny" : "Clear night";
        if (code == 1) return "Mostly clear";
        if (code == 2) return "Partly cloudy";
        if (code == 3) return "Cloudy";
        if (code == 45 || code == 48) return "Foggy";
        if (code >= 51 && code <= 57) return "Drizzle";
        if (code >= 61 && code <= 67 || code >= 80 && code <= 82) return "Rain";
        if (code >= 71 && code <= 77 || code == 85 || code == 86) return "Snow";
        if (code >= 95) return "Thunderstorms";
        return "Cloudy";
    }

    private static String get(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(5000);
        con.setReadTimeout(5000);
        try (BufferedReader r = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"))) {
            StringBuilder sb = new StringBuilder();
            for (String line; (line = r.readLine()) != null; ) sb.append(line);
            return sb.toString();
        } finally {
            con.disconnect();
        }
    }

    /**
     * The connected Wi-Fi network's name, or null if not on Wi-Fi or the name is hidden
     * (Android 11 needs location permission for it; granted over ADB at setup).
     */
    @SuppressWarnings("deprecation")
    static String wifiName(Context c) {
        try {
            WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiInfo info = wm == null ? null : wm.getConnectionInfo();
            String s = info == null ? null : info.getSSID();
            if (s == null || s.contains("unknown ssid")) {
                // Second route: the older network-info record, which some Android 11 builds still fill in.
                android.net.ConnectivityManager cm = (android.net.ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
                android.net.NetworkInfo ni = cm == null ? null : cm.getActiveNetworkInfo();
                s = ni == null ? null : ni.getExtraInfo();
            }
            if (s == null || s.contains("unknown ssid") || s.isEmpty()) return null;
            if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) s = s.substring(1, s.length() - 1);
            return s.isEmpty() ? null : s;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Signal bars to light: 1..4 on Wi-Fi, 4 on Ethernet, 0 when offline. */
    static int wifiBars(Context c) {
        try {
            String s = wifi(c);
            if (s.startsWith("Offline")) return 0;
            if (s.contains("Weak")) return 1;
            if (s.contains("Fair")) return 2;
            if (s.contains("Good")) return 3;
            return 4;  // Excellent, Ethernet, or connected with unknown strength
        } catch (RuntimeException e) {
            return 0;
        }
    }

    /** Wi-Fi strength as a word, e.g. "Wi-Fi  Excellent". */
    @SuppressWarnings("deprecation")
    static String wifi(Context c) {
        // Ask the connectivity service whether we're online and how (needs no location permission,
        // unlike WifiInfo's network id, which Android 11 hides from apps without it).
        android.net.ConnectivityManager cm = (android.net.ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
        android.net.NetworkCapabilities caps = cm == null ? null : cm.getNetworkCapabilities(cm.getActiveNetwork());
        if (caps == null) return "Offline";
        if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET)) return "Ethernet";
        if (!caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)) return "Online";
        WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        WifiInfo info = wm == null ? null : wm.getConnectionInfo();
        int rssi = info == null ? -127 : info.getRssi();
        if (rssi <= -127) rssi = caps.getSignalStrength();
        if (rssi <= -127 || rssi == Integer.MIN_VALUE) return "Wi-Fi  connected";
        int level = WifiManager.calculateSignalLevel(rssi, 4);
        String[] words = {"Weak", "Fair", "Good", "Excellent"};
        return "Wi-Fi  " + words[Math.max(0, Math.min(3, level))];
    }
}
