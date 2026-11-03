package com.splitapp.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings as AndroidSettings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.splitapp.BuildConfig
import kotlinx.coroutines.launch
import androidx.compose.animation.animateContentSize
import com.splitapp.data.ME
import com.splitapp.data.Payment
import com.splitapp.data.Settings
import com.splitapp.data.Store
import com.splitapp.day
import com.splitapp.detect.DebitParser
import com.splitapp.detect.Merchants
import com.splitapp.notify.Intake
import com.splitapp.rupees
import com.splitapp.split.Balances
import com.splitapp.time
import com.splitapp.ui.theme.AppTheme
import com.splitapp.ui.theme.CardBoard
import com.splitapp.ui.theme.Night
import com.splitapp.ui.theme.NightBoard
import com.splitapp.ui.theme.Owe
import com.splitapp.ui.theme.Owed
import com.splitapp.ui.theme.money
import com.splitapp.ui.theme.numerals

/** Home: what's waiting to be split, who owes what, and the access the app needs. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // The ground is always night, so status bar icons are always light.
        enableEdgeToEdge(statusBarStyle = androidx.activity.SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        Store.init(this)
        // Test builds start full: sample people, groups and expenses, removable from Alerts.
        val prefs = getSharedPreferences("settings", MODE_PRIVATE)
        if (BuildConfig.DEBUG && !prefs.getBoolean("sample4", false)) {
            com.splitapp.data.SampleData.load(); prefs.edit().putBoolean("sample4", true).apply()
        }
        setContent {
            AppTheme {
                var onboarded by remember { mutableStateOf(Settings(this).onboarded) }
                androidx.compose.animation.Crossfade(onboarded, label = "first-run") { done -> if (done) Home() else Onboarding { onboarded = true } }
            }
        }
    }
}

@Composable
private fun Home() {
    val ctx = LocalContext.current
    val ledger by Store.ledger.collectAsState()
    var resumes by remember { mutableIntStateOf(0) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) resumes++ }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    val waiting = ledger.toSplit
    var showAlerts by remember { mutableStateOf(false) }
    var allWaiting by remember { mutableStateOf(false) }

    val snackbar = remember { SnackbarHostState() }
    val notice by Store.notice.collectAsState()
    LaunchedEffect(notice?.id) {
        val n = notice ?: return@LaunchedEffect
        // A notice older than 30 s belongs to a moment the user has left; drop it.
        if (System.nanoTime() - n.id > 30_000_000_000L) return@LaunchedEffect
        val r = snackbar.showSnackbar(n.text, actionLabel = if (n.undo != null) "Undo" else null, duration = SnackbarDuration.Short)
        if (r == SnackbarResult.ActionPerformed) n.undo?.invoke()
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbar, Modifier.padding(bottom = 88.dp)) }, containerColor = Night) { pad ->
        LivingGround(Modifier.fillMaxSize()) {
            // Three pages: Groups ← Home → People. Home: where you stand, a peek at people and groups, then payments to split.
            val list = androidx.compose.foundation.lazy.rememberLazyListState()
            val scope = androidx.compose.runtime.rememberCoroutineScope()
            // The add button shrinks to a round "+" once the list moves, so it never sits on an amount.
            val atTop by remember { androidx.compose.runtime.derivedStateOf { list.firstVisibleItemIndex == 0 && list.firstVisibleItemScrollOffset < 40 } }
            HomeList(
                PaddingValues(bottom = pad.calculateBottomPadding() + 120.dp), list,
                header = { TitleBar(onAlerts = { showAlerts = true }, resumes) },
                top = {
                    item {
                        Summary(Balances.owedToMe(ledger), Balances.iOwe(ledger), backPaise(ledger), waiting.size) {
                            scope.launch { list.animateScrollToItem((list.layoutInfo.totalItemsCount - 1).coerceAtLeast(0)) }
                        }
                    }
                },
                bottom = {
                    if (waiting.isNotEmpty()) {
                        // Compact: one line per payment, two at most until asked for more.
                        item { SectionLabel("To split", waiting.size, sectionPad()) }
                        item {
                            val shown = if (allWaiting) waiting else waiting.take(2)
                            LinePanel(Modifier.fillMaxWidth().padding(horizontal = Gutter)) { shown.forEachIndexed { i, p -> androidx.compose.runtime.key(p.id) { ToSplitLine(p, i < shown.lastIndex) } } }
                        }
                        if (waiting.size > 2) item {
                            androidx.compose.material3.TextButton({ allWaiting = !allWaiting }, Modifier.padding(start = Gutter - 12.dp)) {
                                Text(if (allWaiting) "Show fewer" else "Show all ${waiting.size}", color = NightBoard.muted)
                            }
                        }
                    } else if (ledger.expenses.isEmpty()) {
                        item { EmptyHome() }
                    }
                },
            )
            // Keeps scrolled content from running under the status bar icons.
            Spacer(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(Night))
            // The one button for adding by hand, labelled, at the thumb's corner.
            Box(Modifier.fillMaxSize().navigationBarsPadding().padding(end = Gutter, bottom = Space.xl), contentAlignment = Alignment.BottomEnd) {
                Keycap({ SplitActivity.add(ctx) }, NightBoard.plate, Modifier.height(60.dp).shadow(24.dp, RoundedCornerShape(30.dp)), radius = 30.dp, confirm = true, label = "Add expense") {
                    Row(Modifier.padding(horizontal = 18.dp).animateContentSize(), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Add, null, tint = Night, modifier = Modifier.size(24.dp))
                        if (atTop) Text("Add expense", style = MaterialTheme.typography.titleMedium, color = Night, modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        }
    }
    if (showAlerts) AlertsSheet(onClose = { showAlerts = false; resumes++ })
}

/** Everything friends have paid the user back so far: what the dial's needle measures. */
private fun backPaise(l: com.splitapp.data.Ledger): Long = l.expenses.filter { it.isPayment && it.paidBy != ME }.sumOf { it.owed(ME) }

/** Large title, and the alerts switch the user reaches for most. */
@Composable
private fun TitleBar(onAlerts: () -> Unit, refresh: Int) {
    val ctx = LocalContext.current
    val on = remember(refresh) { Settings(ctx).let { it.detect && (it.popup || it.notify) } }
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(start = Gutter, end = Gutter, top = Space.l, bottom = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Split", style = MaterialTheme.typography.headlineSmall.copy(fontSize = 26.sp), modifier = Modifier.weight(1f))
        // Until setup is finished the button says so, with a dot; after that it is just Alerts.
        val ready = remember(refresh) { setupDone(ctx) }
        Box {
            androidx.compose.material3.TextButton(onAlerts) {
                if (!ready) Box(Modifier.padding(end = 8.dp).size(7.dp).background(NightBoard.paint, CircleShape))
                Text(if (!ready) "Finish setup" else if (on) "Alerts" else "Alerts off", style = MaterialTheme.typography.labelLarge, color = NightBoard.paint)
            }
        }
    }
}

/**
 * Where the user stands, in one sentence: a smaller dial for what's owed to them, its needle at
 * how much has come back, and both totals in words. Both totals are the sum of the people rows.
 */
@Composable
private fun Summary(owed: Long, owe: Long, back: Long, toSplit: Int, onToSplit: () -> Unit) {
    val progress = if (owed + back == 0L) 0f else back.toFloat() / (owed + back)
    Column(Modifier.fillMaxWidth().padding(horizontal = Gutter), horizontalAlignment = Alignment.CenterHorizontally) {
        AmountDial(owed, Owed, height = 124.dp, progress = progress, caption = "you're owed, ${rupees(back)} paid back so far")
        // One quiet line under the figure: what it is, and the other direction.
        Row(Modifier.padding(top = Space.s), verticalAlignment = Alignment.CenterVertically) {
            Text("you're owed", style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted)
            if (owe > 0) {
                Text("   ·   you owe ", style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted)
                Text(money(rupees(owe)), style = numerals(15), color = Owe)
            }
        }
        // To split lives at the bottom; this is its signpost at the top.
        if (toSplit > 0) androidx.compose.material3.TextButton(onToSplit, Modifier.padding(top = Space.xs)) {
            Box(Modifier.size(7.dp).background(NightBoard.paint, CircleShape))
            Text("  $toSplit ${if (toSplit == 1) "payment" else "payments"} to split  ›", style = MaterialTheme.typography.labelLarge, color = NightBoard.paint)
        }
    }
}

/**
 * A payment to split, as one line in the To split panel. When Split knows who you usually split
 * this shop with, it says so and one tap saves it (with undo); "Change" opens the full sheet.
 */
@Composable
private fun ToSplitLine(p: Payment, divider: Boolean) {
    val ctx = LocalContext.current
    val ledger by Store.ledger.collectAsState()
    val m = Merchants.byId(p.merchantId)
    val usual = remember(ledger, p.id) { Store.quickLabel(p) }
    Column {
        Row(Modifier.fillMaxWidth().padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            MerchantIcon(m, 32.dp)
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(m?.name ?: p.label ?: "Payment", style = MaterialTheme.typography.titleSmall)
                Text(usual ?: "${whenShort(p.timestamp)} · who was in?", style = MaterialTheme.typography.bodySmall, color = NightBoard.muted, maxLines = 1)
            }
            Text(money(rupees(p.amountPaise)), style = numerals(16))
        }
        Row(Modifier.fillMaxWidth().padding(start = 44.dp, top = 4.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            androidx.compose.material3.TextButton({ Store.dismissPayment(p.id) }) { Text("Just me", style = MaterialTheme.typography.labelLarge, color = NightBoard.muted) }
            if (usual != null) androidx.compose.material3.TextButton({ SplitActivity.split(ctx, p.id) }) { Text("Change", style = MaterialTheme.typography.labelLarge, color = NightBoard.muted) }
            Spacer(Modifier.weight(1f))
            PrimaryPill("Split", { if (Store.quickSplit(p.id) == null) SplitActivity.split(ctx, p.id) else Intake.clear(ctx, p.id) }, Modifier.height(44.dp).width(108.dp), board = NightBoard)
        }
        if (divider) Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.06f)))
    }
}
/** Each access the app needs, asked for one at a time with the reason next to it. */
@Composable
private fun Setup() {
    val ctx = LocalContext.current
    val settings = remember { Settings(ctx) }
    var upi by remember { mutableStateOf(settings.upiId) }
    var tick by remember { mutableIntStateOf(0) }
    val perms = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { tick++ }
    fun granted(p: String) = ContextCompat.checkSelfPermission(ctx, p) == PackageManager.PERMISSION_GRANTED
    val sms = granted(Manifest.permission.RECEIVE_SMS)
    val notif = Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.POST_NOTIFICATIONS)
    val overlay = AndroidSettings.canDrawOverlays(ctx)
    val hasUpi = upi.isNotBlank()
    if (sms && notif && overlay && hasUpi) return
    androidx.compose.runtime.key(tick) {
        // Only what is still missing is shown; finished steps drop away.
        Column {
            SectionHeader("Finish setting up", modifier = Modifier.padding(bottom = Space.m))
            Panel(Color(0xFF8A938D), Modifier.fillMaxWidth().padding(bottom = Space.xl)) {
                Column(Modifier.padding(Space.l + 4.dp), verticalArrangement = Arrangement.spacedBy(Space.s)) {
                    if (!sms) SetupRow("Read payment SMS", "Spots money leaving your account for Swiggy, Zomato and the rest. Messages never leave your phone.") {
                        perms.launch(arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS))
                    }
                    if (!notif) SetupRow("Notifications", "So a payment can ask to be split even when you miss the card.") {
                        if (Build.VERSION.SDK_INT >= 33) perms.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
                    }
                    if (!overlay) SetupRow("Show the card over other apps", "Lets the split card appear right after you pay, on top of the food app.") {
                        ctx.startActivity(Intent(AndroidSettings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}")))
                    }
                    if (!hasUpi) com.splitapp.ui.theme.BoardTheme(NightBoard) {
                        var draft by remember { mutableStateOf("") }
                        UpiField(draft, { draft = it }, onSave = { settings.upiId = draft; upi = draft.trim(); Store.tell("UPI ID saved. It goes into every reminder") })
                    }
                }
            }
        }
    }
}

@Composable
private fun SetupRow(title: String, why: String, onGrant: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(why, style = MaterialTheme.typography.bodySmall, color = NightBoard.muted)
        }
        Spacer(Modifier.width(12.dp))
        PrimaryPill("Allow", onGrant, board = NightBoard, modifier = Modifier.height(44.dp))
    }
}

/** Turn detection, the floating card, the notification and smarter detection on or off, each on its own. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AlertsSheet(onClose: () -> Unit) {
    val ctx = LocalContext.current
    val settings = remember { Settings(ctx) }
    var detect by remember { mutableStateOf(settings.detect) }
    var popup by remember { mutableStateOf(settings.popup) }
    var notify by remember { mutableStateOf(settings.notify) }
    var readNotifs by remember { mutableStateOf(settings.readNotifications) }
    var smarter by remember { mutableStateOf(settings.smarterDetection) }
    var style by remember { mutableStateOf(settings.popupStyle) }
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Color(0xFF151716), shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        Column(Modifier.padding(horizontal = Gutter).padding(bottom = Space.xxl).verticalScroll(androidx.compose.foundation.rememberScrollState())) {
            androidx.compose.runtime.key(0) { Setup() }
            SectionHeader("Alerts", modifier = Modifier.padding(bottom = Space.s))
            Text("Choose how a new payment reaches you.", style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, modifier = Modifier.padding(bottom = Space.l))
            Column {
                AlertSwitch("Read payment SMS", "Spots each payment the moment the bank texts you.", detect) { detect = it; settings.detect = it }
                // Fallback for phones or builds where SMS can't be read: payment notifications instead.
                val access = remember(readNotifs) { androidx.core.app.NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName) }
                AlertSwitch(
                    "Read payment notifications",
                    if (access) "Also catches payments from bank and UPI app notifications." else "Needs notification access. Tap to allow it.",
                    readNotifs && access, enabled = detect,
                ) {
                    if (!access) ctx.startActivity(Intent(AndroidSettings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                    readNotifs = it; settings.readNotifications = it
                }
                AlertSwitch("Popup over other apps", "Appears right after you pay.", popup, enabled = detect) { popup = it; settings.popup = it }
                if (popup && detect) Row(Modifier.padding(vertical = Space.xs), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    listOf("card" to "Full card", "mini" to "Small strip").forEach { (key, label) ->
                        val sel = style == key
                        Keycap(
                            { style = key; settings.popupStyle = key }, if (sel) NightBoard.plate else Color.White.copy(alpha = 0.08f),
                            Modifier.weight(1f).height(48.dp), radius = 24.dp, lift = 3.dp,
                            lip = if (sel) Color(0xFF8C8A82) else Color.Black.copy(alpha = 0.5f), label = label,
                        ) { Text(label, style = MaterialTheme.typography.titleSmall, color = if (sel) Night else NightBoard.paint) }
                    }
                }
                AlertSwitch("Notification", "Stays in your notifications until you decide.", notify, enabled = detect) { notify = it; settings.notify = it }
            }
            SectionHeader("Smarter detection", modifier = Modifier.padding(top = Space.xxl, bottom = Space.s))
            Text(
                "Split knows Swiggy, Zomato, Blinkit, Playo and more. For shops it doesn't know, it can ask Jev, a classifier, whether a payment is usually shared.",
                style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, modifier = Modifier.padding(bottom = Space.l),
            )
            AlertSwitch(
                "Check unknown shops",
                "Sends only the shop's name, a rough amount and the time of day, like \"Turfnation · ₹1,000–2,000 · evening\". Never your message, account or bank. Off until you turn it on.",
                smarter, enabled = detect,
            ) { smarter = it; settings.smarterDetection = it }
            if (smarter) Text(
                "Jev isn't connected in this build yet. Until it is, unknown shops land quietly in To split, and Split learns from what you split or keep.",
                style = MaterialTheme.typography.bodySmall, color = NightBoard.muted, modifier = Modifier.padding(top = Space.s, start = Space.xs),
            )
            if (BuildConfig.DEBUG) {
                val ledger by Store.ledger.collectAsState()
                val sample = com.splitapp.data.SampleData.present(ledger)
                SectionHeader("Test build", modifier = Modifier.padding(top = Space.xxl, bottom = Space.s), color = NightBoard.muted)
                GhostPill(if (sample) "Clear sample data" else "Load sample data", {
                    if (sample) com.splitapp.data.SampleData.clear() else com.splitapp.data.SampleData.load()
                }, Modifier.fillMaxWidth(), board = NightBoard)
                Row(Modifier.padding(top = Space.s), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    PrimaryPill("Fake a debit SMS", {
                        val body = listOf(
                            "Rs.1,260.00 debited from A/c XX4521 on 23-10-26 to VPA zomato@hdfcbank (UPI Ref No 629812345). -HDFC Bank",
                            "Sent Rs.684.00 From ICICI Bank A/C *7781 To SWIGGY On 23/10/26 Ref 512398",
                            "INR 412.00 spent on HDFC Bank Card XX9921 on 23-Oct-26 at BLINKIT. Avl Lmt INR 82,310",
                        ).random()
                        DebitParser.parse("VM-HDFCBK", body)?.let { Intake.receive(ctx, it) }
                        onClose()
                    }, Modifier.weight(1f), board = NightBoard)
                    GhostPill("Unknown shop", {
                        DebitParser.parse("AD-ICICIB", "Rs.1,800.00 debited from A/c XX7310 to VPA turfnation@ybl on 23-Oct. Ref 771204918", unknownToo = true)
                            ?.let { Intake.receive(ctx, it) }
                        onClose()
                    }, Modifier.weight(1f), board = NightBoard)
                }
            }
        }
    }
}

@Composable
private fun AlertSwitch(title: String, sub: String, on: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    val view = androidx.compose.ui.platform.LocalView.current
    // Quiet tier: settings are lines with a hairline, not raised cards.
    Column(Modifier.fillMaxWidth().toggleable(on, enabled = enabled, role = Role.Switch) { Feel.tick(view); onChange(it) }) {
        Row(Modifier.padding(vertical = Space.l), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).graphicsLayer { alpha = if (enabled) 1f else 0.45f }) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(sub, style = MaterialTheme.typography.bodySmall, color = NightBoard.muted, modifier = Modifier.padding(top = 2.dp))
            }
            Spacer(Modifier.width(Space.m))
            KeySwitch(on, enabled)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.06f)))
    }
}

/** "3:46 pm" today, "22 Oct" before that. */
private fun whenShort(ts: Long): String =
    if (android.text.format.DateUtils.isToday(ts)) time(ts) else day(ts)

/** First use: who will be here, why, and a way to see it work right now. */
@Composable
private fun EmptyHome() {
    val ctx = LocalContext.current
    Column(Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(horizontalArrangement = Arrangement.spacedBy((-6).dp)) {
            listOf("Rahul", "Ira", "Kabir", "Meera").forEach { Avatar(it, 52.dp) }
        }
        Text("Your next shared payment shows up here", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 24.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text(
            "Pay Swiggy, Zomato, Blinkit, Zepto, District or a turf booking, and Split asks who was in. Or add an expense yourself.",
            style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp, bottom = 20.dp),
        )
        GhostPill("Send a sample payment", {
            listOf(com.splitapp.data.Person("s1", "Rahul (sample)", "9876500001"), com.splitapp.data.Person("s2", "Meera (sample)", "9876500002")).forEach(Store::upsertPerson)
            DebitParser.parse("VM-HDFCBK", "Rs.1,260.00 debited from A/c XX4521 to VPA zomato@hdfcbank (UPI Ref No 629812345). -HDFC Bank")?.let { Intake.receive(ctx, it) }
        }, board = NightBoard)
    }
}

/** All three permissions granted and a UPI ID saved. */
private fun setupDone(ctx: android.content.Context): Boolean {
    fun granted(p: String) = ContextCompat.checkSelfPermission(ctx, p) == PackageManager.PERMISSION_GRANTED
    return granted(Manifest.permission.RECEIVE_SMS) &&
        (Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.POST_NOTIFICATIONS)) &&
        AndroidSettings.canDrawOverlays(ctx) && Settings(ctx).upiId.isNotBlank()
}
