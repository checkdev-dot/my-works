package com.splitapp.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.splitapp.data.Person
import com.splitapp.data.Settings
import com.splitapp.data.Store
import com.splitapp.detect.DebitParser
import com.splitapp.detect.Merchants
import com.splitapp.notify.Intake
import com.splitapp.ui.theme.Board
import com.splitapp.ui.theme.Night
import com.splitapp.ui.theme.NightBoard
import kotlinx.coroutines.delay

/**
 * First run, five short steps, every one skippable: what this is, the three permissions it
 * needs (each with its reason beside it), the UPI ID, then a sample payment so the user sees
 * the real popup within a minute. Shown once.
 */
@Composable
fun Onboarding(onDone: () -> Unit) {
    val ctx = LocalContext.current
    val settings = remember { Settings(ctx) }
    var step by remember { mutableIntStateOf(0) }
    var tick by remember { mutableIntStateOf(0) }
    val perms = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { tick++; step++ }
    fun granted(p: String) = ContextCompat.checkSelfPermission(ctx, p) == PackageManager.PERMISSION_GRANTED
    fun finish() { settings.onboarded = true; onDone() }

    LivingGround(Modifier.fillMaxSize().background(Night)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = Gutter, vertical = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Progress as the dial's own ticks: one lit per step reached.
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
                    repeat(5) { i ->
                        Box(Modifier.width(if (i == step) 22.dp else 10.dp).height(4.dp).background(if (i <= step) NightBoard.paint else NightBoard.paint.copy(alpha = 0.2f), RoundedCornerShape(2.dp)))
                    }
                }
                if (step < 4) TextButton(::finish) { Text("Set up later", color = NightBoard.muted) }
            }
            AnimatedContent(step, label = "step", transitionSpec = {
                (slideInHorizontally(tween(320)) { it / 4 } + fadeIn(tween(320))) togetherWith (slideOutHorizontally(tween(200)) { -it / 6 } + fadeOut(tween(200)))
            }, modifier = Modifier.weight(1f)) { s ->
                Column(Modifier.fillMaxSize().padding(top = 32.dp)) {
                    when (s) {
                        0 -> Step(
                            "Split the bill the moment you pay",
                            "When Swiggy, Zomato, Blinkit, District or a turf booking takes money from your account, Split asks who was in and works out each share.",
                        ) { DemoCard() }
                        1 -> Step(
                            "Let Split read payment SMS",
                            "It looks only for bank and UPI debit messages to food, grocery, dining and sports apps. Messages never leave your phone, and nothing is sent to anyone unless you press send.",
                        ) { Promise(listOf("Reads debit SMS only", "Stays on this phone", "You decide what is sent")) }
                        2 -> Step(
                            "Catch it right after you pay",
                            "A small card appears over the food app, and a notification waits if you miss it. You can turn either off later from Alerts.",
                        ) { Promise(listOf("Card over other apps", "Notification with Split, Later, Just me")) }
                        3 -> Step(
                            "Where should friends pay you?",
                            "Your UPI ID goes into every reminder so a friend can pay you in two taps. You can add it later.",
                        ) {
                            var upi by remember { mutableStateOf(settings.upiId) }
                            OutlinedTextField(
                                upi, { upi = it; settings.upiId = it }, label = { Text("Your UPI ID") }, placeholder = { Text("name@okhdfc") },
                                singleLine = true, shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        else -> Step(
                            "Try it now",
                            "Send yourself a sample payment. It works exactly like a real one: the card appears, you pick who was in, and the split is saved. The sample people are labelled so you can remove them.",
                        ) { DemoCard() }
                    }
                }
            }
            when (step) {
                0 -> PrimaryPill("Get started", { step = 1 }, Modifier.fillMaxWidth(), board = NightBoard)
                1 -> Actions(
                    primary = if (granted(Manifest.permission.RECEIVE_SMS)) "Continue" else "Allow payment SMS",
                    onPrimary = { if (granted(Manifest.permission.RECEIVE_SMS)) step = 2 else perms.launch(arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)) },
                    onSkip = { step = 2 },
                )
                2 -> Actions(
                    primary = "Allow card and notifications",
                    onPrimary = {
                        if (!AndroidSettings.canDrawOverlays(ctx)) ctx.startActivity(Intent(AndroidSettings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}")))
                        if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS)) perms.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) else step = 3
                    },
                    onSkip = { step = 3 },
                )
                3 -> Actions(primary = "Continue", onPrimary = { step = 4 }, onSkip = { step = 4 }, skipLabel = "Skip for now")
                else -> Actions(
                    primary = "Send a sample payment",
                    onPrimary = {
                        listOf(Person("s1", "Rahul (sample)", "9876500001"), Person("s2", "Meera (sample)", "9876500002"), Person("s3", "Kabir (sample)")).forEach(Store::upsertPerson)
                        DebitParser.parse("VM-HDFCBK", "Rs.1,260.00 debited from A/c XX4521 to VPA zomato@hdfcbank (UPI Ref No 629812345). -HDFC Bank")?.let { Intake.receive(ctx, it) }
                        finish()
                    },
                    onSkip = ::finish, skipLabel = "Go to home",
                )
            }
        }
    }
}

@Composable
private fun Step(title: String, body: String, visual: @Composable () -> Unit) {
    Text(title, style = MaterialTheme.typography.displaySmall)
    Text(body, style = MaterialTheme.typography.bodyLarge, color = NightBoard.muted, modifier = Modifier.padding(top = 12.dp, bottom = 32.dp))
    visual()
}

@Composable
private fun Actions(primary: String, onPrimary: () -> Unit, onSkip: () -> Unit, skipLabel: String = "Not now") {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        PrimaryPill(primary, onPrimary, Modifier.fillMaxWidth(), board = NightBoard)
        TextButton(onSkip, Modifier.fillMaxWidth().height(48.dp)) { Text(skipLabel, color = NightBoard.muted) }
    }
}

/** Plain promises, each on its own tile: the reasons, not a legal wall. */
@Composable
private fun Promise(lines: List<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        lines.forEach { line ->
            Tile(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    LiveDot(true)
                    Spacer(Modifier.width(14.dp))
                    Text(line, style = MaterialTheme.typography.titleSmall)
                }
            }
        }
    }
}

/** The product, demonstrated: a Zomato card counts up while three friends drop in to share it. */
@Composable
private fun DemoCard() {
    val board = com.splitapp.ui.theme.CardBoard
    var amount by remember { mutableLongStateOf(0L) }
    var friends by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        delay(250); amount = 126000
        repeat(3) { delay(420); friends++ }
    }
    GlowCard(board, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(24.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Zomato", style = MaterialTheme.typography.titleLarge, color = board.paint)
                    Text("HDFC · just now", style = MaterialTheme.typography.bodySmall, color = board.muted)
                }
                Row {
                    listOf("Rahul", "Meera", "Kabir").take(friends).forEachIndexed { i, n ->
                        Box(Modifier.offset(x = (-8 * i).dp)) { Avatar(n, 34.dp) }
                    }
                }
            }
            AmountDial(amount, board.paint, height = 130.dp, progress = friends / 4f)
            Text(
                if (friends == 3) "₹420 each · ₹840 comes back to you" else "Who was in?",
                style = MaterialTheme.typography.titleSmall, color = board.paint, modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}
