package com.splitapp.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.splitapp.data.Expense
import com.splitapp.data.Group
import com.splitapp.data.ME
import com.splitapp.data.Payment
import com.splitapp.data.Share
import com.splitapp.data.SplitMode
import com.splitapp.data.Store
import com.splitapp.split.Line
import com.splitapp.split.Outcome
import com.splitapp.split.SplitMath

/**
 * Everything the user changes on the expense sheet, in one place. One editor for all three jobs:
 * splitting a detected payment, adding an expense by hand, and editing either later.
 */
class SplitEditor(
    initialIds: List<String>,
    groupId: String?,
    total: Long = 0,
    title: String = "",
    paidBy: String = ME,
    /** Set when splitting a detected payment: the amount and payer come from the bank and stay fixed. */
    val payment: Payment? = null,
    val merchantId: String? = payment?.merchantId,
    /** The expense being edited, if any. */
    val existing: Expense? = null,
) {
    val lines = mutableStateListOf<Line>()
    var mode by mutableStateOf(SplitMode.EQUAL)
    var groupId by mutableStateOf(groupId)
    var totalPaise by mutableLongStateOf(payment?.amountPaise ?: total)
    var title by mutableStateOf(title)
    var paidBy by mutableStateOf(payment?.let { ME } ?: paidBy)

    init { setPeople(initialIds) }

    val fromBank: Boolean get() = payment != null
    val outcome: Outcome get() = SplitMath.compute(totalPaise, mode, lines.toList())

    /** The payer's view: what the others owe them. Shown as "others owe ₹X" or "you owe ₹X". */
    val othersOwePayer: Long get() = outcome.amounts.filter { (id, _) -> id != paidBy && line(id)?.included == true }.values.sum()

    val includesMe: Boolean get() = line(ME)?.included == true
    val canConfirm: Boolean get() = totalPaise > 0 && outcome.unassignedPaise == 0L && lines.count { it.included } >= 1 &&
        lines.any { it.included && it.personId != paidBy } && title.isNotBlank()

    fun line(id: String) = lines.firstOrNull { it.personId == id }

    /** Rows are the chosen people, then the user. Keeps the user's own include setting. */
    fun setPeople(ids: List<String>) {
        val me = line(ME) ?: Line(ME)
        val keep = ids.distinct().filter { it != ME }.map { id -> line(id) ?: Line(id) }
        lines.clear()
        lines.addAll(keep + me)
        if (paidBy != ME && line(paidBy) == null) paidBy = ME
        resetPercents()
    }

    fun applyGroup(g: Group) { groupId = g.id; setPeople(g.memberIds) }

    fun toggle(id: String) = edit(id) { it.copy(included = !it.included, fixedPaise = null) }.also { resetPercents() }

    fun setIncludeMe(on: Boolean) = edit(ME) { it.copy(included = on, fixedPaise = null) }.also { resetPercents() }

    fun setAmount(id: String, paise: Long?) = edit(id) { it.copy(fixedPaise = paise, included = true) }
    fun setWeight(id: String, w: Int) = edit(id) { it.copy(weight = w.coerceIn(0, 99), included = true) }
    fun setPercent(id: String, pct: Double) = edit(id) { it.copy(percent = pct.coerceIn(0.0, 100.0), included = true) }

    fun changeMode(m: SplitMode) { mode = m; resetAll() }

    fun resetAll() {
        lines.replaceAll { it.copy(fixedPaise = null, weight = 1) }
        resetPercents()
    }

    fun remove(id: String) { lines.removeAll { it.personId == id }; if (paidBy == id) paidBy = ME; resetPercents() }

    fun add(id: String) { if (line(id) == null) { lines.add(lines.size - 1, Line(id)); groupId = null; resetPercents() } }

    private fun resetPercents() {
        val active = lines.filter { it.included }
        if (active.isEmpty()) return
        val each = 100.0 / active.size
        lines.replaceAll { if (it.included) it.copy(percent = each) else it.copy(percent = 0.0) }
    }

    private fun edit(id: String, f: (Line) -> Line) {
        val i = lines.indexOfFirst { it.personId == id }
        if (i >= 0) lines[i] = f(lines[i])
    }

    fun toExpense(): Expense = Expense(
        id = existing?.id ?: payment?.id ?: Store.newId(),
        title = title.trim(),
        totalPaise = totalPaise,
        paidBy = paidBy,
        shares = lines.filter { it.included }.map { Share(it.personId, outcome.amounts[it.personId] ?: 0) },
        timestamp = existing?.timestamp ?: payment?.timestamp ?: System.currentTimeMillis(),
        groupId = groupId,
        merchantId = merchantId,
        paymentId = payment?.id ?: existing?.paymentId,
        mode = mode,
        ref = existing?.ref,
    )

    companion object {
        /** An editor for an existing expense, with its people, payer and amounts as saved. */
        fun of(e: Expense, payment: Payment?): SplitEditor {
            val ed = SplitEditor(e.shares.map { it.personId } + listOfNotNull(e.paidBy.takeIf { it != ME }), e.groupId, e.totalPaise, e.title, e.paidBy, payment, e.merchantId, e)
            if (e.shares.none { it.personId == ME }) ed.setIncludeMe(false)
            e.shares.map { it.personId }.toSet().let { inShares -> ed.lines.filter { it.personId != ME && it.personId !in inShares }.forEach { ed.toggle(it.personId) } }
            // Whatever way it was split, it reopens as amounts: uneven ones come back as typed amounts,
            // so the sheet shows exactly what was saved.
            val even = SplitMath.compute(e.totalPaise, SplitMode.EQUAL, ed.lines.toList()).amounts
            e.shares.forEach { s -> if (even[s.personId] != s.amountPaise) ed.setAmount(s.personId, s.amountPaise) }
            return ed
        }
    }
}
