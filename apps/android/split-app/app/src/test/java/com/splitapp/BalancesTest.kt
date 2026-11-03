package com.splitapp

import com.splitapp.data.Expense
import com.splitapp.data.Group
import com.splitapp.data.Ledger
import com.splitapp.data.Legacy
import com.splitapp.data.ME
import com.splitapp.data.Payment
import com.splitapp.data.Share
import com.splitapp.data.SplitMode
import com.splitapp.split.Balances
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BalancesTest {
    // ₹1,260 Zomato, the user paid, three ways.
    private val dinner = Expense("e1", "Zomato", 126000, ME, listOf(Share("r", 42000), Share("m", 42000), Share(ME, 42000)), 1L, groupId = "g")
    private fun pay(from: String, to: String, paise: Long, g: String? = null) = Expense("p$from$to$paise", "Payment", paise, from, listOf(Share(to, paise)), 2L, g, isPayment = true)

    @Test fun userPaidSoOthersOweTheirShare() {
        val l = Ledger(expenses = listOf(dinner))
        assertEquals(42000L, Balances.of(l, "r").net); assertEquals(42000L, Balances.of(l, "m").net)
    }

    @Test fun friendPaidSoUserOwesTheirShare() {
        val cab = Expense("e2", "Cab", 90000, "r", listOf(Share("r", 30000), Share("m", 30000), Share(ME, 30000)), 3L)
        val l = Ledger(expenses = listOf(dinner, cab))
        assertEquals(12000L, Balances.of(l, "r").net)
        // Rahul paying for Meera changes nothing between the user and Meera.
        assertEquals(42000L, Balances.of(l, "m").net)
    }

    @Test fun paymentReducesTheBalance() {
        val l = Ledger(expenses = listOf(dinner, pay("r", ME, 20000)))
        assertEquals(22000L, Balances.of(l, "r").net)
        val l2 = Ledger(expenses = listOf(dinner, pay("r", ME, 42000)))
        assertTrue(Balances.of(l2, "r").settled)
    }

    @Test fun userPayingSomeoneBackSettlesWhatTheyOwe() {
        val tickets = Expense("t", "Tickets", 50000, "s", listOf(Share(ME, 50000)), 1L)
        val l = Ledger(expenses = listOf(tickets, pay(ME, "s", 50000)))
        assertTrue(Balances.of(l, "s").settled)
    }

    @Test fun homeTotalsAreTheSumOfPeople() {
        val tickets = Expense("t", "Tickets", 50000, "s", listOf(Share(ME, 50000)), 1L)
        val back = Expense("b", "Lunch", 10000, "r", listOf(Share(ME, 10000)), 1L)
        val l = Ledger(expenses = listOf(dinner, tickets, back))
        val people = Balances.people(l)
        assertEquals(people.filter { it.net > 0 }.sumOf { it.net }, Balances.owedToMe(l))
        assertEquals(32000L + 42000L, Balances.owedToMe(l))
        assertEquals(50000L, Balances.iOwe(l))
    }

    @Test fun groupShowsMyNetAndEachMember() {
        val g = Group("g", "Flat", listOf("r", "m"))
        val l = Ledger(groups = listOf(g), expenses = listOf(dinner, pay("m", ME, 42000, "g")))
        val gb = Balances.group(l, g)
        assertEquals(126000L, gb.spentPaise); assertEquals(42000L, gb.myNet)
        assertEquals(42000L, gb.withMe["r"]); assertEquals(0L, gb.withMe["m"])
    }

    @Test fun aPaymentFromThePersonScreenReachesTheirGroups() {
        val g = Group("g", "Flat", listOf("r", "m"))
        val outside = Expense("o", "Cab", 30000, ME, listOf(Share("r", 30000)), 1L)
        val l = Ledger(groups = listOf(g), expenses = listOf(dinner, outside))
        // Rahul owes 420 in the flat and 300 outside; he pays 500.
        val parts = Balances.allocate(l, "r", 50000, theyPay = true)
        assertEquals(listOf<Pair<String?, Long>>("g" to 42000L, null to 8000L), parts)
        val paid = parts.mapIndexed { i, (gid, amt) -> Expense("pay$i", "Payment", amt, "r", listOf(Share(ME, amt)), 3L, gid, isPayment = true) }
        val after = Ledger(groups = listOf(g), expenses = listOf(dinner, outside) + paid)
        assertEquals(22000L, Balances.of(after, "r").net)
        // No group shows him owing more than he owes overall.
        assertTrue(Balances.group(after, g).withMe["r"]!! <= Balances.of(after, "r").net)
    }

    @Test fun oldSplitsAndRecordsBecomeExpenses() {
        val payments = listOf(Payment("p1", "zomato", 126000, "HDFC", 10L))
        val split = Legacy.Split("p1", SplitMode.EQUAL, listOf(Legacy.Share("r", 42000, false), Legacy.Share("m", 42000, true), Legacy.Share(ME, 42000, false)), null, 10L)
        val debts = listOf(
            Legacy.Debt("d1", "r", 10000, iOwe = true, note = "Chai", timestamp = 5L, settled = false, ref = null),
            Legacy.Debt("d2", "k", 30000, iOwe = false, note = "Cab", timestamp = 6L, settled = true, ref = null),
        )
        val groups = listOf(Group("g", "Flat", listOf("r", "m")))
        val ex = Legacy.toExpenses(listOf(split), debts, payments, groups)
        val l = Ledger(groups = groups, payments = payments, expenses = ex)
        // Same answers as the old screens: Rahul 420 - 100, Meera paid back, Kabir's cab settled.
        assertEquals(32000L, Balances.of(l, "r").net)
        assertTrue(Balances.of(l, "m").settled)
        assertTrue(Balances.of(l, "k").settled)
        // Old ids survive and the split found its group.
        assertEquals("g", l.expense("p1")!!.groupId); assertEquals("p1", l.expenseFor("p1")!!.id)
        assertEquals("Chai", l.expense("d1")!!.title)
    }
}
