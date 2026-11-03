package com.splitapp

import com.splitapp.data.SplitMode
import com.splitapp.detect.DebitParser
import com.splitapp.split.Line
import com.splitapp.split.SplitMath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class DetectAndSplitTest {
    @Test fun upiDebitToZomato() {
        val d = DebitParser.parse("VM-HDFCBK", "Rs.1,260.00 debited from A/c XX4521 on 23-10-26 to VPA zomato@hdfcbank (UPI Ref No 629812345). -HDFC Bank")
        assertNotNull(d); assertEquals(126000L, d!!.amountPaise); assertEquals("zomato", d.merchant.id); assertEquals("HDFC", d.bank)
    }

    @Test fun cardSpendAtBlinkit() {
        val d = DebitParser.parse("AD-ICICIB", "INR 412.50 spent on ICICI Bank Card XX9921 on 23-Oct-26 at BLINKIT. Avl Lmt INR 82,310")
        assertEquals(41250L, d!!.amountPaise); assertEquals("blinkit", d.merchant.id)
    }

    @Test fun instamartIsNotPlainSwiggy() {
        assertEquals("instamart", DebitParser.parse("x", "Sent Rs.300 to Swiggy Instamart via UPI")!!.merchant.id)
    }

    @Test fun districtWinsOverZomatoParent() {
        assertEquals("district", DebitParser.parse("x", "Rs 3600 debited for DISTRICT by Zomato table booking")!!.merchant.id)
    }

    @Test fun ignoresCreditsRefundsAndOtps() {
        assertNull(DebitParser.parse("x", "Rs.420 credited to your a/c XX1 from Rahul via UPI. Ref Zomato split"))
        assertNull(DebitParser.parse("x", "Refund of Rs.1,260 for your Zomato order has been processed"))
        assertNull(DebitParser.parse("x", "123456 is your OTP for Rs.684 payment to Swiggy. Do not share."))
        assertNull(DebitParser.parse("x", "Rs.199 will be debited on 25-10 for Zomato Gold mandate"))
    }

    @Test fun ignoresUnsharedMerchants() {
        assertNull(DebitParser.parse("x", "Rs.2,000 debited from A/c XX1 to VPA electricity@bank"))
    }

    @Test fun equalSplitInWholeRupees() {
        val o = SplitMath.compute(100000, SplitMode.EQUAL, listOf(Line("a"), Line("b"), Line("me")))
        assertEquals(listOf(33400L, 33300L, 33300L), o.amounts.values.toList()); assertEquals(0L, o.unassignedPaise)
    }

    @Test fun editedAmountRebalancesOthers() {
        val o = SplitMath.compute(126000, SplitMode.EQUAL, listOf(Line("a", fixedPaise = 60000), Line("b"), Line("me")))
        assertEquals(33000L, o.amounts["b"]); assertEquals(33000L, o.amounts["me"]); assertEquals(0L, o.unassignedPaise)
    }

    @Test fun untickedPersonPaysNothing() {
        val o = SplitMath.compute(126000, SplitMode.EQUAL, listOf(Line("a"), Line("b", included = false), Line("me")))
        assertEquals(0L, o.amounts["b"]); assertEquals(63000L, o.amounts["a"])
    }

    @Test fun sharesWeightPortions() {
        val o = SplitMath.compute(120000, SplitMode.SHARES, listOf(Line("a", weight = 2), Line("b"), Line("me")))
        assertEquals(60000L, o.amounts["a"]); assertEquals(30000L, o.amounts["b"])
    }

    @Test fun overAssignedShowsNegativeRemainder() {
        val o = SplitMath.compute(100000, SplitMode.EQUAL, listOf(Line("a", fixedPaise = 70000), Line("me", fixedPaise = 50000)))
        assertEquals(-20000L, o.unassignedPaise)
    }

    @Test fun indianGrouping() {
        assertEquals("₹1,26,000", rupees(12600000)); assertEquals("₹420.50", rupees(42050)); assertEquals("₹999", rupees(99900))
    }
}
