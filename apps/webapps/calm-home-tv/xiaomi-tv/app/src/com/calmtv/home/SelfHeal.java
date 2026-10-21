package com.calmtv.home;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.text.TextUtils;

/**
 * Keeps the Home-button service running. Android drops an accessibility service
 * when its app is force-stopped; rewriting the setting makes it bind again.
 * Needs WRITE_SECURE_SETTINGS (granted once over ADB); does nothing without it.
 */
public class SelfHeal extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        ensureWatcher(c);
    }

    static void ensureWatcher(Context c) {
        if (c.checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS") != PackageManager.PERMISSION_GRANTED) return;
        // "Enabled" isn't enough: after a force-stop the system keeps it enabled but marks it crashed.
        if (HomeWatcher.running) return;
        String me = new ComponentName(c, HomeWatcher.class).flattenToString();
        String current = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        StringBuilder others = new StringBuilder();
        if (!TextUtils.isEmpty(current)) {
            for (String s : current.split(":")) {
                if (s.isEmpty() || s.equals(me) || s.endsWith("/.HomeWatcher") && s.startsWith(c.getPackageName())) continue;
                if (others.length() > 0) others.append(':');
                others.append(s);
            }
        }
        String without = others.toString();
        String with = without.isEmpty() ? me : without + ":" + me;
        // Writing it out and back in makes the system bind the service again.
        Settings.Secure.putString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, without);
        Settings.Secure.putString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, with);
        Settings.Secure.putInt(c.getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, 1);
    }
}
