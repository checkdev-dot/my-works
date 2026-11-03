package com.splitapp.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** The whole ledger lives on the phone in one JSON file. Nothing here talks to a server. */
object Store {
    private val state = MutableStateFlow(Ledger())
    val ledger: StateFlow<Ledger> = state.asStateFlow()
    private var file: File? = null
    private var loaded = false

    @Synchronized
    fun init(context: Context) {
        if (loaded) return
        val f = File(context.filesDir, "ledger.json")
        file = f
        if (f.exists()) {
            val json = runCatching { JSONObject(f.readText()) }.getOrNull()
            val decoded = json?.let { runCatching { decode(it) }.getOrNull() }
            // Never let an unreadable or older file be overwritten silently: keep a copy first.
            if (decoded == null || json.has("splits") || json.has("debts")) runCatching { f.copyTo(File(context.filesDir, "ledger.json.bak"), overwrite = true) }
            state.value = decoded ?: Ledger()
        }
        loaded = true
    }

    @Synchronized
    fun update(change: (Ledger) -> Ledger) {
        val next = change(state.value)
        state.value = next
        file?.writeText(encode(next).toString())
    }

    fun newId(): String = UUID.randomUUID().toString().take(8)

    /** One short confirmation for home to show, with an undo when the action can be reversed. */
    data class Notice(val text: String, val undo: (() -> Unit)? = null, val id: Long = System.nanoTime())
    val notice = MutableStateFlow<Notice?>(null)
    fun tell(text: String, undo: (() -> Unit)? = null) { notice.value = Notice(text, undo) }

    // --- Detected payments ---

    fun addPayment(p: Payment) = update { it.copy(payments = listOf(p) + it.payments) }

    fun setStatus(paymentId: String, status: PaymentStatus) = update { l ->
        l.copy(payments = l.payments.map { if (it.id == paymentId) it.copy(status = status) else it })
    }

    /** "Just me": the payment was the user's own, so it leaves To split. */
    fun dismissPayment(paymentId: String) {
        val before = state.value.payment(paymentId)?.status ?: return
        setStatus(paymentId, PaymentStatus.DISMISSED)
        tell("Kept as just yours") { setStatus(paymentId, before) }
    }

    // --- People and groups ---

    fun upsertPerson(p: Person) = update { l ->
        if (l.people.any { it.id == p.id }) l.copy(people = l.people.map { if (it.id == p.id) p else it })
        else l.copy(people = l.people + p)
    }

    fun addGroup(g: Group) = update { it.copy(groups = it.groups + g) }
    fun setGroupIcon(id: String, icon: String) = update { l -> l.copy(groups = l.groups.map { if (it.id == id) it.copy(icon = icon) else it }) }

    /** Changes who's in a group. Past expenses keep their own people; only new ones use the new list. */
    fun setGroupMembers(id: String, members: List<String>) {
        val before = state.value.group(id) ?: return
        update { l -> l.copy(groups = l.groups.map { if (it.id == id) it.copy(memberIds = members.distinct()) else it }) }
        val added = members.size - before.memberIds.size
        tell(if (added >= 0) "${before.name} · ${members.size} people" else "${before.name} · ${members.size} people") {
            update { l -> l.copy(groups = l.groups.map { if (it.id == id) before else it }) }
        }
    }

    // --- Expenses ---

    /**
     * Adds or replaces an expense. Splitting a detected payment takes it out of To split.
     * Undo reverses only this change, so a payment detected meanwhile is never lost.
     */
    fun saveExpense(e: Expense, announce: Boolean = true) {
        val old = state.value.expense(e.id)
        val oldStatus = e.paymentId?.let { state.value.payment(it)?.status }
        putExpense(e)
        if (announce) tell(if (old != null) "Changes saved" else "Added ${e.title}") { undoSave(e, old, oldStatus) }
    }

    /** Puts back what an expense was before [saveExpense] (or removes it if it was new). */
    fun undoSave(e: Expense, old: Expense?, oldStatus: PaymentStatus?) = update { l ->
        l.copy(
            expenses = (listOfNotNull(old) + l.expenses.filterNot { it.id == e.id }).sortedByDescending { it.timestamp },
            payments = l.payments.map { if (it.id == e.paymentId && oldStatus != null) it.copy(status = oldStatus) else it },
        )
    }

    private fun putExpense(e: Expense) = update { l ->
        l.copy(
            expenses = (listOf(e) + l.expenses.filterNot { it.id == e.id }).sortedByDescending { it.timestamp },
            payments = if (e.paymentId == null) l.payments else l.payments.map { if (it.id == e.paymentId) it.copy(status = PaymentStatus.SPLIT) else it },
        )
    }

    fun deleteExpense(id: String) {
        val e = state.value.expense(id) ?: return
        update { l ->
            l.copy(
                expenses = l.expenses.filterNot { it.id == id },
                payments = l.payments.map { if (it.id == e.paymentId) it.copy(status = PaymentStatus.LATER) else it },
            )
        }
        tell(if (e.paymentId != null) "Deleted. The payment is back in To split" else "Deleted") { putExpense(e) }
    }

    /**
     * Records money moving between the user and someone: "Rahul paid you ₹500" is from = Rahul, to = me.
     * Without a [groupId] the payment is spread over the groups where money runs that way, so every
     * group and the person's own total stay in agreement.
     */
    fun settleUp(from: String, to: String, amountPaise: Long, groupId: String? = null): List<Expense> {
        val other = if (from == ME) to else from
        val parts = if (groupId != null) listOf(groupId to amountPaise) else com.splitapp.split.Balances.allocate(state.value, other, amountPaise, theyPay = from != ME)
        val made = parts.mapIndexed { i, (g, amt) -> Expense(newId(), "Payment", amt, from, listOf(Share(to, amt)), System.currentTimeMillis() + i, g, isPayment = true, mode = SplitMode.EXACT) }
        val ids = made.map { it.id }.toSet()
        update { l -> l.copy(expenses = made + l.expenses) }
        val them = state.value.person(other)?.name?.substringBefore(' ') ?: "them"
        tell(if (from == ME) "You paid $them ${com.splitapp.rupees(amountPaise)}" else "$them paid you ${com.splitapp.rupees(amountPaise)}") {
            update { l -> l.copy(expenses = l.expenses.filterNot { it.id in ids }) }
        }
        return made
    }

    /**
     * The one-tap split: exactly what the user did with this shop last time (the same people, the
     * same proportions, with or without their own share, the same group), saved at once with undo.
     * Returns null when this shop has never been split, so the caller opens the full sheet.
     */
    fun quickSplit(paymentId: String): Expense? {
        val l = state.value
        val p = l.payment(paymentId) ?: return null
        val last = lastSplitOf(p) ?: return null
        val weights = last.shares.map { (it.amountPaise / 100).toInt().coerceAtLeast(1) }
        val parts = com.splitapp.split.SplitMath.distribute(p.amountPaise, weights)
        val e = Expense(
            p.id, com.splitapp.detect.Merchants.byId(p.merchantId)?.name ?: p.label ?: "Payment", p.amountPaise, ME,
            last.shares.mapIndexed { i, s -> Share(s.personId, parts[i]) }, p.timestamp, last.groupId, p.merchantId, p.id, mode = last.mode,
        )
        val oldStatus = p.status
        putExpense(e)
        tell("Split like last time · ${quickWords(l, last, parts)}") { undoSave(e, null, oldStatus) }
        return e
    }

    /** "Flat 302 · ₹420 each", or "Rahul & Meera · same as last time" when it wasn't even. */
    fun quickLabel(p: Payment): String? {
        val last = lastSplitOf(p) ?: return null
        val weights = last.shares.map { (it.amountPaise / 100).toInt().coerceAtLeast(1) }
        return quickWords(state.value, last, com.splitapp.split.SplitMath.distribute(p.amountPaise, weights))
    }

    private fun quickWords(l: Ledger, last: Expense, parts: List<Long>): String {
        val who = last.shares.map { it.personId }.filter { it != ME }
        val name = l.group(last.groupId)?.name ?: who.mapNotNull { l.person(it)?.name?.substringBefore(' ') }.joinToString(" & ")
        val even = parts.distinct().size <= 2 && parts.max() - parts.min() < 100 && last.shares.any { it.personId == ME }
        return if (even) "$name · ${com.splitapp.rupees(parts.first())} each" else "$name · same as last time"
    }

    /** The last expense made from this exact shop; for unknown shops, matched by the shop's own name. */
    private fun lastSplitOf(p: Payment): Expense? {
        val unknown = p.merchantId == com.splitapp.detect.Merchants.UNKNOWN
        return state.value.expenses.firstOrNull { e ->
            !e.isPayment && e.paidBy == ME && e.merchantId == p.merchantId && e.shares.any { it.personId != ME } &&
                (!unknown || e.title.equals(p.label, ignoreCase = true))
        }
    }

    /** Who the user split this exact shop with last time; empty when they never have. */
    fun sameShopAsBefore(p: Payment): List<String> = lastSplitOf(p)?.shares?.map { it.personId }?.filter { it != ME } ?: emptyList()
    /** Who the user most likely split this kind of payment with last time. */
    fun guessFor(merchantId: String): List<String> {
        val l = state.value
        val source = l.expenses.firstOrNull { it.merchantId == merchantId && !it.isPayment } ?: l.expenses.firstOrNull { !it.isPayment && it.paymentId != null }
        return source?.shares?.map { it.personId }?.filter { it != ME } ?: emptyList()
    }

    fun timesSplitWith(merchantId: String, ids: Set<String>): Int =
        state.value.expenses.count { e -> e.merchantId == merchantId && !e.isPayment && e.shares.map { it.personId }.filter { it != ME }.toSet() == ids }

    // --- JSON ---

    private fun encode(l: Ledger) = JSONObject().apply {
        put("version", 2)
        put("people", JSONArray(l.people.map { JSONObject().put("id", it.id).put("name", it.name).put("phone", it.phone ?: "").put("onApp", it.onApp).put("upi", it.upiId ?: "") }))
        put("groups", JSONArray(l.groups.map { JSONObject().put("id", it.id).put("name", it.name).put("members", JSONArray(it.memberIds)).put("icon", it.icon ?: "") }))
        put("payments", JSONArray(l.payments.map {
            JSONObject().put("id", it.id).put("merchant", it.merchantId).put("amount", it.amountPaise)
                .put("bank", it.bank).put("ts", it.timestamp).put("status", it.status.name).put("label", it.label ?: "")
        }))
        put("expenses", JSONArray(l.expenses.map { e ->
            JSONObject().put("id", e.id).put("title", e.title).put("total", e.totalPaise).put("paidBy", e.paidBy)
                .put("shares", JSONArray(e.shares.map { JSONObject().put("person", it.personId).put("amount", it.amountPaise) }))
                .put("ts", e.timestamp).put("group", e.groupId ?: "").put("merchant", e.merchantId ?: "").put("payment", e.paymentId ?: "")
                .put("isPayment", e.isPayment).put("mode", e.mode.name).put("ref", e.ref ?: "")
        }))
    }

    private fun decode(o: JSONObject): Ledger {
        val people = o.optJSONArray("people").objects().map {
            Person(it.getString("id"), it.getString("name"), it.optString("phone").ifBlank { null }, it.optBoolean("onApp"), it.optString("upi").ifBlank { null })
        }
        val groups = o.optJSONArray("groups").objects().map {
            Group(it.getString("id"), it.getString("name"), it.getJSONArray("members").let { a -> List(a.length()) { i -> a.getString(i) } }, it.optString("icon").ifBlank { null })
        }
        val payments = o.optJSONArray("payments").objects().map {
            Payment(it.getString("id"), it.getString("merchant"), it.getLong("amount"), it.getString("bank"), it.getLong("ts"), PaymentStatus.valueOf(it.getString("status")), it.optString("label").ifBlank { null })
        }
        val expenses = o.optJSONArray("expenses").objects().map { e ->
            Expense(
                e.getString("id"), e.getString("title"), e.getLong("total"), e.getString("paidBy"),
                e.getJSONArray("shares").objects().map { Share(it.getString("person"), it.getLong("amount")) },
                e.optLong("ts"), e.optString("group").ifBlank { null }, e.optString("merchant").ifBlank { null }, e.optString("payment").ifBlank { null },
                e.optBoolean("isPayment"), runCatching { SplitMode.valueOf(e.optString("mode")) }.getOrDefault(SplitMode.EQUAL), e.optString("ref").ifBlank { null },
            )
        }
        // Files from before expenses: splits and records, turned into expenses once.
        val legacySplits = o.optJSONArray("splits").objects().map { s ->
            Legacy.Split(
                s.getString("payment"), runCatching { SplitMode.valueOf(s.getString("mode")) }.getOrDefault(SplitMode.EQUAL),
                s.getJSONArray("shares").objects().map { Legacy.Share(it.getString("person"), it.getLong("amount"), it.optString("state") == "SETTLED") },
                s.optString("group").ifBlank { null }, s.optLong("created"),
            )
        }
        val legacyDebts = o.optJSONArray("debts").objects().map {
            Legacy.Debt(it.getString("id"), it.getString("person"), it.getLong("amount"), it.optBoolean("iOwe"), it.optString("note"), it.optLong("ts"), it.optBoolean("settled"), it.optString("ref").ifBlank { null })
        }
        val migrated = Legacy.toExpenses(legacySplits, legacyDebts, payments, groups)
        return Ledger(people, groups, payments, (expenses + migrated.filter { m -> expenses.none { it.id == m.id } }).sortedByDescending { it.timestamp })
    }

    private fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else List(length()) { getJSONObject(it) }
}
