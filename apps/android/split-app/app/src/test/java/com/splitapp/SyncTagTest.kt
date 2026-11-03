package com.splitapp

import com.splitapp.sync.SyncTag
import org.junit.Assert.assertEquals
import org.junit.Test

class SyncTagTest {
    @Test fun oweRoundTripsThroughAMessage() {
        val tag = SyncTag.Owe("x-p0.x-rahul", 42000, "Zomato", "Dev")
        val msg = "Hi Rahul! Your share for Zomato on 23 Oct is ₹420.\nPay me on UPI: dev@okhdfc\n" + tag.encode()
        assertEquals(listOf(tag), SyncTag.findAll(msg))
    }

    @Test fun paidTagsAreReadSeveralAtOnce() {
        val msg = "I've paid you back ₹650. " + SyncTag.Paid("d1").encode() + " " + SyncTag.Paid("d2").encode()
        assertEquals(listOf(SyncTag.Paid("d1"), SyncTag.Paid("d2")), SyncTag.findAll(msg))
    }

    @Test fun separatorsInNamesCannotBreakTheTag() {
        val tag = SyncTag.Owe("r", 100, "Chai · samosa", "A [B]")
        assertEquals("Chai   samosa", (SyncTag.findAll(tag.encode()).single() as SyncTag.Owe).label)
    }

    @Test fun ordinaryMessagesHaveNoTags() {
        assertEquals(emptyList<SyncTag>(), SyncTag.findAll("Rs.1,260.00 debited from A/c XX4521 to VPA zomato@hdfcbank"))
    }
}
