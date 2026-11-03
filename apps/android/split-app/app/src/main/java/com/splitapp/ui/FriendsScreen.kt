package com.splitapp.ui

import androidx.compose.foundation.background
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.CurrencyRupee
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.Sms
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import com.splitapp.ui.theme.Owed
import com.splitapp.ui.theme.Owe
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.splitapp.data.Expense
import com.splitapp.data.Group
import com.splitapp.data.Ledger
import com.splitapp.data.ME
import com.splitapp.data.Person
import com.splitapp.data.Settings
import com.splitapp.data.Store
import com.splitapp.day
import com.splitapp.detect.Merchants
import com.splitapp.parsePaise
import com.splitapp.rupees
import com.splitapp.split.Balance
import com.splitapp.split.Balances
import com.splitapp.split.GroupBalance
import com.splitapp.sync.SyncTag
import com.splitapp.ui.theme.AppTheme
import com.splitapp.ui.theme.BoardTheme
import com.splitapp.ui.theme.Night
import com.splitapp.ui.theme.NightBoard
import com.splitapp.ui.theme.money
import com.splitapp.ui.theme.moneyColor
import com.splitapp.ui.theme.numerals
import kotlin.math.abs

/** Shared spacing for the one home screen: generous gutters and a long breath between sections. */
val Gutter = 24.dp
fun sectionPad() = Modifier.padding(start = Gutter, end = Gutter, top = Space.xxxl, bottom = Space.l)
private val SheetColor = Color(0xFF151716)

/** "owes you", "you owe", "settled up": direction is always in words, colour only repeats it. */
fun direction(net: Long, them: String = "") = when {
    net > 0 -> if (them.isBlank()) "owes you" else "$them owes you"
    net < 0 -> if (them.isBlank()) "you owe" else "You owe $them"
    else -> "settled up"
}

/**
 * Home is three pages you swipe between: Groups ← Home → People. Home stays short (where you
 * stand, a peek at the biggest balances, payments to split); each side page holds the whole list
 * with its own search and quick filters, so a lot of people or groups never crowd home.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HomeList(
    contentPadding: PaddingValues,
    state: androidx.compose.foundation.lazy.LazyListState,
    header: @Composable () -> Unit,
    top: LazyListScope.() -> Unit,
    bottom: LazyListScope.() -> Unit,
) {
    val ledger by Store.ledger.collectAsState()
    val people = remember(ledger) {
        val b = Balances.people(ledger).associateBy { it.personId }
        ledger.people.map { it to (b[it.id]?.net ?: 0L) }
    }
    val open = people.filter { it.second != 0L }.sortedByDescending { abs(it.second) }
    val groups = remember(ledger) { Balances.groups(ledger).sortedWith(compareByDescending<GroupBalance> { abs(it.myNet) }.thenByDescending { it.expenses.firstOrNull()?.timestamp ?: 0 }) }
    var person by remember { mutableStateOf<String?>(null) }
    var group by remember { mutableStateOf<String?>(null) }
    var addingPerson by remember { mutableStateOf(false) }
    var addingGroup by remember { mutableStateOf(false) }
    val pager = rememberPagerState(initialPage = 1) { 3 }
    val scope = rememberCoroutineScope()
    val go = { page: Int -> scope.launch { pager.animateScrollToPage(page) }; Unit }

    Column(Modifier.fillMaxSize()) {
        header()
        PagerTabs(pager, listOf("Groups", "Home", "People")) { go(it) }
        HorizontalPager(pager, Modifier.fillMaxWidth().weight(1f), beyondViewportPageCount = 1) { page ->
            when (page) {
                0 -> GroupsPage(groups, contentPadding, onGroup = { group = it }, onAdd = { addingGroup = true })
                2 -> PeoplePage(people, contentPadding, onPerson = { person = it }, onAdd = { addingPerson = true })
                else -> LazyColumn(Modifier.fillMaxSize(), state = state, contentPadding = contentPadding) {
                    top()
                    // A peek, not the list: the three biggest balances and the two busiest groups.
                    item { SectionLabel("People", ledger.people.size, sectionPad(), onAdd = { addingPerson = true }, addLabel = "Add") }
                    if (open.isEmpty()) item {
                        Text(if (ledger.people.isEmpty()) "Add the people you split with." else "Everyone's settled up.", style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, modifier = Modifier.padding(horizontal = Gutter, vertical = Space.s))
                    }
                    if (ledger.people.isNotEmpty()) item {
                        LinePanel(Modifier.fillMaxWidth().padding(horizontal = Gutter)) {
                            open.take(3).forEach { (p, net) -> PersonLine(p, net) { person = p.id } }
                            SeeAllLine("All ${ledger.people.size} people") { go(2) }
                        }
                    }
                    item { SectionLabel("Groups", groups.size, sectionPad(), onAdd = { addingGroup = true }, addLabel = "New") }
                    if (groups.isEmpty()) item {
                        GhostPill("Make your first group", { addingGroup = true }, Modifier.fillMaxWidth().padding(horizontal = Gutter), board = NightBoard)
                    } else item {
                        LinePanel(Modifier.fillMaxWidth().padding(horizontal = Gutter)) {
                            groups.take(2).forEach { g -> GroupLine(g) { group = g.group.id } }
                            SeeAllLine("All ${groups.size} groups") { go(0) }
                        }
                    }
                    bottom()
                }
            }
        }
    }

    if (addingPerson) AddPersonSheet(onClose = { addingPerson = false }, onOpen = { addingPerson = false; person = it })
    if (addingGroup) AddGroupSheet(onClose = { addingGroup = false })
    person?.let { id -> PersonDetail(id, onClose = { person = null }) }
    group?.let { id -> ledger.group(id)?.let { g -> GroupDetail(g, onClose = { group = null }, onPerson = { group = null; person = it }) } }
}

/** Three words under the title; a short bar under the current one follows the finger as it swipes. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PagerTabs(pager: androidx.compose.foundation.pager.PagerState, labels: List<String>, onTab: (Int) -> Unit) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = Gutter)) {
        val w = maxWidth / labels.size
        Row(Modifier.fillMaxWidth()) {
            labels.forEachIndexed { i, l ->
                val near = 1f - kotlin.math.min(1f, abs(pager.currentPage + pager.currentPageOffsetFraction - i))
                Box(Modifier.weight(1f).height(44.dp).clickable(role = Role.Tab, onClickLabel = l) { onTab(i) }, contentAlignment = Alignment.Center) {
                    Text(l, style = MaterialTheme.typography.labelLarge, color = NightBoard.paint.copy(alpha = .45f + .55f * near))
                }
            }
        }
        Box(
            Modifier.padding(top = 40.dp)
                .offset(x = w * (pager.currentPage + pager.currentPageOffsetFraction) + w / 2 - 12.dp)
                .size(24.dp, 3.dp).background(NightBoard.paint, RoundedCornerShape(2.dp)),
        )
    }
}

/**
 * The side pages answer what someone is thinking when they swipe over: "where's that one person"
 * (search, which also matches initials: "rm" finds Rahul Mehta), "who was I just with" (recent
 * faces), and "who do I chase, what do I owe" (jump buttons with totals that scroll to their
 * section). Nothing is filtered away; everything is one swipe and at most one tap from view.
 */
private fun matches(name: String, q: String): Boolean {
    val s = q.trim(); if (s.isEmpty()) return true
    if (name.contains(s, ignoreCase = true)) return true
    val initials = name.split(' ').filter { it.isNotEmpty() }.joinToString("") { it.take(1) }
    return initials.startsWith(s, ignoreCase = true)
}

private data class Section<T>(val title: String, val words: String, val color: Color, val items: List<T>, val noun: String)

@Composable
private fun SearchBox(q: String, onQ: (String) -> Unit, hint: String) {
    OutlinedTextField(
        q, onQ, placeholder = { Text(hint) }, singleLine = true,
        leadingIcon = { Icon(Icons.Filled.Search, null, tint = NightBoard.muted) },
        trailingIcon = { if (q.isNotEmpty()) androidx.compose.material3.TextButton({ onQ("") }) { Text("Clear", color = NightBoard.muted) } },
        shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth().padding(horizontal = Gutter).padding(top = Space.l),
    )
}

/** Totals that double as jumps: tap one and the list scrolls to that section. */
@Composable
private fun JumpRow(sections: List<Section<*>>, onJump: (Int) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(Space.s), modifier = Modifier.padding(top = Space.l)) {
        items(sections.size) { i ->
            val s = sections[i]
            Column(
                Modifier.clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.05f)).clickable(role = Role.Button, onClickLabel = "Jump to ${s.title}") { onJump(i) }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                // Small on top: how many and what; below: the total, in its direction's colour.
                Text("${s.items.size} ${if (s.items.size == 1) s.noun else if (s.noun == "person") "people" else s.noun + "s"} · ${s.title.lowercase()}", style = MaterialTheme.typography.labelMedium, color = NightBoard.muted)
                if (s.words.isNotEmpty()) Text(s.words, style = numerals(17), color = s.color)
            }
        }
    }
}

/** Builds the side page: search, a top row, jump totals, then each non-empty section as one panel. */
@Composable
private fun <T> SectionPage(
    contentPadding: PaddingValues, q: String, onQ: (String) -> Unit, hint: String,
    topRow: (@Composable () -> Unit)?, sections: List<Section<T>>, hits: List<Pair<T, String?>>,
    label: String, addLabel: String, onAdd: () -> Unit, empty: String, hitLine: @Composable (T, String?, Boolean) -> Unit, line: @Composable (T, Boolean) -> Unit,
) {
    var unfold by remember { mutableStateOf(false) }
    val list = androidx.compose.foundation.lazy.rememberLazyListState()
    val scope = rememberCoroutineScope()
    val shown = sections.filter { it.items.isNotEmpty() }
    LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = contentPadding) {
        item { SearchBox(q, onQ, hint) }
        if (q.isNotBlank()) {
            item { SectionLabel("Matches", hits.size, Modifier.padding(start = Gutter, end = Gutter, top = Space.xl, bottom = Space.s)) }
            item {
                if (hits.isEmpty()) Text(empty, style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, modifier = Modifier.padding(horizontal = Gutter))
                else LinePanel(Modifier.fillMaxWidth().padding(horizontal = Gutter)) { hits.forEachIndexed { i, (h, why) -> hitLine(h, why, i < hits.lastIndex) } }
            }
        } else {
            val head = if (topRow != null) 3 else 2
            if (topRow != null) item { topRow() }
            item { JumpRow(shown) { i -> scope.launch { list.animateScrollToItem(head + i * 2) } } }
            shown.forEachIndexed { k, s ->
                item { SectionLabel(if (s.words.isEmpty()) s.title else "${s.title} · ${s.words}", s.items.size, Modifier.padding(start = Gutter, end = Gutter, top = Space.xl, bottom = Space.s), onAdd = if (k == 0) onAdd else null, addLabel = addLabel) }
                item {
                    // Settled is history: five, then the rest on request.
                    val fold = s.title == "Settled" && s.items.size > 5 && !unfold
                    val rows = if (fold) s.items.take(5) else s.items
                    LinePanel(Modifier.fillMaxWidth().padding(horizontal = Gutter)) {
                        rows.forEachIndexed { i, it -> line(it, fold || i < rows.lastIndex) }
                        if (fold) SeeAllLine("Show all ${s.items.size}") { unfold = true }
                    }
                }
            }
            if (shown.isEmpty()) item { GhostPill(label, onAdd, Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = Space.xl), board = NightBoard) }
        }
    }
}

@Composable
private fun PeoplePage(people: List<Pair<Person, Long>>, contentPadding: PaddingValues, onPerson: (String) -> Unit, onAdd: () -> Unit) {
    val ledger by Store.ledger.collectAsState()
    var q by remember { mutableStateOf("") }
    // The faces of whoever you split with most recently, newest first.
    val recent = remember(ledger) {
        ledger.expenses.sortedByDescending { it.timestamp }.flatMap { e -> e.shares.map { it.personId } + e.paidBy }
            .filter { it != ME }.distinct().mapNotNull { ledger.person(it) }.take(10)
    }
    val oweYou = people.filter { it.second > 0 }.sortedByDescending { it.second }
    val youOwe = people.filter { it.second < 0 }.sortedBy { it.second }
    val settled = people.filter { it.second == 0L }.sortedBy { it.first.name }
    SectionPage(
        contentPadding, q, { q = it }, "Name, initials or a group",
        topRow = if (recent.isEmpty()) null else ({
            Column {
                Text("RECENT", style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.4.sp), color = NightBoard.muted, modifier = Modifier.padding(start = Gutter, top = Space.l, bottom = Space.s))
                LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(Space.l)) {
                    items(recent.size) { i ->
                        val p = recent[i]
                        Column(Modifier.width(56.dp).clickable(role = Role.Button, onClickLabel = "Open ${p.name}") { onPerson(p.id) }, horizontalAlignment = Alignment.CenterHorizontally) {
                            Avatar(p.name, 44.dp)
                            Text(firstName(p.name), style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = Space.xs))
                        }
                    }
                }
            }
        }),
        sections = listOf(
            Section("Owe you", rupees(oweYou.sumOf { it.second }), Owed, oweYou, "person"),
            Section("You owe", rupees(-youOwe.sumOf { it.second }), Owe, youOwe, "person"),
            Section("Settled", "", NightBoard.muted, settled, "person"),
        ),
        hits = run {
            val byName = people.filter { matches(it.first.name, q) }.sortedBy { it.first.name }.map { it to null }
            // Typing a group's name lists its members, so "Flat" finds everyone in Flat 302.
            val byGroup = ledger.groups.filter { q.isNotBlank() && it.name.contains(q.trim(), ignoreCase = true) }.flatMap { g ->
                people.filter { it.first.id in g.memberIds && byName.none { b -> b.first.first.id == it.first.id } }.map { it to "in ${g.name}" }
            }.distinctBy { it.first.first.id }
            byName + byGroup
        },
        label = "Add the people you split with", addLabel = "Add", onAdd = onAdd, empty = "No one called \"$q\", or in a group by that name.",
        hitLine = { (p, net), why, divider -> PersonLine(p, net, tag = true, divider = divider, sub = why) { onPerson(p.id) } },
    ) { (p, net), divider -> PersonLine(p, net, tag = true, divider = divider) { onPerson(p.id) } }
}

@Composable
private fun GroupsPage(groups: List<GroupBalance>, contentPadding: PaddingValues, onGroup: (String) -> Unit, onAdd: () -> Unit) {
    var q by remember { mutableStateOf("") }
    // Within each section, the group used most recently comes first.
    val recentFirst = groups.sortedByDescending { it.expenses.firstOrNull()?.timestamp ?: 0 }
    val owed = recentFirst.filter { it.myNet > 0 }; val owe = recentFirst.filter { it.myNet < 0 }; val settled = recentFirst.filter { it.myNet == 0L }
    SectionPage(
        contentPadding, q, { q = it }, "Groups, friends or spends",
        topRow = null,
        sections = listOf(
            Section("You're owed", rupees(owed.sumOf { it.myNet }), Owed, owed, "group"),
            Section("You owe", rupees(-owe.sumOf { it.myNet }), Owe, owe, "group"),
            Section("Settled", "", NightBoard.muted, settled, "group"),
        ),
        hits = run {
            val ledger = Store.ledger.value
            val s = q.trim()
            groups.mapNotNull { g ->
                when {
                    matches(g.group.name, s) -> g to null
                    else -> g.group.memberIds.mapNotNull { ledger.person(it) }.firstOrNull { matches(it.name, s) }?.let { g to "${firstName(it.name)}'s in it" }
                        ?: g.expenses.firstOrNull { !it.isPayment && it.title.contains(s, ignoreCase = true) }?.let { g to "${it.title} · ${day(it.timestamp)}" }
                }
            }
        },
        label = "Make your first group", addLabel = "New", onAdd = onAdd, empty = "No group, member or expense matches \"$q\".",
        hitLine = { g, why, divider -> GroupLine(g, divider, last = true, sub = why) { onGroup(g.group.id) } },
    ) { g, divider -> GroupLine(g, divider, last = true) { onGroup(g.group.id) } }
}
@Composable
private fun PersonLine(p: Person, net: Long, tag: Boolean = false, divider: Boolean = true, sub: String? = null, onClick: () -> Unit) {
    Line(onClick, "Open ${p.name}", divider) {
        Avatar(p.name, 36.dp)
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(p.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (tag && p.onApp) OnSplitTag(Modifier.padding(start = Space.s))
            }
            Text(sub?.let { "${direction(net)} · $it" } ?: direction(net), style = MaterialTheme.typography.bodySmall, color = NightBoard.muted, maxLines = 1)
        }
        if (net != 0L) Text(money(rupees(abs(net))), style = numerals(16), color = moneyColor(net))
    }
}

@Composable
private fun GroupLine(g: GroupBalance, divider: Boolean = true, last: Boolean = false, sub: String? = null, onClick: () -> Unit) {
    Line(onClick, "Open ${g.group.name}", divider) {
        GroupBadge(g.group, 36.dp)
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(g.group.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val recent = g.expenses.firstOrNull { !it.isPayment }
            Text(
                if (sub != null) sub else if (last && recent != null) "${recent.title} · ${day(recent.timestamp)}" else when { g.myNet > 0 -> "you're owed"; g.myNet < 0 -> "you owe"; else -> "settled up" },
                style = MaterialTheme.typography.bodySmall, color = NightBoard.muted, maxLines = 1,
            )
        }
        if (g.myNet != 0L) Text(money(rupees(abs(g.myNet))), style = numerals(16), color = moneyColor(g.myNet))
    }
}

@Composable
private fun SeeAllLine(text: String, onClick: () -> Unit) {
    Line(onClick, text, divider = false) {
        Text(text, style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = NightBoard.muted, modifier = Modifier.size(20.dp))
    }
}
/**
 * The one row shape for a person or a group: mark, name, which way the money runs in words,
 * and the amount in that direction's colour.
 */
@Composable
fun MoneyRow(name: String, net: Long, mark: @Composable () -> Unit, sub: String? = null, groupWords: Boolean = false, onSplit: Boolean = false, onClick: () -> Unit) {
    Tile(Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 6.dp).clickable(role = Role.Button, onClickLabel = "Open $name", onClick = onClick)) {
        Row(Modifier.padding(horizontal = Space.l + 2.dp, vertical = Space.l + 2.dp), verticalAlignment = Alignment.CenterVertically) {
            mark()
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (onSplit) OnSplitTag(Modifier.padding(start = Space.s))
                }
                val words = if (groupWords) when { net > 0 -> "you're owed"; net < 0 -> "you owe"; else -> "settled up" } else direction(net)
                Text(listOfNotNull(words, sub).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = NightBoard.muted, maxLines = 1)
            }
            if (net != 0L) Text(money(rupees(abs(net))), style = numerals(20), color = moneyColor(net))
        }
    }
}

/** "Today", "This week", "Earlier": activity reads as a timeline, not a pile. */
private fun bucket(ts: Long): String {
    val days = (System.currentTimeMillis() - ts) / (24 * 60 * 60 * 1000L)
    return when { android.text.format.DateUtils.isToday(ts) -> "Today"; days < 7 -> "This week"; else -> "Earlier" }
}

/** T3 activity: plain lines under date labels, so history never looks like the people you act on. */
@Composable
private fun ActivityList(list: List<Expense>, ledger: Ledger, against: String?, onOpen: (Expense) -> Unit) {
    if (list.isEmpty()) return
    list.groupBy { bucket(it.timestamp) }.forEach { (label, items) ->
        SectionLabel(label, items.size, Modifier.padding(top = Space.l))
        items.forEachIndexed { i, e -> ActivityRow(e, ledger, against, divider = i < items.lastIndex) { onOpen(e) } }
    }
}

/** One line of history: what it was, who paid, and what it did between the user and [against]. */
@Composable
private fun ActivityRow(e: Expense, ledger: Ledger, against: String?, divider: Boolean, onClick: () -> Unit) {
    fun name(id: String) = if (id == ME) "You" else firstName(ledger.person(id)?.name)
    val effect = if (against != null) e.netWith(against) else Balances.myEffect(e)
    Line(onClick, "Open ${e.title}", divider) {
        if (e.isPayment) PaymentMark() else MerchantIcon(e.merchantId?.let { Merchants.byId(it) } ?: com.splitapp.detect.Merchant("", e.title, com.splitapp.detect.Category.FOOD, 0xFF3A3E3C, emptyList()), 32.dp)
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            val to = e.shares.firstOrNull()?.personId
            Text(if (e.isPayment && to != null) "${name(e.paidBy)} paid ${name(to).let { if (it == "You") "you" else it }}" else e.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (e.isPayment) day(e.timestamp) else "${day(e.timestamp)} · ${name(e.paidBy)} paid ${rupees(e.totalPaise)}",
                style = MaterialTheme.typography.bodySmall, color = NightBoard.muted, maxLines = 1,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            val label = when {
                e.isPayment -> "paid"
                effect > 0 -> "you lent"
                effect < 0 -> "you borrowed"
                else -> if (against != null) "no change" else "not involved"
            }
            // Expenses are context, in cream; money actually paid back is the green.
            if (effect != 0L || e.isPayment) Text(money(rupees(if (e.isPayment) e.totalPaise else abs(effect))), style = numerals(17), color = if (e.isPayment) Owed else NightBoard.paint)
            Text(label, style = MaterialTheme.typography.bodySmall, color = NightBoard.muted)
        }
    }
}

/**
 * One expense, opened from any list: what it was, who paid, who owes what, and the two things
 * you can do with it. Edit opens the same sheet it was made in.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExpenseSheet(e: Expense, onClose: () -> Unit) {
    val ctx = LocalContext.current
    val ledger by Store.ledger.collectAsState()
    fun name(id: String) = if (id == ME) "You" else ledger.person(id)?.name ?: "Someone"
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = SheetColor, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        BoardTheme(NightBoard) {
            Column(Modifier.padding(horizontal = Gutter).padding(bottom = Space.xl).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(Space.s)) {
                val to = e.shares.firstOrNull()?.personId
                DetailHeader(
                    { if (e.isPayment) PaymentMark() else MerchantIcon(e.merchantId?.let { Merchants.byId(it) } ?: com.splitapp.detect.Merchant("", e.title, com.splitapp.detect.Category.FOOD, 0xFF3A3E3C, emptyList()), 52.dp) },
                    if (e.isPayment && to != null) "${name(e.paidBy)} paid ${name(to)}" else e.title,
                    listOfNotNull(day(e.timestamp), ledger.group(e.groupId)?.name).joinToString(" · "),
                    if (e.isPayment) "Paid" else "Total", e.totalPaise, if (e.isPayment) Owed else NightBoard.paint,
                )
                if (!e.isPayment) {
                    Text("${name(e.paidBy)} paid. Each share:", style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, modifier = Modifier.padding(bottom = Space.xs))
                    e.shares.forEachIndexed { i, s ->
                        Line(divider = i < e.shares.lastIndex) {
                            Avatar(name(s.personId), 28.dp)
                            Spacer(Modifier.width(Space.m))
                            Text(name(s.personId), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                            Text(money(rupees(s.amountPaise)), style = numerals(17))
                        }
                    }
                }
                Row(Modifier.padding(top = Space.l), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    GhostPill("Delete", { Store.deleteExpense(e.id); onClose() }, Modifier.weight(1f), board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.DeleteOutline)
                    if (!e.isPayment) PrimaryPill("Edit expense", { onClose(); SplitActivity.edit(ctx, e.id) }, Modifier.weight(1.4f), board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.Edit)
                }
            }
        }
    }
}

/**
 * The top of a person, group or expense: centred across the full width, mark, name, one line of
 * context, then the figure that matters in words and numerals.
 */
@Composable
private fun DetailHeader(mark: @Composable () -> Unit, title: String, sub: String, words: String, paise: Long, color: Color, tag: Boolean = false) {
    Column(Modifier.fillMaxWidth().padding(top = Space.m), horizontalAlignment = Alignment.CenterHorizontally) {
        mark()
        Row(Modifier.padding(top = Space.m), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (tag) OnSplitTag(Modifier.padding(start = Space.s))
        }
        Text(sub, style = MaterialTheme.typography.bodySmall, color = NightBoard.muted, modifier = Modifier.padding(top = 2.dp))
        Text(words, style = MaterialTheme.typography.bodyLarge, color = NightBoard.muted, modifier = Modifier.padding(top = Space.xl))
        if (paise != 0L) Text(money(rupees(paise)), style = numerals(48), color = color)
    }
}

@Composable
private fun PaymentMark() {
    Box(Modifier.size(36.dp).background(Color.White.copy(alpha = 0.08f), RoundedCornerShape(9.dp)), contentAlignment = Alignment.Center) {
        Text("₹", style = numerals(18), color = NightBoard.paint)
    }
}


/**
 * Items behind what a person owes now: walking their history oldest first, the items since the
 * balance last touched zero. These are what a reminder lists.
 */
private fun openItems(b: Balance): List<Expense> {
    val out = mutableListOf<Expense>()
    var running = 0L
    b.activity.sortedBy { it.timestamp }.forEach { e ->
        running += e.netWith(b.personId)
        if (running <= 0L) out.clear() else if (!e.isPayment && e.netWith(b.personId) > 0) out += e
    }
    return out
}

/** One person: the net, the two actions that move it, then everything shared with them. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PersonDetail(id: String, onClose: () -> Unit) {
    val ctx = LocalContext.current
    val ledger by Store.ledger.collectAsState()
    val p = ledger.person(id) ?: run { onClose(); return }
    val b = remember(ledger) { Balances.of(ledger, id) }
    val settings = remember { Settings(ctx) }
    var settling by remember { mutableStateOf(false) }
    var reminding by remember { mutableStateOf(false) }
    var opened by remember { mutableStateOf<Expense?>(null) }
    val first = firstName(p.name)
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = SheetColor, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        BoardTheme(NightBoard) {
            Column(Modifier.padding(horizontal = Gutter).padding(bottom = Space.xl).navigationBarsPadding().verticalScroll(rememberScrollState())) {
                DetailHeader(
                    { Avatar(p.name, 64.dp) }, p.name,
                    if (p.onApp) "Uses Split too · expenses sync" else "Not on Split · reminders by WhatsApp or SMS",
                    if (b.net == 0L) "All settled up" else direction(b.net, first), abs(b.net), moneyColor(b.net), tag = p.onApp,
                )
                // The actions share the full width equally.
                Row(Modifier.fillMaxWidth().padding(top = Space.xl), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    if (b.net > 0) PrimaryPill("Remind", { reminding = true }, Modifier.weight(1f), board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.NotificationsActive)
                    if (b.net < 0) PrimaryPill("Settle up", { settling = true }, Modifier.weight(1f), board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.CurrencyRupee)
                    if (b.net > 0) GhostPill("Settle up", { settling = true }, Modifier.weight(1f), board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.CurrencyRupee)
                    // With a balance, adding is a round "+" beside the two main actions, so no label gets squeezed.
                    if (b.net == 0L) GhostPill("Add expense with $first", { SplitActivity.add(ctx, person = id) }, Modifier.weight(1f), board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.Add)
                    else Keycap({ SplitActivity.add(ctx, person = id) }, NightBoard.paint.copy(alpha = 0.16f), Modifier.size(56.dp), radius = 28.dp, lip = Color.Black.copy(alpha = 0.35f), label = "Add expense with $first") {
                        Icon(androidx.compose.material.icons.Icons.Rounded.Add, "Add expense with $first", tint = NightBoard.paint)
                    }
                }
                if (b.activity.isEmpty()) Text("Nothing shared with $first yet.", style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, modifier = Modifier.padding(top = Space.xl))
                // Only what moved money between the two of you; the group screens keep the rest.
                ActivityList(b.activity.filter { it.netWith(id) != 0L }, ledger, id) { opened = it }
            }
        }
    }
    if (settling) SettleUpSheet(p, b.net, null, onClose = { settling = false })
    if (reminding) {
        val items = openItems(b)
        val listed = items.sumOf { it.netWith(id) }
        // Tags let their app add the same records; sent only when the lines add up to exactly what's owed.
        val tags = if (listed == b.net) items.map { e -> SyncTag.Owe(if (e.shares.size > 1) "${e.id}.$id" else e.id, e.netWith(id), e.title, settings.myName.ifBlank { "Friend" }) } else emptyList()
        RemindSheet(p, Messages.forTotal(p, b.net, items.map { it.title to it.netWith(id) }, settings.upiId, settings.myName, tags, paidBack = listed - b.net), onClose = { reminding = false })
    }
    opened?.let { e -> ExpenseSheet(e, onClose = { opened = null }) }
}

/**
 * Settling is a payment, not ticking off a meal: "Meera paid you ₹500". The amount starts at the
 * whole balance and can be less. When the user owes, they can open UPI to pay and then record it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettleUpSheet(p: Person, net: Long, groupId: String?, onClose: () -> Unit) {
    val ctx = LocalContext.current
    val ledger by Store.ledger.collectAsState()
    val first = firstName(p.name)
    var theyPaid by remember { mutableStateOf(net >= 0) }
    var amount by remember { mutableStateOf(rupees(abs(net), symbol = false).replace(",", "")) }
    var theirUpi by remember { mutableStateOf(p.upiId ?: "") }
    val paise = parsePaise(amount)
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = SheetColor, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        BoardTheme(NightBoard) {
            Column(Modifier.padding(horizontal = Gutter).padding(bottom = Space.xl).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(Space.l)) {
                Text("Settle up with $first", style = MaterialTheme.typography.headlineSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    listOf(true to "$first paid you", false to "You paid $first").forEach { (v, label) ->
                        FilterChip(
                            theyPaid == v, { theyPaid = v }, label = { Text(label) }, modifier = Modifier.height(44.dp),
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = NightBoard.plate, selectedLabelColor = Night),
                        )
                    }
                }
                OutlinedTextField(
                    amount, { amount = it }, label = { Text("Amount") }, prefix = { Text("₹") }, singleLine = true, textStyle = numerals(28),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth(),
                    supportingText = { Text(if (net == 0L) "You're settled up already." else "${direction(net, first)} ${rupees(abs(net))} in all.") },
                )
                if (!theyPaid) {
                    OutlinedTextField(
                        theirUpi, { theirUpi = it }, label = { Text("$first's UPI ID, to pay them") }, singleLine = true,
                        shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth(),
                    )
                    val upiOk = Regex("^[\\w.\\-]{2,}@[a-zA-Z]{2,}$").matches(theirUpi.trim())
                    GhostPill("Open UPI to pay ${paise?.let { rupees(it) } ?: ""}", {
                        Store.upsertPerson(p.copy(upiId = theirUpi.trim()))
                        if (!Messages.payOnUpi(ctx, theirUpi.trim(), p.name, paise ?: 0)) Store.tell("No UPI app found on this phone")
                    }, Modifier.fillMaxWidth(), enabled = upiOk && paise != null && paise > 0, board = NightBoard)
                }
                PrimaryPill(if (theyPaid) "Record: $first paid you" else "Record: you paid $first", {
                    Store.settleUp(if (theyPaid) p.id else ME, if (theyPaid) ME else p.id, paise!!, groupId)
                    // If their reminders came through Split, tell their app it's paid.
                    val refs = ledger.expenses.filter { it.paidBy == p.id && it.ref != null && !it.isPayment }.mapNotNull { it.ref }
                    if (!theyPaid && refs.isNotEmpty() && net < 0 && paise >= -net) Messages.whatsapp(ctx, p.phone, Messages.paidBack(p, paise, refs))
                    onClose()
                }, Modifier.fillMaxWidth(), enabled = paise != null && paise > 0, board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.CheckCircle)
                Text("This records the payment. Split never moves money.", style = MaterialTheme.typography.bodySmall, color = NightBoard.muted)
            }
        }
    }
}

/**
 * The reminder before it leaves: the message as it will read, then WhatsApp or SMS. Nothing is
 * sent from here; the messaging app opens with it filled in and the user presses send there.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RemindSheet(p: Person?, text: String, onClose: () -> Unit) {
    val ctx = LocalContext.current
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = SheetColor, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        BoardTheme(NightBoard) {
            Column(Modifier.padding(horizontal = Gutter).padding(bottom = Space.xl).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(Space.l)) {
                Text(if (p != null) "Remind ${firstName(p.name)}" else "Remind the group", style = MaterialTheme.typography.headlineSmall)
                Text(text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth().background(Color.White.copy(alpha = 0.06f), RoundedCornerShape(16.dp)).padding(Space.l))
                Row(horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    PrimaryPill("WhatsApp", { Messages.whatsapp(ctx, p?.phone, text); onClose() }, Modifier.weight(1f), board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.Chat)
                    GhostPill("SMS", { Messages.sms(ctx, p?.phone, text); onClose() }, Modifier.weight(1f), board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.Sms)
                }
                Text("Opens with the message filled in. You press send there.", style = MaterialTheme.typography.bodySmall, color = NightBoard.muted)
            }
        }
    }
}

@Composable
private fun DeletePaymentDialog(e: Expense, onClose: () -> Unit) {
    AppTheme {
        AlertDialog(
            onDismissRequest = onClose,
            title = { Text("Delete this payment?") },
            text = { Text("${rupees(e.totalPaise)} on ${day(e.timestamp)}. The balance goes back to what it was before it.") },
            confirmButton = { TextButton({ Store.deleteExpense(e.id); onClose() }) { Text("Delete") } },
            dismissButton = { TextButton(onClose) { Text("Keep") } },
        )
    }
}

/** Inside a group: where the user stands, each member against the user, then everything the group shared. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GroupDetail(g: Group, onClose: () -> Unit, onPerson: (String) -> Unit) {
    val ctx = LocalContext.current
    val ledger by Store.ledger.collectAsState()
    val gb = remember(ledger) { Balances.group(ledger, g) }
    val settings = remember { Settings(ctx) }
    var picking by remember { mutableStateOf(false) }
    var groupText by remember { mutableStateOf<String?>(null) }
    var addingMembers by remember { mutableStateOf(false) }
    var opened by remember { mutableStateOf<Expense?>(null) }
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = SheetColor, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        BoardTheme(NightBoard) {
            Column(Modifier.padding(horizontal = Gutter).padding(bottom = Space.xl).navigationBarsPadding().verticalScroll(rememberScrollState())) {
                DetailHeader(
                    { Box(Modifier.clickable(role = Role.Button, onClickLabel = "Change icon") { picking = !picking }) { GroupBadge(g, 56.dp) } },
                    g.name, "${rupees(gb.spentPaise)} spent together · ${g.memberIds.size + 1} people",
                    when { gb.myNet > 0 -> "You're owed"; gb.myNet < 0 -> "You owe"; else -> "All settled up" }, abs(gb.myNet), moneyColor(gb.myNet),
                )
                if (picking) IconPicker(GroupIcons.of(g)) { Store.setGroupIcon(g.id, it); picking = false }
                Row(Modifier.fillMaxWidth().padding(top = Space.xl), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    PrimaryPill("Add expense", { SplitActivity.add(ctx, group = g.id) }, Modifier.weight(1f), board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.Add)
                    val owing = gb.withMe.filter { it.value > 0 }
                    if (owing.isNotEmpty()) GhostPill("Remind", {
                        val text = buildString {
                            append("${g.name}: here's what's still open with me.")
                            owing.forEach { (pid, amt) -> append("\n${firstName(ledger.person(pid)?.name)} ${rupees(amt)}") }
                            if (settings.upiId.isNotBlank()) append("\nPay me on UPI: ${settings.upiId}")
                        }
                        groupText = text
                    }, Modifier.weight(1f), board = NightBoard, icon = androidx.compose.material.icons.Icons.Rounded.NotificationsActive)
                }
                // Members: their own labelled row, with the way to add more at the end.
                SectionLabel("Members", g.memberIds.size, Modifier.padding(top = Space.xxl, bottom = Space.s), onAdd = { addingMembers = true }, addLabel = "Add")
                // An even grid across the full width: face, first name, what they owe you here.
                g.memberIds.mapNotNull { ledger.person(it) }.chunked(4).forEach { row ->
                    Row(Modifier.fillMaxWidth().padding(bottom = Space.s), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                        row.forEach { p ->
                            val n = gb.withMe[p.id] ?: 0
                            Column(
                                Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(Color.White.copy(alpha = 0.04f))
                                    .clickable(role = Role.Button, onClickLabel = "Open ${p.name}") { onPerson(p.id) }.padding(vertical = Space.m),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Avatar(p.name, 40.dp)
                                Text(firstName(p.name), style = MaterialTheme.typography.labelLarge, maxLines = 1, modifier = Modifier.padding(top = Space.s))
                                Text(if (n == 0L) "settled" else rupees(abs(n)), style = numerals(13), color = if (n == 0L) NightBoard.muted else moneyColor(n))
                            }
                        }
                        repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }                // Activity, with search tucked behind an icon until it's wanted.
                var searching by remember { mutableStateOf(false) }
                var gq by remember { mutableStateOf("") }
                Row(Modifier.fillMaxWidth().padding(top = Space.xxl), verticalAlignment = Alignment.CenterVertically) {
                    Text("ACTIVITY", style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.4.sp), color = NightBoard.paint.copy(alpha = .6f))
                    Text("  ${gb.expenses.size}", style = MaterialTheme.typography.labelSmall, color = NightBoard.paint.copy(alpha = .4f), modifier = Modifier.weight(1f))
                    if (gb.expenses.size > 4) androidx.compose.material3.IconButton({ searching = !searching; if (!searching) gq = "" }) {
                        Icon(Icons.Filled.Search, if (searching) "Close search" else "Search this group", tint = NightBoard.paint)
                    }
                }
                if (searching) OutlinedTextField(
                    gq, { gq = it }, placeholder = { Text("What or who") }, singleLine = true,
                    shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth().padding(top = Space.xs),
                )
                if (gb.expenses.isEmpty()) Text("Nothing added yet. Split a payment with ${g.name}, or add one.", style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, modifier = Modifier.padding(top = Space.m))
                val shownAct = gb.expenses.filter { e -> gq.isBlank() || e.title.contains(gq.trim(), true) || (ledger.person(e.paidBy)?.name?.contains(gq.trim(), true) == true) }
                if (gq.isNotBlank() && shownAct.isEmpty()) Text("Nothing in ${g.name} matches \"$gq\".", style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, modifier = Modifier.padding(top = Space.l))
                ActivityList(shownAct, ledger, null) { opened = it }
            }
        }
    }
    if (addingMembers) MembersSheet(g, onClose = { addingMembers = false })
    opened?.let { e -> ExpenseSheet(e, onClose = { opened = null }) }
    groupText?.let { RemindSheet(null, it, onClose = { groupText = null }) }
}

/** Add someone by name and number. They never need the app. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddPersonSheet(onClose: () -> Unit, onOpen: (String) -> Unit) {
    val ledger by Store.ledger.collectAsState()
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    val same = sameAs(ledger, name, phone)
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = SheetColor, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        BoardTheme(NightBoard) {
            Column(Modifier.padding(horizontal = Gutter).padding(bottom = Space.xl).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(Space.l)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(name.ifBlank { "?" }, 52.dp)
                    Spacer(Modifier.width(Space.l))
                    Text("Add a person", style = MaterialTheme.typography.headlineSmall)
                }
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    phone, { phone = it }, label = { Text("Phone, for WhatsApp and SMS") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth(),
                )
                // Someone already saved: say so before a second copy of them is made.
                if (same != null) Tile(Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = "Open ${same.name}") { onOpen(same.id) }, accent = NightBoard.paint) {
                    Row(Modifier.padding(Space.m), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(same.name, 36.dp)
                        Spacer(Modifier.width(Space.m))
                        Column(Modifier.weight(1f)) {
                            Text("Already saved: ${same.name}", style = MaterialTheme.typography.titleSmall)
                            Text(if (same.onApp) "Uses Split too. Tap to open them." else "Tap to open them instead.", style = MaterialTheme.typography.bodySmall, color = NightBoard.muted)
                        }
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = NightBoard.muted)
                    }
                }
                Text("They don't need the app. If they use Split too, their app links up when they get your first reminder.", style = MaterialTheme.typography.bodySmall, color = NightBoard.muted)
                val clash = duplicateOf(ledger, name, phone)
                clash?.let { Text(it.second, style = MaterialTheme.typography.bodySmall, color = Owe) }
                PrimaryPill(if (same != null) "Add as a different person" else "Add ${name.trim().substringBefore(' ').ifBlank { "person" }}", {
                    Store.upsertPerson(Person(Store.newId(), name.trim(), phone.trim().ifBlank { null }))
                    Store.tell("${name.trim()} added")
                    onClose()
                }, Modifier.fillMaxWidth(), enabled = name.isNotBlank() && clash == null, board = NightBoard)
            }
        }
    }
}

/**
 * Who's in a group: your saved people with ticks (members already ticked), a search for long
 * lists, and someone new, who is checked against everyone saved before being added.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MembersSheet(g: Group, onClose: () -> Unit) {
    val ledger by Store.ledger.collectAsState()
    var picked by remember { mutableStateOf(g.memberIds.toSet()) }
    var q by remember { mutableStateOf("") }
    var newPhone by remember { mutableStateOf("") }
    val shown = ledger.people.filter { matches(it.name, q) }.sortedWith(compareByDescending<Person> { it.id in g.memberIds }.thenBy { it.name })
    val clash = duplicateOf(ledger, q, newPhone)
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = SheetColor, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        BoardTheme(NightBoard) {
            Column(Modifier.padding(horizontal = Gutter).padding(bottom = Space.xl).navigationBarsPadding()) {
                Text("Who's in ${g.name}", style = MaterialTheme.typography.headlineSmall)
                OutlinedTextField(
                    q, { q = it }, placeholder = { Text("Find someone, or type a new name") }, singleLine = true,
                    leadingIcon = { Icon(Icons.Filled.Search, null, tint = NightBoard.muted) },
                    shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth().padding(top = Space.l),
                )
                LazyColumn(Modifier.fillMaxWidth().height(360.dp).padding(top = Space.s)) {
                    items(shown.size) { i ->
                        val p = shown[i]
                        val on = p.id in picked
                        Line({ picked = if (on) picked - p.id else picked + p.id }, if (on) "Take ${p.name} out" else "Add ${p.name}") {
                            TickKey(on, NightBoard.paint, Night, { picked = if (on) picked - p.id else picked + p.id }, p.name)
                            Spacer(Modifier.width(Space.m))
                            Avatar(p.name, 32.dp)
                            Spacer(Modifier.width(Space.m))
                            Column(Modifier.weight(1f)) {
                                Text(p.name, style = MaterialTheme.typography.titleSmall)
                                Text(if (p.id in g.memberIds) "in the group" else p.phone ?: "no number saved", style = MaterialTheme.typography.bodySmall, color = NightBoard.muted)
                            }
                            if (p.onApp) OnSplitTag()
                        }
                    }
                    // Nobody by that name: offer to add them, guarded against a second copy.
                    if (q.isNotBlank() && shown.none { it.name.equals(q.trim(), true) }) item {
                        Column(Modifier.padding(top = Space.l)) {
                            Text("New: ${q.trim()}", style = MaterialTheme.typography.titleSmall)
                            OutlinedTextField(
                                newPhone, { newPhone = it }, label = { Text("Phone (optional)") }, singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth().padding(top = Space.s),
                            )
                            clash?.let { Text(it.second, style = MaterialTheme.typography.bodySmall, color = Owe, modifier = Modifier.padding(top = Space.xs)) }
                            GhostPill("Add ${q.trim().substringBefore(' ')} to the group", {
                                val p = Person(Store.newId(), q.trim(), newPhone.trim().ifBlank { null })
                                Store.upsertPerson(p); picked = picked + p.id; q = ""; newPhone = ""
                            }, Modifier.fillMaxWidth().padding(top = Space.s), enabled = clash == null, board = NightBoard)
                        }
                    }
                }
                PrimaryPill("Save · ${picked.size} in the group", {
                    Store.setGroupMembers(g.id, picked.toList())
                    onClose()
                }, Modifier.fillMaxWidth().padding(top = Space.l), enabled = picked.isNotEmpty(), board = NightBoard)
            }
        }
    }
}

/**
 * Stops a second copy of someone: a phone number already saved is always the same person; a name
 * already saved needs a phone number to tell the two apart. Returns who it clashes with and why.
 */
fun duplicateOf(l: Ledger, name: String, phone: String): Pair<Person, String>? {
    val digits = phone.filter(Char::isDigit).takeLast(10)
    l.people.firstOrNull { digits.length == 10 && it.phone?.filter(Char::isDigit)?.takeLast(10) == digits }?.let { return it to "This number is already ${it.name}." }
    l.people.firstOrNull { name.isNotBlank() && it.name.trim().equals(name.trim(), ignoreCase = true) }?.let { p ->
        if (digits.length < 10) return p to "${p.name} is already saved. Add a phone number if this is someone else."
    }
    return null
}

/** Name a group and tick who is in it. */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun AddGroupSheet(onClose: () -> Unit) {
    val ledger by Store.ledger.collectAsState()
    var name by remember { mutableStateOf("") }
    var members by remember { mutableStateOf(setOf<String>()) }
    var icon by remember { mutableStateOf<String?>(null) }
    var picking by remember { mutableStateOf(false) }
    val shown = icon ?: GroupIcons.guess(name)
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = SheetColor, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        BoardTheme(NightBoard) {
            Column(Modifier.padding(horizontal = Gutter).padding(bottom = Space.xl).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(Space.l)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // The icon follows the name until the user picks one.
                    Box(Modifier.clickable(role = Role.Button, onClickLabel = "Choose icon") { picking = !picking }) {
                        GroupBadge(Group("new", name.ifBlank { "?" }, emptyList()), 52.dp, shown)
                    }
                    Spacer(Modifier.width(Space.l))
                    Column {
                        Text("New group", style = MaterialTheme.typography.headlineSmall)
                        Text("Tap the icon to change it", style = MaterialTheme.typography.bodySmall, color = NightBoard.muted)
                    }
                }
                if (picking) IconPicker(shown) { icon = it; picking = false }
                OutlinedTextField(name, { name = it }, label = { Text("Group name") }, placeholder = { Text("Flat 302, Sunday football…") }, singleLine = true, shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth())
                Text("WHO'S IN", style = MaterialTheme.typography.labelSmall, color = NightBoard.muted)
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.s), verticalArrangement = Arrangement.spacedBy(Space.s)) {
                    ledger.people.forEach { p ->
                        val on = p.id in members
                        FilterChip(
                            on, { members = if (on) members - p.id else members + p.id },
                            label = { Text(firstName(p.name)) }, leadingIcon = { Avatar(p.name, 24.dp) }, modifier = Modifier.height(44.dp),
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = NightBoard.plate, selectedLabelColor = Night),
                        )
                    }
                }
                if (ledger.people.isEmpty()) Text("Add people first, then put them in a group.", style = MaterialTheme.typography.bodySmall, color = NightBoard.muted)
                PrimaryPill("Make group", {
                    Store.addGroup(Group(Store.newId(), name.trim(), members.toList(), icon))
                    Store.tell("${name.trim()} made")
                    onClose()
                }, Modifier.fillMaxWidth(), enabled = name.isNotBlank() && members.isNotEmpty(), board = NightBoard)
            }
        }
    }
}

/** Twelve marks to choose from; the current one is lit. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun IconPicker(current: String?, onPick: (String) -> Unit) {
    androidx.compose.foundation.layout.FlowRow(
        Modifier.fillMaxWidth().padding(vertical = Space.m),
        horizontalArrangement = Arrangement.spacedBy(Space.s), verticalArrangement = Arrangement.spacedBy(Space.s),
    ) {
        GroupIcons.all.forEach { (key, v) ->
            val on = key == current
            Keycap(
                { onPick(key) }, if (on) NightBoard.plate else Color.White.copy(alpha = 0.08f), Modifier.size(52.dp),
                radius = 16.dp, lift = 3.dp, lip = if (on) Color(0xFF8C8A82) else Color.Black.copy(alpha = 0.5f), label = key,
            ) { androidx.compose.material3.Icon(v, key, tint = if (on) Night else NightBoard.paint) }
        }
    }
}

/** Everyone, searchable and filtered by direction; settled people sorted by name at the end. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PeopleSheet(onClose: () -> Unit, onPerson: (String) -> Unit, onAdd: () -> Unit) {
    val ledger by Store.ledger.collectAsState()
    var filter by remember { mutableStateOf(2) }
    var q by remember { mutableStateOf("") }
    val all = remember(ledger) {
        val b = Balances.people(ledger).associateBy { it.personId }
        ledger.people.map { it to (b[it.id]?.net ?: 0L) }
    }
    val shown = all.filter { (p, net) ->
        p.name.contains(q.trim(), ignoreCase = true) && when (filter) { 0 -> net > 0; 1 -> net < 0; else -> true }
    }.sortedWith(compareByDescending<Pair<Person, Long>> { abs(it.second) }.thenBy { it.first.name })
    ModalBottomSheet(onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = SheetColor, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        BoardTheme(NightBoard) {
            Column(Modifier.padding(horizontal = Gutter).navigationBarsPadding()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("People", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                    GhostPill("Add", onAdd, board = NightBoard)
                }
                OutlinedTextField(
                    q, { q = it }, placeholder = { Text("Search ${ledger.people.size} people") }, singleLine = true,
                    shape = WellShape, colors = wellColors(NightBoard.paint), modifier = Modifier.fillMaxWidth().padding(top = Space.l),
                )
                Row(Modifier.padding(vertical = Space.l), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    listOf("Owe you", "You owe", "Everyone").forEachIndexed { i, label ->
                        val on = filter == i
                        // A filter is a light chip, not a keycap: it narrows, it doesn't act.
                        FilterChip(
                            on, { filter = i }, label = { Text(label) }, modifier = Modifier.height(36.dp),
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = NightBoard.plate, selectedLabelColor = Night, labelColor = NightBoard.paint),
                        )
                    }
                }
                LazyColumn(Modifier.fillMaxWidth().height(460.dp)) {
                    items(shown, key = { it.first.id }) { (p, net) ->
                        Box(Modifier.padding(horizontal = 0.dp)) { MoneyRowFlat(p, net) { onPerson(p.id) } }
                    }
                    if (shown.isEmpty()) item { Text(if (q.isBlank()) "No one here right now." else "No one called \"$q\".", style = MaterialTheme.typography.bodyMedium, color = NightBoard.muted, modifier = Modifier.padding(Space.l)) }
                }
            }
        }
    }
}

@Composable
private fun MoneyRowFlat(p: Person, net: Long, onClick: () -> Unit) {
    Line(onClick, "Open ${p.name}") {
        run {
            Avatar(p.name, 40.dp)
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.name, style = MaterialTheme.typography.titleSmall)
                    if (p.onApp) OnSplitTag(Modifier.padding(start = Space.s))
                }
                Text(direction(net), style = MaterialTheme.typography.bodySmall, color = NightBoard.muted)
            }
            if (net != 0L) Text(money(rupees(abs(net))), style = numerals(20), color = moneyColor(net))
        }
    }
}

/** Someone already saved with this name or phone number, if any. */
fun sameAs(l: Ledger, name: String, phone: String): Person? {
    val digits = phone.filter(Char::isDigit).takeLast(10)
    return l.people.firstOrNull { p -> (name.isNotBlank() && p.name.trim().equals(name.trim(), ignoreCase = true)) || (digits.length == 10 && p.phone?.filter(Char::isDigit)?.takeLast(10) == digits) }
}

/** A small outlined tag for people who use Split too: their expenses sync; everyone else's stay here. */
@Composable
fun OnSplitTag(modifier: Modifier = Modifier) {
    Text("On Split", style = MaterialTheme.typography.labelSmall, color = NightBoard.paint, modifier = modifier.border(1.dp, NightBoard.paint.copy(alpha = 0.5f), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 1.dp))
}

/** A row of the dial's ticks, lit up to [progress]: how much of something has come back. */
@Composable
fun TickBar(progress: Float, modifier: Modifier = Modifier, color: Color = Color(0xFFF2EFE6)) {
    androidx.compose.foundation.Canvas(modifier.height(10.dp)) {
        val step = 5.dp.toPx(); var x = 0f; var i = 0
        val total = (size.width / step).toInt().coerceAtLeast(1)
        while (x < size.width) {
            val lit = i.toFloat() / total < progress
            drawLine(
                if (lit) color else color.copy(alpha = 0.2f),
                androidx.compose.ui.geometry.Offset(x, if (i % 5 == 0) 0f else size.height * 0.35f), androidx.compose.ui.geometry.Offset(x, size.height),
                1.4.dp.toPx(), androidx.compose.ui.graphics.StrokeCap.Round,
            )
            x += step; i++
        }
    }
}
