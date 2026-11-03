package com.splitapp.ui

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.TextButton
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.splitapp.data.Payment
import com.splitapp.data.PaymentStatus
import com.splitapp.data.Store
import com.splitapp.detect.Merchants
import com.splitapp.notify.Intake
import com.splitapp.rupees
import com.splitapp.time
import com.splitapp.ui.theme.Board
import com.splitapp.ui.theme.BoardTheme
import com.splitapp.ui.theme.LocalBoard
import com.splitapp.ui.theme.numerals
import com.splitapp.ui.theme.money

/** The small card that floats over whatever app is open. The app behind stays usable. */
class PopupActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Store.init(this)
        window.setGravity(Gravity.TOP)
        window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT)
        window.addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH)
        window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)

        val p = intent.getStringExtra(Intake.EXTRA_PAYMENT)?.let { Store.ledger.value.payment(it) }
        if (p == null) { finish(); return }
        // Neutral card; the brand colour stays in the small icon.
        val board = com.splitapp.ui.theme.CardBoard
        setContent {
            // Once the payment is handled anywhere else (home, notification), the card leaves.
            val status = Store.ledger.collectAsState().value.payment(p.id)?.status
            // After a one-tap split the card stays a moment to confirm, with undo, then leaves.
            var saved by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<String?>(null) }
            LaunchedEffect(status, saved) { if (saved == null && status != PaymentStatus.PENDING) finish() }
            LaunchedEffect(saved) { if (saved != null) { kotlinx.coroutines.delay(3500); finish() } }
            val mini = remember { com.splitapp.data.Settings(this).popupStyle == "mini" }
            // Drops in from the top edge with a little bounce, like a card dealt onto the table.
            val shown = remember { MutableTransitionState(false).apply { targetState = true } }
            val notShared = { Store.dismissPayment(p.id); Intake.clear(this, p.id); finish() }
            val usual = remember { Store.quickLabel(p) }
            val open = {
                startActivity(Intent(this, SplitActivity::class.java).putExtra(Intake.EXTRA_PAYMENT, p.id))
                finish()
            }
            // Faster than any form: the usual people, equal shares, saved without opening the app.
            var made by remember { mutableStateOf<com.splitapp.data.Expense?>(null) }
            val split = { val e = if (usual != null) Store.quickSplit(p.id) else null; if (e != null) { Intake.clear(this, p.id); made = e; saved = usual } else open() }
            BoardTheme(board) {
                AnimatedVisibility(
                    shown,
                    enter = slideInVertically(spring(dampingRatio = 0.62f, stiffness = 380f)) { -it } + fadeIn(),
                ) {
                    val s = saved
                    // Undo reverses exactly this split, then opens the sheet to do it differently.
                    if (s != null) SavedCard(s, onUndo = { made?.let { Store.undoSave(it, null, PaymentStatus.LATER) }; open() })
                    else if (mini) MiniStrip(p, onNotShared = notShared, onSplit = split)
                    else PaymentCard(p, usual, onNotShared = notShared, onLater = { Store.setStatus(p.id, PaymentStatus.LATER); finish() }, onChange = open, onSplit = split)
                }
            }
        }
    }
}

@Composable
fun PaymentCard(p: Payment, usual: String?, onNotShared: () -> Unit, onLater: () -> Unit, onChange: () -> Unit, onSplit: () -> Unit) {
    val b = LocalBoard.current
    val m = Merchants.byId(p.merchantId)
    GlowCard(b, Modifier.windowInsetsPadding(WindowInsets.statusBars).fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), radius = 28.dp, glow = false) {
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MerchantIcon(m)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(m?.name ?: p.label ?: "Payment", style = MaterialTheme.typography.titleMedium, color = b.paint, maxLines = 1)
                    // The guess, said plainly, so one tap is a decision the user can see.
                    if (usual != null) TextButton(onChange, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp), modifier = Modifier.height(24.dp)) {
                        Text("$usual · change", style = MaterialTheme.typography.bodySmall, color = b.muted, maxLines = 1)
                    } else Text("${p.bank} · ${time(p.timestamp)}", style = MaterialTheme.typography.bodySmall, color = b.muted, maxLines = 1)
                }
                Text(money(rupees(p.amountPaise)), style = numerals(30), color = b.paint)
            }
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GhostPill("Just me", onNotShared, Modifier.weight(1f), board = b)
                GhostPill("Later", onLater, Modifier.weight(0.85f), board = b)
                PrimaryPill("Split", onSplit, Modifier.weight(1.15f), board = b)
            }
        }
    }
}

/** The card after a one-tap split: what was saved, and the way back. */
@Composable
fun SavedCard(what: String, onUndo: () -> Unit) {
    val b = LocalBoard.current
    GlowCard(b, Modifier.windowInsetsPadding(WindowInsets.statusBars).fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), radius = 28.dp, glow = false) {
        Row(Modifier.padding(horizontal = 20.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Check, null, tint = com.splitapp.ui.theme.Owed)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Split saved", style = MaterialTheme.typography.titleMedium, color = b.paint)
                Text(what, style = MaterialTheme.typography.bodySmall, color = b.muted, maxLines = 1)
            }
            TextButton(onUndo) { Text("Undo · change", color = b.paint) }
        }
    }
}
/** The small version, like a gate-visitor alert: who, how much, and two round answers. */
@Composable
fun MiniStrip(p: Payment, onNotShared: () -> Unit, onSplit: () -> Unit) {
    val b = LocalBoard.current
    val m = Merchants.byId(p.merchantId)
    GlowCard(b, Modifier.windowInsetsPadding(WindowInsets.statusBars).fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), radius = 36.dp, glow = false) {
        Row(Modifier.padding(start = 10.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            MerchantIcon(m, 40.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(money(rupees(p.amountPaise)), style = numerals(28), color = b.paint, maxLines = 1)
                Text("${m?.name ?: p.label ?: "Payment"} · shared?", style = MaterialTheme.typography.bodySmall, color = b.muted, maxLines = 1)
            }
            Keycap(onNotShared, b.paint.copy(alpha = 0.16f), Modifier.size(52.dp), radius = 26.dp, lip = Color.Black.copy(alpha = 0.35f), label = "Just me") {
                Icon(Icons.Filled.Close, "Just me", tint = b.paint)
            }
            Spacer(Modifier.width(8.dp))
            Keycap(onSplit, b.plate, Modifier.size(52.dp), radius = 26.dp, confirm = true, label = "Split") {
                Icon(Icons.Filled.Check, "Split", tint = b.plateInk)
            }
        }
    }
}