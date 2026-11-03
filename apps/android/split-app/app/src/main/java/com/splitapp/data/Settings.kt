package com.splitapp.data

import android.content.Context

/** The user's own name and UPI ID, used in drafted messages, and which alerts a detected payment raises. */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    var upiId: String
        get() = prefs.getString("upi", "") ?: ""
        set(v) = prefs.edit().putString("upi", v.trim()).apply()

    var myName: String
        get() = prefs.getString("name", "") ?: ""
        set(v) = prefs.edit().putString("name", v.trim()).apply()

    /** Off: SMS are not read at all; nothing is detected. */
    var detect: Boolean
        get() = prefs.getBoolean("detect", true)
        set(v) = prefs.edit().putBoolean("detect", v).apply()

    /** Fallback: read bank and payment-app notifications too (needs notification access). */
    var readNotifications: Boolean
        get() = prefs.getBoolean("readNotifications", false)
        set(v) = prefs.edit().putBoolean("readNotifications", v).apply()

    /** The floating card over other apps. */
    var popup: Boolean
        get() = prefs.getBoolean("popup", true)
        set(v) = prefs.edit().putBoolean("popup", v).apply()

    /** "card" for the full floating card, "mini" for a small strip with two round buttons. */
    var popupStyle: String
        get() = prefs.getString("popupStyle", "card") ?: "card"
        set(v) = prefs.edit().putString("popupStyle", v).apply()

    /** First-run steps seen; onboarding shows once. */
    var onboarded: Boolean
        get() = prefs.getBoolean("onboarded", false)
        set(v) = prefs.edit().putBoolean("onboarded", v).apply()

    /**
     * Debits to shops Split doesn't know are kept and classified too (see ShareClassifier).
     * Off by default: it is the one feature that may send anything (a shop's name) off the phone.
     */
    var smarterDetection: Boolean
        get() = prefs.getBoolean("smarterDetection", false)
        set(v) = prefs.edit().putBoolean("smarterDetection", v).apply()

    /** The notification in the shade. */
    var notify: Boolean
        get() = prefs.getBoolean("notify", true)
        set(v) = prefs.edit().putBoolean("notify", v).apply()
}
