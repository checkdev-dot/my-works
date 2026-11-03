package com.splitapp.detect

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.splitapp.notify.Intake

/** Reads each incoming SMS on the phone; only split-prone debits go further. */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        // Long messages arrive in parts; join them per sender.
        parts.groupBy { it.originatingAddress ?: "" }.forEach { (sender, msgs) ->
            val body = msgs.joinToString("") { it.messageBody ?: "" }
            // A friend's reminder can carry a sync tag; otherwise it may be a payment.
            val tags = com.splitapp.sync.SyncTag.findAll(body)
            if (tags.isNotEmpty()) com.splitapp.sync.SyncReceiver.receive(context, tags, sender)
            else DebitParser.parse(sender, body, com.splitapp.data.Settings(context).smarterDetection)?.let { Intake.receive(context, it) }
        }
    }
}
