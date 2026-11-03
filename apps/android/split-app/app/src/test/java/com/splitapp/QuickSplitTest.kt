package com.splitapp

import com.splitapp.data.Expense
import com.splitapp.data.Ledger
import com.splitapp.data.ME
import com.splitapp.data.Payment
import com.splitapp.data.PaymentStatus
import com.splitapp.data.Share
import com.splitapp.data.Store
import com.splitapp.detect.Merchants
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** One-tap split repeats exactly what was done with the same shop, and never guesses from another. */
class QuickSplitTest {
    private fun ledger(vararg e: Expense, payments: List<Payment>) = Store.update { Ledger(expenses = e.toList(), payments = payments) }

    @Test fun repeatsTheSamePeopleAndProportions() {
        val last = Expense("e1", "Zomato", 120000, ME, listOf(Share("r", 60000), Share("m", 30000), Share(ME, 30000)), 1L, merchantId = "zomato")
        ledger(last, payments = listOf(Payment("p", "zomato", 80000, "HDFC", 2L)))
        val e = Store.quickSplit("p")!!
        assertEquals(listOf("r", "m", ME), e.shares.map { it.personId })
        assertEquals(40000L, e.shares[0].amountPaise); assertEquals(20000L, e.shares[1].amountPaise)
        assertEquals(PaymentStatus.SPLIT, Store.ledger.value.payment("p")!!.status)
    }

    @Test fun keepsTheUserOutWhenTheyWereOutLastTime() {
        val last = Expense("e1", "Blinkit", 60000, ME, listOf(Share("r", 30000), Share("m", 30000)), 1L, merchantId = "blinkit")
        ledger(last, payments = listOf(Payment("p", "blinkit", 40000, "HDFC", 2L)))
        val e = Store.quickSplit("p")!!
        assertTrue(e.shares.none { it.personId == ME }); assertEquals(20000L, e.shares[0].amountPaise)
    }

    @Test fun unknownShopsMatchOnlyByTheirOwnName() {
        val lunch = Expense("e1", "Swiggy", 60000, ME, listOf(Share("a", 30000), Share(ME, 30000)), 1L, merchantId = "swiggy")
        val turf = Expense("e2", "Turfnation", 180000, ME, listOf(Share("k", 90000), Share(ME, 90000)), 1L, merchantId = Merchants.UNKNOWN)
        val newTurf = Payment("p1", Merchants.UNKNOWN, 180000, "ICICI", 2L, label = "Turfnation")
        val newCafe = Payment("p2", Merchants.UNKNOWN, 50000, "ICICI", 2L, label = "Cafe Mocha")
        ledger(lunch, turf, payments = listOf(newTurf, newCafe))
        assertEquals(listOf("k"), Store.sameShopAsBefore(newTurf))
        assertTrue(Store.sameShopAsBefore(newCafe).isEmpty())
        assertNull(Store.quickSplit("p2"))
    }
}
