package com.splitapp.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.splitapp.data.Payment
import com.splitapp.data.Person
import com.splitapp.day
import com.splitapp.detect.Merchants
import com.splitapp.rupees

/** Writes the reminder and opens it in the user's messaging app. The user presses send there. */
object Messages {
    /** "I've paid you back": settles the matching records in their app, if they have it. */
    fun paidBack(person: Person, totalPaise: Long, refs: List<String>): String = buildString {
        append("Hi ${person.name.substringBefore(' ')}, I've paid you back ${rupees(totalPaise)}. Thanks!")
        if (refs.isNotEmpty()) append("\n").append(refs.joinToString(" ") { com.splitapp.sync.SyncTag.Paid(it).encode() })
    }

    /** One reminder for everything a person owes, listing what it is for. */
    fun forTotal(person: Person, totalPaise: Long, lines: List<Pair<String, Long>>, upi: String, myName: String, tags: List<com.splitapp.sync.SyncTag> = emptyList(), paidBack: Long = 0): String = buildString {
        append("Hi ${person.name.substringBefore(' ')}! You owe me ${rupees(totalPaise)} in all:")
        lines.forEach { (label, amt) -> append("\n· $label ${rupees(amt)}") }
        // After a part payment the lines add up to more than what's owed; say so, so the sum checks out.
        if (paidBack > 0) append("\n· Already paid back −${rupees(paidBack)}")
        if (upi.isNotBlank()) append("\nPay me on UPI: $upi\n").append(upiLink(upi, myName, totalPaise, "Settling up"))
        if (tags.isNotEmpty()) append("\n").append(tags.joinToString(" ") { it.encode() })
    }

    /** Opens the user's UPI app to pay someone they owe. Works because it is an intent, not a link in a message. */
    fun payOnUpi(ctx: Context, upi: String, name: String, paise: Long): Boolean = try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(upiLink(upi, name, paise, "Settling up"))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: ActivityNotFoundException) {
        false
    }

    fun upiLink(upi: String, name: String, paise: Long, note: String): String {
        val am = "${paise / 100}.${(paise % 100).toString().padStart(2, '0')}"
        return "upi://pay?pa=${Uri.encode(upi)}&pn=${Uri.encode(name.ifBlank { "Me" })}&am=$am&cu=INR&tn=${Uri.encode(note)}"
    }

    fun whatsapp(ctx: Context, phone: String?, text: String) {
        val number = phone?.let { normalise(it) }
        val intent = if (number != null) {
            Intent(Intent.ACTION_VIEW, Uri.parse("https://api.whatsapp.com/send?phone=$number&text=${Uri.encode(text)}"))
        } else {
            Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        }
        try {
            ctx.startActivity(intent.setPackage("com.whatsapp").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            share(ctx, text)
        }
    }

    fun sms(ctx: Context, phone: String?, text: String) {
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${phone ?: ""}")).putExtra("sms_body", text)
        try {
            ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            share(ctx, text)
        }
    }

    fun share(ctx: Context, text: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        ctx.startActivity(Intent.createChooser(send, "Send reminder").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** 98xxxxxxxx → 9198xxxxxxxx; keeps an existing country code. */
    fun normalise(phone: String): String? {
        val digits = phone.filter { it.isDigit() }
        return when {
            digits.length == 10 -> "91$digits"
            digits.length == 11 && digits.startsWith("0") -> "91${digits.drop(1)}"
            digits.length >= 11 -> digits
            else -> null
        }
    }
}
