package com.splitapp

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** ₹1,26,000 grouping; paise only when they are not zero. */
fun rupees(paise: Long, symbol: Boolean = true): String {
    val neg = paise < 0
    val abs = kotlin.math.abs(paise)
    val r = abs / 100
    val p = abs % 100
    val s = r.toString()
    val grouped = if (s.length <= 3) s else {
        val last3 = s.takeLast(3)
        val rest = s.dropLast(3).reversed().chunked(2).joinToString(",").reversed()
        "$rest,$last3"
    }
    val body = if (p == 0L) grouped else "$grouped.${p.toString().padStart(2, '0')}"
    return (if (neg) "−" else "") + (if (symbol) "₹" else "") + body
}

fun time(ts: Long): String = SimpleDateFormat("h:mm a", Locale.ENGLISH).format(Date(ts)).lowercase()
fun day(ts: Long): String = SimpleDateFormat("d MMM", Locale.ENGLISH).format(Date(ts))

/** Reads "420", "420.5" or "1,260" typed by the user. */
fun parsePaise(text: String): Long? {
    val t = text.replace(",", "").replace("₹", "").trim()
    if (t.isEmpty()) return null
    val d = t.toBigDecimalOrNull() ?: return null
    if (d.signum() < 0) return null
    return d.movePointRight(2).toLong()
}
