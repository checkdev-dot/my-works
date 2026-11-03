package com.splitapp.sync

/**
 * Sync without a server: a short tag rides at the end of a reminder. When it reaches a friend
 * who also has the app (as an SMS, or a WhatsApp notification with notification reading on),
 * their app reads the tag and adds the matching record. Paying back sends a "paid" tag the
 * other way. People without the app just see a short code at the end of the message.
 *
 *   owe:  [split·owe·<ref>·<paise>·<label>·<from>]   "you owe <from> <paise> for <label>"
 *   paid: [split·paid·<ref>]                          "the share <ref> has been paid"
 */
sealed class SyncTag {
    data class Owe(val ref: String, val paise: Long, val label: String, val from: String) : SyncTag()
    data class Paid(val ref: String) : SyncTag()

    fun encode(): String = when (this) {
        is Owe -> "[split·owe·$ref·$paise·${clean(label)}·${clean(from)}]"
        is Paid -> "[split·paid·$ref]"
    }

    companion object {
        private val pattern = Regex("""\[split·(owe|paid)·([^·\]]+)(?:·(\d+)·([^·\]]*)·([^·\]]*))?]""")

        fun findAll(text: String): List<SyncTag> = pattern.findAll(text).mapNotNull { m ->
            val (kind, ref, paise, label, from) = m.destructured
            when (kind) {
                "owe" -> paise.toLongOrNull()?.let { Owe(ref, it, label, from) }
                else -> Paid(ref)
            }
        }.toList()

        private fun clean(s: String) = s.replace("·", " ").replace("[", "").replace("]", "").trim().take(24)
    }
}
