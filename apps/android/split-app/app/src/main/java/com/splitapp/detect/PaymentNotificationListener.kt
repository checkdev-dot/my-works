package com.splitapp.detect

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.splitapp.data.Settings
import com.splitapp.notify.Intake

/**
 * The fallback when SMS can't be read: bank, UPI and payment-app notifications go through the
 * same parser as SMS. Only runs when the user grants notification access and switches it on.
 */
class PaymentNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        val settings = Settings(this)
        if (!settings.detect || !settings.readNotifications) return
        val e = sbn.notification.extras
        val text = listOfNotNull(
            e.getCharSequence(Notification.EXTRA_TITLE), e.getCharSequence(Notification.EXTRA_TEXT), e.getCharSequence(Notification.EXTRA_BIG_TEXT),
        ).joinToString(" ")
        if (text.isBlank()) return
        // A friend's reminder (often a WhatsApp notification) can carry a sync tag.
        val tags = com.splitapp.sync.SyncTag.findAll(text)
        if (tags.isNotEmpty()) { com.splitapp.sync.SyncReceiver.receive(this, tags, null); return }
        DebitParser.parse(sbn.packageName, text, settings.smarterDetection)?.let { Intake.receive(this, it) }
    }
}
