package com.splitapp.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings as AndroidSettings
import androidx.core.app.NotificationCompat
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.widget.RemoteViews
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.core.graphics.drawable.toBitmap
import com.splitapp.time
import com.splitapp.ui.theme.Board
import androidx.core.app.NotificationManagerCompat
import com.splitapp.R
import com.splitapp.data.Payment
import com.splitapp.data.PaymentStatus
import com.splitapp.data.Store
import com.splitapp.detect.Debit
import com.splitapp.detect.Merchants
import com.splitapp.rupees
import com.splitapp.ui.PopupActivity
import com.splitapp.ui.SplitActivity

/** Turns a detected debit into a payment, a notification, and the floating card. */
object Intake {
    private const val CHANNEL = "payments"
    private const val QUIET = "payments-quiet"
    const val EXTRA_PAYMENT = "payment"

    fun receive(context: Context, debit: Debit) {
        Store.init(context)
        val settings = com.splitapp.data.Settings(context)
        if (!settings.detect) return
        // The same payment often arrives twice, as an SMS and as a notification: keep the first.
        val now = System.currentTimeMillis()
        if (Store.ledger.value.payments.any { it.merchantId == debit.merchant.id && it.label == debit.label && it.amountPaise == debit.amountPaise && now - it.timestamp < 3 * 60 * 1000L }) return
        // How loudly to ask: known services and shops the user split before pop up; unsure ones wait quietly.
        val verdict = com.splitapp.detect.ShareClassifier.classify(Store.ledger.value, debit, now, settings.smarterDetection)
        val prompt = verdict.prompt
        val status = when (prompt) {
            com.splitapp.detect.ShareClassifier.Prompt.POPUP -> com.splitapp.data.PaymentStatus.PENDING
            com.splitapp.detect.ShareClassifier.Prompt.QUIET -> com.splitapp.data.PaymentStatus.LATER
            com.splitapp.detect.ShareClassifier.Prompt.SKIP -> com.splitapp.data.PaymentStatus.SKIPPED
        }
        val p = Payment(Store.newId(), debit.merchant.id, debit.amountPaise, debit.bank, now, status, debit.label)
        Store.addPayment(p)
        if (prompt != com.splitapp.detect.ShareClassifier.Prompt.POPUP) return
        // The card over other apps needs "display over other apps"; the notification always works.
        val card = settings.popup && AndroidSettings.canDrawOverlays(context)
        // With the card on screen the notification arrives quietly, so it never covers the card.
        if (settings.notify) notify(context, p, quiet = card)
        if (card) {
            context.startActivity(
                Intent(context, PopupActivity::class.java)
                    .putExtra(EXTRA_PAYMENT, p.id)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
            )
        }
    }

    fun notify(context: Context, p: Payment, quiet: Boolean = false) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Detected payments", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Asks whether to split a payment right after it happens"
        })
        nm.createNotificationChannel(NotificationChannel(QUIET, "Detected payments, card shown", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Used when the card is already on screen, so the notification does not pop over it"
        })
        val m = Merchants.byId(p.merchantId)
        val name = m?.name ?: p.label ?: "Payment"
        val split = PendingIntent.getActivity(
            context, p.id.hashCode(),
            Intent(context, SplitActivity::class.java).putExtra(EXTRA_PAYMENT, p.id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notShared = PendingIntent.getBroadcast(
            context, p.id.hashCode() + 1,
            Intent(context, NotSharedReceiver::class.java).putExtra(EXTRA_PAYMENT, p.id),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val later = PendingIntent.getBroadcast(
            context, p.id.hashCode() + 2,
            Intent(context, LaterReceiver::class.java).putExtra(EXTRA_PAYMENT, p.id),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        // Neutral like the card in the app; the brand stays in the icon.
        val board = com.splitapp.ui.theme.CardBoard
        val icon = merchantBitmap(context, m?.packageName, name, board)
        fun views(layout: Int) = RemoteViews(context.packageName, layout).apply {
            setTextViewText(R.id.title, name)
            setTextViewText(R.id.sub, "${p.bank} · ${time(p.timestamp)} · split it?")
            setTextViewText(R.id.amount, rupees(p.amountPaise))
            setTextColor(R.id.title, board.paint.toArgb())
            setTextColor(R.id.amount, board.paint.toArgb())
            setTextColor(R.id.sub, board.muted.toArgb())
            setImageViewBitmap(R.id.icon, icon)
            if (Build.VERSION.SDK_INT >= 31) setColorStateList(R.id.root, "setBackgroundTintList", ColorStateList.valueOf(board.ground.toArgb()))
            else setInt(R.id.root, "setBackgroundColor", board.ground.toArgb())
        }
        // Collapsed: name and amount only; the bank, time and question live in the expanded view.
        // Collapsed: one line, the name and the question, then the amount; details live in the expanded view.
        val small = views(R.layout.notif_payment).apply {
            setViewVisibility(R.id.sub, android.view.View.GONE)
            setTextViewText(R.id.title, "$name · Split?")
        }
        val big = views(R.layout.notif_payment_big).apply {
            setTextViewText(R.id.hint, "Was this shared?")
            setTextColor(R.id.hint, board.muted.toArgb())
        }
        val n = NotificationCompat.Builder(context, if (quiet) QUIET else CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_plate)
            .setColor((m?.brandArgb ?: 0xFF1B5A45).toInt())
            .setContentTitle("${rupees(p.amountPaise)} on $name")
            .setContentText("Paid from ${p.bank}. Split it with friends?")
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setCustomHeadsUpContentView(small)
            .setContentIntent(split)
            .setAutoCancel(true)
            .addAction(0, "Split", split)
            .addAction(0, "Later", later)
            .addAction(0, "Just me", notShared)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(p.id.hashCode(), n) }
    }

    /** A plain notice for something a friend's app sent; quiet, so it never interrupts. */
    fun syncNote(context: Context, title: String, text: String) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("sync", "From friends on the app", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(context, 7, Intent(context, com.splitapp.ui.MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        try {
            NotificationManagerCompat.from(context).notify(
                title.hashCode(),
                NotificationCompat.Builder(context, "sync").setSmallIcon(R.drawable.ic_stat_plate)
                    .setContentTitle(title).setContentText(text).setContentIntent(open).setAutoCancel(true).build(),
            )
        } catch (e: Exception) {
            android.util.Log.w("Split", "sync notice failed", e)
        }
    }

    fun clear(context: Context, paymentId: String) {
        NotificationManagerCompat.from(context).cancel(paymentId.hashCode())
    }
}

/** The real app icon from the phone, or a lettered plate in the brand colours when the app is not installed. */
private fun merchantBitmap(context: Context, pkg: String?, name: String, board: Board): Bitmap {
    val px = (48 * context.resources.displayMetrics.density).toInt()
    pkg?.let { runCatching { return context.packageManager.getApplicationIcon(it).toBitmap(px, px) } }
    val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = board.plate.toArgb() }
    c.drawRoundRect(RectF(0f, 0f, px.toFloat(), px.toFloat()), px * 0.25f, px * 0.25f, paint)
    paint.apply { color = board.plateInk.toArgb(); textSize = px * 0.55f; textAlign = Paint.Align.CENTER; typeface = Typeface.DEFAULT_BOLD }
    c.drawText(name.take(1), px / 2f, px / 2f - (paint.descent() + paint.ascent()) / 2, paint)
    return bmp
}

class LaterReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(Intake.EXTRA_PAYMENT) ?: return
        Store.init(context)
        Store.setStatus(id, PaymentStatus.LATER)
        Intake.clear(context, id)
    }
}

class NotSharedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(Intake.EXTRA_PAYMENT) ?: return
        Store.init(context)
        Store.setStatus(id, PaymentStatus.DISMISSED)
        Intake.clear(context, id)
    }
}
