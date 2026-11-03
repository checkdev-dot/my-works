package com.splitapp.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.Contacts
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.GroupAdd
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.splitapp.data.Group
import com.splitapp.data.ME
import com.splitapp.data.PaymentStatus
import com.splitapp.data.Person
import com.splitapp.data.SplitMode
import com.splitapp.data.Store
import com.splitapp.detect.Merchants
import com.splitapp.notify.Intake
import com.splitapp.parsePaise
import com.splitapp.rupees
import com.splitapp.time
import com.splitapp.ui.theme.BoardTheme
import com.splitapp.ui.theme.CardBoard
import com.splitapp.ui.theme.CreamBoard
import com.splitapp.ui.theme.LocalBoard
import com.splitapp.ui.theme.LocalBrand
import com.splitapp.ui.theme.NightBoard
import com.splitapp.ui.theme.Owe
import com.splitapp.ui.theme.Owed
import com.splitapp.ui.theme.money
import com.splitapp.ui.theme.numerals

/**
 * The one expense sheet, over a dimmed screen. It splits a detected payment, adds an expense by
 * hand, or edits a saved one, always as one sentence: "Paid by you · split equally".
 */
class SplitActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        Store.init(this)
        val l = Store.ledger.value
        val payment = intent.getStringExtra(Intake.EXTRA_PAYMENT)?.let { l.payment(it) }
        val existing = intent.getStringExtra(EXTRA_EXPENSE)?.let { l.expense(it) } ?: payment?.let { l.expenseFor(it.id) }
        val editor: SplitEditor
        var guessed = false
        when {
            existing != null -> editor = SplitEditor.of(existing, existing.paymentId?.let { l.payment(it) } ?: payment)
            payment != null -> {
                Intake.clear(this, payment.id)
                val guess = Store.guessFor(payment.merchantId)
                val group = l.groups.firstOrNull { it.memberIds.toSet() == guess.toSet() }
                // No history yet: list the people the user already knows, unticked, so splitting is just ticking.
                val known = l.people.take(8).map { it.id }
                editor = SplitEditor(guess.ifEmpty { known }, group?.id, payment = payment, title = Merchants.byId(payment.merchantId)?.name ?: payment.label ?: "Payment")
                if (guess.isEmpty()) known.forEach { editor.toggle(it) }
                guessed = guess.isNotEmpty()
                // Seen now: the floating card can go, and the payment waits in To split if the sheet is closed.
                if (payment.status == PaymentStatus.PENDING) Store.setStatus(payment.id, PaymentStatus.LATER)
            }
            else -> {
                val group = l.group(intent.getStringExtra(EXTRA_GROUP))
                val person = intent.getStringExtra(EXTRA_PERSON)
                editor = SplitEditor(group?.memberIds ?: listOfNotNull(person), group?.id)
            }
        }

        setContent {
            BoardTheme(NightBoard) { androidx.compose.runtime.CompositionLocalProvider(LocalBrand provides CreamBoard) {
                SheetFrame(onDismiss = ::finish) {
                    ExpenseSheet(
                        editor, guessed, editing = existing != null, onClose = ::finish,
                        onSave = {
                            val e = editor.toExpense()
                            val oldStatus = e.paymentId?.let { Store.ledger.value.payment(it)?.status }
                            Store.saveExpense(e, announce = false)
                            val n = e.shares.count { it.personId != e.paidBy }
                            Store.tell(
                                if (e.paidBy == ME) "${e.title} saved · ${rupees(editor.othersOwePayer)} from $n ${if (n == 1) "person" else "people"}"
                                else "${e.title} saved · you owe ${firstName(l.person(e.paidBy)?.name)} ${rupees(e.owed(ME))}",
                            ) { Store.undoSave(e, existing, oldStatus) }
                            finish()
                        },
                        onDelete = { Store.deleteExpense(existing!!.id); finish() },
                    )
                }
            } }
        }
    }

    companion object {
        const val EXTRA_EXPENSE = "expense"
        const val EXTRA_GROUP = "group"
        const val EXTRA_PERSON = "person"

        fun add(ctx: Context, group: String? = null, person: String? = null) =
            ctx.startActivity(Intent(ctx, SplitActivity::class.java).putExtra(EXTRA_GROUP, group).putExtra(EXTRA_PERSON, person))

        fun edit(ctx: Context, expenseId: String) = ctx.startActivity(Intent(ctx, SplitActivity::class.java).putExtra(EXTRA_EXPENSE, expenseId))

        fun split(ctx: Context, paymentId: String) = ctx.startActivity(Intent(ctx, SplitActivity::class.java).putExtra(Intake.EXTRA_PAYMENT, paymentId))
    }
}

fun firstName(name: String?) = name?.substringBefore(' ') ?: "them"

@Composable
private fun SheetFrame(onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val b = LocalBoard.current
    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f))
            .clickable(remember { MutableInteractionSource() }, indication = null, onClick = onDismiss),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier.fillMaxWidth().fillMaxHeight(0.94f)
                .background(b.ground, RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp))
                .clickable(remember { MutableInteractionSource() }, indication = null) {}
                .navigationBarsPadding().imePadding(),
        ) {
            Box(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 6.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(36.dp, 4.dp).background(b.rule, RoundedCornerShape(2.dp)))
            }
            content()
        }
    }
}

@Composable
private fun ExpenseSheet(editor: SplitEditor, guessed: Boolean, editing: Boolean, onClose: () -> Unit, onSave: () -> Unit, onDelete: () -> Unit) {
    val b = LocalBoard.current
    val ledger by Store.ledger.collectAsState()
    var editingAmount by remember { mutableStateOf<String?>(null) }
    var personEdit by remember { mutableStateOf<String?>(null) }
    var showOptions by remember { mutableStateOf(false) }
    var showPeople by remember { mutableStateOf(false) }
    var showPayer by remember { mutableStateOf(false) }
    var savingGroup by remember { mutableStateOf(false) }
    val reduceMotion = rememberReduceMotion()
    val outcome = editor.outcome
    val others = editor.lines.filter { it.personId != ME && it.included }.map { it.personId }.toSet()
    val matchesGroup = ledger.groups.any { it.memberIds.toSet() == others }
    fun nameOf(id: String) = if (id == ME) "you" else firstName(ledger.person(id)?.name)

    Column(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.weight(1f).padding(horizontal = 20.dp)) {
            item { Header(editor, onClose) }
            item {
                // The whole split as one sentence; each part is a tap target.
                Row(Modifier.fillMaxWidth().padding(top = Space.xl), verticalAlignment = Alignment.CenterVertically) {
                    Text("Paid by", style = MaterialTheme.typography.bodyLarge, color = b.muted)
                    Spacer(Modifier.width(Space.s))
                    SentenceChip(if (editor.paidBy == ME) "you" else nameOf(editor.paidBy), enabled = !editor.fromBank) { showPayer = true }
                    Spacer(Modifier.width(Space.s))
                    Text("·", style = MaterialTheme.typography.bodyLarge, color = b.muted)
                    Spacer(Modifier.width(Space.s))
                    SentenceChip(modeName(editor.mode).replaceFirstChar { it.lowercase() }) { showOptions = true }
                }
            }
            item {
                SectionLabel("Who's in", editor.lines.count { it.included }, Modifier.padding(top = Space.xl, bottom = Space.xs))
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ledger.groups.take(4).forEach { g -> GroupChip(g.name, editor.groupId == g.id) { editor.applyGroup(g) } }
                    GroupChip("People", false, Icons.Outlined.Contacts) { showPeople = true }
                }
                val times = editor.merchantId?.let { Store.timesSplitWith(it, others) } ?: 0
                Text(
                    when {
                        others.isEmpty() -> "Tick at least one friend"
                        guessed && times > 0 -> "Same as last time"
                        guessed -> "Guessed from last time"
                        else -> "Tap an amount to change it"
                    },
                    style = MaterialTheme.typography.bodySmall, color = b.muted, modifier = Modifier.padding(top = 10.dp, bottom = 12.dp),
                )
            }
            itemsIndexed(editor.lines, key = { _, it -> it.personId }) { index, line ->
                // People deal in one after another, capped so a long list never makes anyone wait.
                val appear = remember { androidx.compose.animation.core.Animatable(if (reduceMotion) 1f else 0f) }
                LaunchedEffect(Unit) { kotlinx.coroutines.delay(minOf(index, 6) * 45L); appear.animateTo(1f, tween(280)) }
                Box(Modifier.graphicsLayer { alpha = appear.value; translationY = (1 - appear.value) * 18.dp.toPx() }) {
                    val person = if (line.personId == ME) Person(ME, "You") else ledger.person(line.personId) ?: Person(line.personId, "Someone")
                    val payer = line.personId == editor.paidBy
                    PersonRow(
                        person = person,
                        included = line.included,
                        amount = outcome.amounts[line.personId] ?: 0,
                        mine = line.personId == ME,
                        detail = when {
                            !line.included -> if (payer) "Paid, but has no share" else "Left out of this one"
                            payer && line.personId == ME -> "You paid · your share"
                            payer -> "Paid · their own share"
                            editor.mode == SplitMode.SHARES -> "${line.weight} share${if (line.weight == 1) "" else "s"}"
                            editor.mode == SplitMode.PERCENT -> "${"%.0f".format(line.percent)}%"
                            line.fixedPaise != null -> "Set by you"
                            editor.paidBy == ME -> "Owes you"
                            line.personId == ME -> "You owe ${nameOf(editor.paidBy)}"
                            else -> "Owes ${nameOf(editor.paidBy)}"
                        },
                        onToggle = { if (line.personId == ME) editor.setIncludeMe(!line.included) else editor.toggle(line.personId) },
                        onName = { if (line.personId != ME) personEdit = line.personId },
                        onAmount = { editingAmount = line.personId },
                    )
                }
            }
            item {
                Row(Modifier.fillMaxWidth().padding(top = 4.dp, bottom = Space.l), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionTile(Icons.Filled.Add, "Add a person", Modifier.weight(1f)) { showPeople = true }
                    if (others.size >= 2 && !matchesGroup) ActionTile(Icons.Outlined.GroupAdd, "Save as group", Modifier.weight(1f)) { savingGroup = true }
                }
                if (editing) GhostPill("Delete expense", onDelete, Modifier.fillMaxWidth().padding(bottom = Space.l), board = b)
            }
        }
        // What this does to balances, and the check that must read ₹0, pinned above Save.
        // One bar: what this does to balances on the left, the one action on the right.
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            val un = outcome.unassignedPaise
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).padding(start = 4.dp)) {
                    if (un != 0L) {
                        Text(if (un < 0) "OVER BY ${rupees(-un)}" else "${rupees(un)} LEFT TO ASSIGN", style = MaterialTheme.typography.labelSmall, color = Owe)
                        Text(if (un > 0) "Give it to someone, or reset the split" else "Shares add up to more than the total", style = MaterialTheme.typography.bodySmall, color = b.muted)
                    } else if (editor.paidBy == ME) {
                        Text("OTHERS OWE YOU", style = MaterialTheme.typography.labelSmall, color = b.muted)
                        Text(money(rupees(editor.othersOwePayer)), style = numerals(26), color = Owed)
                    } else {
                        Text("YOU OWE ${nameOf(editor.paidBy).uppercase()}", style = MaterialTheme.typography.labelSmall, color = b.muted)
                        Text(money(rupees(outcome.amounts[ME]?.takeIf { editor.includesMe } ?: 0)), style = numerals(26), color = Owe)
                    }
                }
                PrimaryPill(if (editor.fromBank && !editing) "Split" else "Save", onSave, Modifier.width(150.dp), enabled = editor.canConfirm, board = b)
            }
        }
    }

    editingAmount?.let { id -> AmountDialog(editor, id, onClose = { editingAmount = null }) }
    personEdit?.let { id -> PersonSheet(editor, ledger.person(id), onClose = { personEdit = null }) }
    if (showOptions) SplitOptionsSheet(editor, onClose = { showOptions = false })
    if (showPeople) PeopleSheet(editor, onClose = { showPeople = false })
    if (showPayer) PayerSheet(editor, onClose = { showPayer = false })
    if (savingGroup) GroupNameDialog(onSave = { name ->
        val g = Group(Store.newId(), name, others.toList())
        Store.addGroup(g); editor.groupId = g.id; savingGroup = false
    }, onClose = { savingGroup = false })
}

/** A detected payment shows what the bank said; a hand-added one asks what and how much. */
@Composable
private fun Header(editor: SplitEditor, onClose: () -> Unit) {
    val b = LocalBoard.current
    val p = editor.payment
    Box(Modifier.fillMaxWidth().background(CardBoard.ground, RoundedCornerShape(28.dp)).padding(start = 20.dp, end = 8.dp, top = 12.dp, bottom = 20.dp)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (p != null) {
                    MerchantIcon(Merchants.byId(p.merchantId), 36.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(editor.title, style = MaterialTheme.typography.titleMedium)
                        Text("${p.bank} · ${time(p.timestamp)}", style = MaterialTheme.typography.bodySmall, color = b.muted)
                    }
                } else {
                    Text(if (editor.existing != null) "Edit expense" else "Add expense", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                }
                IconButton(onClose) { Icon(Icons.Filled.Close, "Close without saving") }
            }
            if (p != null) {
                Text(money(rupees(editor.totalPaise)), style = numerals(48), modifier = Modifier.padding(top = Space.l))
            } else {
                var amount by remember { mutableStateOf(if (editor.totalPaise > 0) rupees(editor.totalPaise, symbol = false).replace(",", "") else "") }
                Column(Modifier.padding(end = 12.dp, top = Space.m), verticalArrangement = Arrangement.spacedBy(Space.m)) {
                    OutlinedTextField(
                        editor.title, { editor.title = it }, label = { Text("What was it for?") }, placeholder = { Text("Dinner, cab, tickets…") }, singleLine = true,
                        shape = WellShape, colors = wellColors(b.paint), modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        amount, { amount = it; editor.totalPaise = parsePaise(it) ?: 0 }, label = { Text("Total") }, prefix = { Text("₹") }, singleLine = true,
                        textStyle = numerals(28), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        shape = WellShape, colors = wellColors(b.paint), modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

/** One blank in the sentence: underlined text with a small arrow, like a fill-in-the-blank. */
@Composable
private fun SentenceChip(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    val b = LocalBoard.current
    Row(
        Modifier.background(Color.White.copy(alpha = if (enabled) 0.09f else 0.04f), RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(start = 12.dp, end = if (enabled) 6.dp else 12.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = MaterialTheme.typography.titleMedium, color = b.paint)
        if (enabled) Icon(Icons.Filled.ArrowDropDown, null, tint = b.muted)
    }
}

/** Who paid: anyone in the expense, the user first. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PayerSheet(editor: SplitEditor, onClose: () -> Unit) {
    val b = LocalBoard.current
    val ledger by Store.ledger.collectAsState()
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Color(0xFF151716), contentColor = b.paint, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(Space.s)) {
            Text("Who paid?", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = Space.s))
            (listOf(ME) + editor.lines.map { it.personId }.filter { it != ME }).forEach { id ->
                val on = editor.paidBy == id
                Tile(Modifier.fillMaxWidth().clickable(role = Role.RadioButton) { editor.paidBy = id; onClose() }, accent = if (on) b.paint else null) {
                    Row(Modifier.padding(Space.m), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(if (id == ME) "You" else ledger.person(id)?.name ?: "?", 36.dp)
                        Spacer(Modifier.width(Space.m))
                        Text(if (id == ME) "You" else ledger.person(id)?.name ?: "Someone", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        if (on) Text("Paid", style = MaterialTheme.typography.labelLarge, color = b.muted)
                    }
                }
            }
            Text("Add someone to the expense first to pick them here.", style = MaterialTheme.typography.bodySmall, color = b.muted, modifier = Modifier.padding(top = Space.s))
        }
    }
}

fun modeName(m: SplitMode) = when (m) {
    SplitMode.EQUAL, SplitMode.EXACT -> "Split equally"; SplitMode.SHARES -> "Split by shares"; SplitMode.PERCENT -> "Split by %"
}

@Composable
private fun GroupChip(label: String, selected: Boolean, icon: androidx.compose.ui.graphics.vector.ImageVector? = null, onClick: () -> Unit) {
    val b = LocalBoard.current
    FilterChip(
        selected = selected, onClick = onClick, label = { Text(label, maxLines = 1) },
        leadingIcon = icon?.let { { Icon(it, null, Modifier.size(18.dp)) } },
        modifier = Modifier.height(40.dp),
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Color.Transparent, labelColor = b.paint, iconColor = b.paint,
            selectedContainerColor = b.plate, selectedLabelColor = b.plateInk, selectedLeadingIconColor = b.plateInk,
        ),
        border = FilterChipDefaults.filterChipBorder(true, selected, borderColor = b.rule, selectedBorderColor = b.plate),
    )
}

@Composable
private fun PersonRow(
    person: Person, included: Boolean, amount: Long, mine: Boolean, detail: String,
    onToggle: () -> Unit, onName: () -> Unit, onAmount: () -> Unit,
) {
    val b = LocalBoard.current
    val accent = LocalBrand.current
    // Lines, not boxes: the tick and the plate already carry the state.
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().height(68.dp), verticalAlignment = Alignment.CenterVertically) {
            TickKey(included, accent.ground, accent.paint, onToggle, if (included) "Leave ${person.name} out" else "Include ${person.name}")
            Spacer(Modifier.width(8.dp))
            Column(
                Modifier.weight(1f).alpha(if (included) 1f else 0.6f)
                    .clickable(enabled = !mine, role = Role.Button, onClickLabel = "Edit ${person.name}", onClick = onName)
                    .padding(vertical = 8.dp, horizontal = 4.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(person.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                }
                Text(detail, style = MaterialTheme.typography.bodySmall, color = b.muted, maxLines = 1)
            }
            if (included) {
                Plate(rupees(amount, symbol = false), mine = mine, onClick = onAmount, label = "Change ${person.name}'s share")
            } else {
                Text("—", style = numerals(28), color = b.muted, modifier = Modifier.width(92.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.06f)))
    }
}

@Composable
private fun ActionTile(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, modifier: Modifier, onClick: () -> Unit) {
    Tile(modifier.height(56.dp).clickable(role = Role.Button, onClick = onClick)) {
        Row(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Text(label, style = MaterialTheme.typography.labelLarge, maxLines = 1)
        }
    }
}
