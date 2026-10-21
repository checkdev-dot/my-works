package com.calmtv.home;

import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.TypefaceSpan;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Quietly emphasises the one or two words that matter in a line of small text
 * (the input, the button to press, a number), in medium weight rather than full bold,
 * so the eye catches them without the line getting loud.
 */
final class Emph {
    private static final Pattern KEY = Pattern.compile(
            "HDMI ?\\d+|\\bOK\\b|\\bBack\\b|\\bDown\\b|AQI \\d+|\\d+°|\\d+ (?:min|h|hours?|days?) ago");
    private static final int MAX = 2;

    private Emph() {}

    static CharSequence key(CharSequence text) {
        if (text == null || text.length() == 0) return text;
        SpannableString s = null;
        Matcher m = KEY.matcher(text);
        int n = 0;
        while (n < MAX && m.find()) {
            if (s == null) s = new SpannableString(text);
            s.setSpan(new TypefaceSpan("sans-serif-medium"), m.start(), m.end(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            // Full white: the rest of the line is drawn a touch softer, so these stand out.
            s.setSpan(new android.text.style.ForegroundColorSpan(0xFFFFFFFF), m.start(), m.end(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            n++;
        }
        return s == null ? text : s;
    }
}
