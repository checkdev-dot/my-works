package com.splitapp.data

import com.splitapp.detect.Merchants

/**
 * The ledger before expenses: splits of detected payments (the user always paid, shares ticked off
 * one by one) and hand-written records. Read once from an old ledger.json and turned into expenses.
 * Old ids are kept, so reminders already sent and notifications already showing still find their record.
 */
object Legacy {
    data class Share(val personId: String, val amountPaise: Long, val settled: Boolean)
    data class Split(val paymentId: String, val mode: SplitMode, val shares: List<Share>, val groupId: String?, val createdAt: Long)
    data class Debt(val id: String, val personId: String, val amountPaise: Long, val iOwe: Boolean, val note: String, val timestamp: Long, val settled: Boolean, val ref: String?)

    fun toExpenses(splits: List<Split>, debts: List<Debt>, payments: List<Payment>, groups: List<Group>): List<Expense> {
        val out = mutableListOf<Expense>()
        splits.forEach { s ->
            val p = payments.firstOrNull { it.id == s.paymentId }
            val others = s.shares.map { it.personId }.filter { it != ME }.toSet()
            val group = s.groupId?.takeIf { id -> groups.any { it.id == id } } ?: groups.firstOrNull { it.memberIds.toSet() == others }?.id
            val ts = p?.timestamp ?: s.createdAt
            out += Expense(
                id = s.paymentId,
                title = p?.let { Merchants.byId(it.merchantId)?.name } ?: "Payment",
                totalPaise = p?.amountPaise ?: s.shares.sumOf { it.amountPaise },
                paidBy = ME,
                shares = s.shares.map { com.splitapp.data.Share(it.personId, it.amountPaise) },
                timestamp = ts, groupId = group, merchantId = p?.merchantId, paymentId = s.paymentId, mode = s.mode,
            )
            // A ticked-off share was money paid back: it becomes a payment, so history stays true.
            s.shares.filter { it.settled && it.personId != ME }.forEach { sh ->
                out += Expense("${s.paymentId}.${sh.personId}.paid", "Payment", sh.amountPaise, sh.personId, listOf(com.splitapp.data.Share(ME, sh.amountPaise)), ts + 1, group, isPayment = true)
            }
        }
        debts.forEach { d ->
            val lender = if (d.iOwe) d.personId else ME
            val borrower = if (d.iOwe) ME else d.personId
            out += Expense(d.id, d.note.ifBlank { "Money" }, d.amountPaise, lender, listOf(com.splitapp.data.Share(borrower, d.amountPaise)), d.timestamp, mode = SplitMode.EXACT, ref = d.ref)
            if (d.settled) out += Expense("${d.id}.paid", "Payment", d.amountPaise, borrower, listOf(com.splitapp.data.Share(lender, d.amountPaise)), d.timestamp + 1, isPayment = true)
        }
        return out.sortedByDescending { it.timestamp }
    }
}
