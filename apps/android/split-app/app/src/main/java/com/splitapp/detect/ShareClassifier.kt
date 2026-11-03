package com.splitapp.detect

import com.splitapp.data.Ledger
import com.splitapp.data.PaymentStatus
import java.util.Calendar

/**
 * Decides how loudly a new payment asks to be split. Three sources, cheapest first:
 *
 * 1. Rules, on the phone: a known split-prone service (Swiggy, Zomato, Playo…) is shared.
 * 2. Learning, on the phone: for a shop seen before, what the user did with it last time
 *    (split it, or kept it as "Just me").
 * 3. Jev, only with smarter detection on, only for a shop with no history: a hosted classifier
 *    asked three fixed questions about the shop's name and a rough amount. Nothing else is sent.
 *
 * The answer sets the prompt: likely shared pops up; unsure waits quietly in To split; unlikely
 * is kept out of the way (still findable, never deleted).
 */
object ShareClassifier {
    enum class Source { RULES, LEARNED, JEV, UNSURE }
    enum class Prompt { POPUP, QUIET, SKIP }

    data class Verdict(val shared: Double, val source: Source, val kind: String? = null, val likelihood: Int? = null) {
        val prompt: Prompt get() = when {
            shared >= 0.75 -> Prompt.POPUP
            shared >= 0.40 -> Prompt.QUIET
            else -> Prompt.SKIP
        }
    }

    /** The kinds of place Jev picks from; the same words the app uses for categories. */
    val kinds = listOf("Food delivery", "Quick commerce", "Dining out", "Sports & venues", "Events", "Rides", "Personal shopping", "Bills", "Transfer to a person")

    /**
     * Exactly what would leave the phone for one check, and nothing more: the shop's name, an
     * amount band and a part of the day. Never the message, account, reference or bank.
     */
    data class JevRequest(val shop: String, val amountBand: String, val partOfDay: String) {
        /** The three questions, one per answer type Jev supports. */
        val questions: List<Pair<String, String>> get() = listOf(
            "Is a payment to \"$shop\" ($amountBand, $partOfDay) usually shared with friends?" to "yes/no",
            "What kind of place is \"$shop\"?" to "pick: ${kinds.joinToString(" / ")}",
            "How likely is this payment to be split, 0 to 10?" to "score 0-10",
        )
    }

    /** The connection to the hosted classifier. Not connected in this build: there is no key or documented API yet. */
    fun interface Jev { fun ask(request: JevRequest): Verdict? }
    var jev: Jev = Jev { null }

    fun classify(l: Ledger, debit: Debit, timestamp: Long, smarter: Boolean): Verdict {
        if (debit.known) return Verdict(0.95, Source.RULES, debit.merchant.category.name)
        learned(l, debit.label)?.let { return it }
        if (smarter) jev.ask(requestFor(debit, timestamp))?.let { return it.copy(source = Source.JEV) }
        // Nobody knows yet: ask quietly, and learn from the answer.
        return Verdict(0.5, Source.UNSURE)
    }

    /** What the user did with this shop before: split it (shared) or "Just me" (not). */
    fun learned(l: Ledger, label: String?): Verdict? {
        if (label.isNullOrBlank()) return null
        val past = l.payments.filter { it.label.equals(label, ignoreCase = true) && (it.status == PaymentStatus.SPLIT || it.status == PaymentStatus.DISMISSED) }
        if (past.isEmpty()) return null
        val split = past.count { it.status == PaymentStatus.SPLIT }
        // A small prior so one answer leans but doesn't lock: 1 split of 1 -> 0.67, 3 of 3 -> 0.8.
        // Only three or more "Just me" answers keep a shop out of the way; fewer still ask quietly.
        val p = (split + 1.0) / (past.size + 2.0)
        return Verdict(if (past.size < 3) maxOf(p, 0.4) else p, Source.LEARNED)
    }

    fun requestFor(debit: Debit, timestamp: Long): JevRequest {
        val rs = debit.amountPaise / 100
        val band = when {
            rs < 200 -> "under ₹200"; rs < 500 -> "₹200–500"; rs < 1000 -> "₹500–1,000"
            rs < 2000 -> "₹1,000–2,000"; rs < 5000 -> "₹2,000–5,000"; else -> "over ₹5,000"
        }
        val hour = Calendar.getInstance().apply { timeInMillis = timestamp }.get(Calendar.HOUR_OF_DAY)
        val part = when (hour) { in 5..11 -> "morning"; in 12..16 -> "afternoon"; in 17..21 -> "evening"; else -> "night" }
        return JevRequest(debit.label ?: debit.merchant.name, band, part)
    }
}
