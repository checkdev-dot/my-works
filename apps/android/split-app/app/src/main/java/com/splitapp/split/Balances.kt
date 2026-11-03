package com.splitapp.split

import com.splitapp.data.Expense
import com.splitapp.data.Group
import com.splitapp.data.Ledger
import com.splitapp.data.ME

/** One person against the user. [net] positive: they owe the user. Negative: the user owes them. */
data class Balance(val personId: String, val net: Long, val activity: List<Expense>) {
    val settled: Boolean get() = net == 0L
}

/**
 * A group's money from the user's side. [myNet] positive: the group owes the user.
 * [withMe] is each member's balance with the user inside this group only.
 */
data class GroupBalance(val group: Group, val expenses: List<Expense>, val spentPaise: Long, val myNet: Long, val withMe: Map<String, Long>)

/** Every number on screen comes from here, so home, people and groups always agree. */
object Balances {
    fun people(l: Ledger): List<Balance> {
        val ids = l.expenses.flatMap { e -> listOf(e.paidBy) + e.shares.map { it.personId } }.toSet() - ME
        return ids.map { of(l, it) }
    }

    fun of(l: Ledger, personId: String): Balance {
        val mine = l.expenses.filter { it.involves(personId) && it.involves(ME) }.sortedByDescending { it.timestamp }
        return Balance(personId, mine.sumOf { it.netWith(personId) }, mine)
    }

    /** What everyone owes the user, and what the user owes, after netting each person. */
    fun owedToMe(l: Ledger): Long = people(l).filter { it.net > 0 }.sumOf { it.net }
    fun iOwe(l: Ledger): Long = -people(l).filter { it.net < 0 }.sumOf { it.net }

    fun groups(l: Ledger): List<GroupBalance> = l.groups.map { group(l, it) }

    fun group(l: Ledger, g: Group): GroupBalance {
        val list = l.expenses.filter { it.groupId == g.id }.sortedByDescending { it.timestamp }
        val withMe = g.memberIds.associateWith { m -> list.sumOf { it.netWith(m) } }
        return GroupBalance(g, list, list.filter { !it.isPayment }.sumOf { it.totalPaise }, withMe.values.sum(), withMe)
    }

    /**
     * Where a payment between the user and [personId] lands, so a group never shows someone owing
     * more than they owe overall. [theyPay]: the person is paying the user (else the user pays them).
     * Groups where money runs that way are cleared first, largest first; the rest is outside groups.
     */
    fun allocate(l: Ledger, personId: String, amountPaise: Long, theyPay: Boolean): List<Pair<String?, Long>> {
        var left = amountPaise
        val out = mutableListOf<Pair<String?, Long>>()
        l.groups.filter { personId in it.memberIds }
            .map { it.id to (group(l, it).withMe[personId] ?: 0L).let { n -> if (theyPay) n else -n } }
            .filter { it.second > 0 }.sortedByDescending { it.second }
            .forEach { (gid, open) -> if (left > 0) { val take = minOf(open, left); out += gid to take; left -= take } }
        if (left > 0) out += null to left
        return out
    }

    /** What an expense means for the user: lent (positive), borrowed (negative), or nothing. */
    fun myEffect(e: Expense): Long = when {
        e.paidBy == ME -> e.totalPaise - e.owed(ME)
        else -> -e.owed(ME)
    }
}
