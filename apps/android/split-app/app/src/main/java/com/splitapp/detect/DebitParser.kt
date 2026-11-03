package com.splitapp.detect

/**
 * What a bank or UPI SMS says about money leaving the account. [label] is the shop as the bank
 * wrote it ("turfnation"), kept for shops Split doesn't know.
 */
data class Debit(val amountPaise: Long, val merchant: Merchant, val bank: String, val label: String? = null) {
    val known: Boolean get() = merchant.id != Merchants.UNKNOWN
}

object DebitParser {
    private val amount = Regex("""(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)""", RegexOption.IGNORE_CASE)
    private val debitWords = Regex("""\b(debited|spent|sent|paid|debit|purchase|withdrawn)\b""", RegexOption.IGNORE_CASE)
    private val notADebit = Regex(
        """\b(otp|one time password|refund|refunded|reversed|reversal|cashback|will be debited|requested|request|due|mandate|failed|declined)\b""",
        RegexOption.IGNORE_CASE,
    )
    private val creditOnly = Regex("""\bcredited to your\b|\bhas been credited\b|\bcredited with\b""", RegexOption.IGNORE_CASE)
    // Where the shop's name sits in common bank formats: "VPA name@bank", "at NAME on", "To NAME On".
    private val shopPatterns = listOf(
        Regex("""\bvpa\s+([a-z0-9._-]{3,40})@""", RegexOption.IGNORE_CASE),
        Regex("""\bat\s+([A-Za-z0-9 &*'.-]{3,30}?)(?:\s+on\b|\.\s|\.$|,|$)""", RegexOption.IGNORE_CASE),
        Regex("""\bto\s+([A-Za-z][A-Za-z0-9 &'.-]{2,30}?)\s+on\b""", RegexOption.IGNORE_CASE),
    )

    private val banks = listOf(
        "HDFC" to listOf("hdfc"), "ICICI" to listOf("icici"), "SBI" to listOf("sbi", "state bank"),
        "Axis" to listOf("axis"), "Kotak" to listOf("kotak"), "Yes Bank" to listOf("yes bank", "yesbnk"),
        "IDFC First" to listOf("idfc"), "PNB" to listOf("pnb", "punjab national"), "Bank of Baroda" to listOf("bob", "baroda"),
        "Paytm" to listOf("paytm"), "PhonePe" to listOf("phonepe"), "Google Pay" to listOf("google pay", "gpay"),
    )

    /**
     * Returns a Debit for a real outgoing payment to a known split-prone service. With [unknownToo]
     * (smarter detection on), a payment to a shop Split doesn't know comes back too, carrying the
     * shop's name, so it can be classified instead of ignored.
     */
    fun parse(sender: String, body: String, unknownToo: Boolean = false): Debit? {
        if (notADebit.containsMatchIn(body)) return null
        if (!debitWords.containsMatchIn(body)) return null
        if (creditOnly.containsMatchIn(body) && !Regex("debited", RegexOption.IGNORE_CASE).containsMatchIn(body)) return null
        val raw = amount.find(body)?.groupValues?.get(1) ?: return null
        val paise = toPaise(raw) ?: return null
        if (paise <= 0) return null
        val bank = bankOf(body) ?: bankOf(sender) ?: "Bank"
        Merchants.match(body)?.let { return Debit(paise, it, bank) }
        if (!unknownToo) return null
        val shop = shopOf(body)?.replaceFirstChar { it.uppercase() } ?: return null
        return Debit(paise, Merchants.unknown(shop), bank, shop)
    }

    /** The shop's name as the bank wrote it, tidied: "turfnation", "Cafe Mocha". */
    fun shopOf(body: String): String? =
        shopPatterns.firstNotNullOfOrNull { it.find(body)?.groupValues?.get(1)?.trim() }
            ?.takeIf { s -> s.any(Char::isLetter) && banks.none { (_, keys) -> keys.any { s.lowercase() == it } } }

    /** The message body names the bank more reliably than the sender ID, so it is read first. */
    private fun bankOf(text: String): String? {
        val t = text.lowercase()
        return banks.firstOrNull { (_, keys) -> keys.any { t.contains(it) } }?.first
    }

    private fun toPaise(raw: String): Long? {
        val clean = raw.replace(",", "")
        val parts = clean.split(".")
        val rupees = parts[0].toLongOrNull() ?: return null
        val paise = parts.getOrNull(1)?.padEnd(2, '0')?.take(2)?.toLongOrNull() ?: 0
        return rupees * 100 + paise
    }
}
