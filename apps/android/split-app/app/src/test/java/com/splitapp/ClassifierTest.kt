package com.splitapp

import com.splitapp.data.Ledger
import com.splitapp.data.Payment
import com.splitapp.data.PaymentStatus
import com.splitapp.detect.DebitParser
import com.splitapp.detect.ShareClassifier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ClassifierTest {
    private val turf = "Rs.1,800.00 debited from A/c XX7310 to VPA turfnation@ybl on 23-Oct. Ref 771204918"

    @Test fun unknownShopsOnlyComeBackWhenAskedFor() {
        assertNull(DebitParser.parse("x", turf))
        val d = DebitParser.parse("x", turf, unknownToo = true)!!
        assertEquals("Turfnation", d.label); assertFalse(d.known); assertEquals(180000L, d.amountPaise)
    }

    @Test fun cardSpendNamesTheShop() {
        assertEquals("CAFE MOCHA", DebitParser.parse("x", "INR 640.00 spent on HDFC Bank Card XX9921 on 23-Oct-26 at CAFE MOCHA. Avl Lmt INR 82,310", unknownToo = true)!!.label)
    }

    @Test fun knownServicesPopUp() {
        val d = DebitParser.parse("x", "Rs.1,260.00 debited from A/c XX4521 to VPA zomato@hdfcbank")!!
        assertEquals(ShareClassifier.Prompt.POPUP, ShareClassifier.classify(Ledger(), d, 0L, smarter = false).prompt)
    }

    @Test fun anUnknownShopWaitsQuietly() {
        val d = DebitParser.parse("x", turf, unknownToo = true)!!
        val v = ShareClassifier.classify(Ledger(), d, 0L, smarter = true)
        assertEquals(ShareClassifier.Source.UNSURE, v.source); assertEquals(ShareClassifier.Prompt.QUIET, v.prompt)
    }

    @Test fun learnsFromWhatTheUserDid() {
        val d = DebitParser.parse("x", turf, unknownToo = true)!!
        fun past(s: PaymentStatus, i: Int) = Payment("p$i", "other", 180000, "ICICI", i.toLong(), s, "Turfnation")
        val shared = Ledger(payments = List(3) { past(PaymentStatus.SPLIT, it) })
        assertEquals(ShareClassifier.Prompt.POPUP, ShareClassifier.classify(shared, d, 0L, smarter = false).prompt)
        val mine = Ledger(payments = List(3) { past(PaymentStatus.DISMISSED, it) })
        assertEquals(ShareClassifier.Prompt.SKIP, ShareClassifier.classify(mine, d, 0L, smarter = false).prompt)
    }

    @Test fun jevIsAskedOnlyWithSmarterDetectionAndOnlyTheShopName() {
        val d = DebitParser.parse("x", turf, unknownToo = true)!!
        var asked: ShareClassifier.JevRequest? = null
        ShareClassifier.jev = ShareClassifier.Jev { r -> asked = r; ShareClassifier.Verdict(0.86, ShareClassifier.Source.JEV, "Sports & venues", 8) }
        try {
            ShareClassifier.classify(Ledger(), d, 0L, smarter = false)
            assertNull(asked)
            val v = ShareClassifier.classify(Ledger(), d, 0L, smarter = true)
            assertEquals(ShareClassifier.Prompt.POPUP, v.prompt)
            val r = asked!!
            assertEquals("Turfnation", r.shop); assertEquals("₹1,000–2,000", r.amountBand)
            // Nothing from the message itself rides along.
            assertTrue(r.questions.none { (q, _) -> q.contains("XX7310") || q.contains("771204918") || q.contains("ICICI") })
        } finally {
            ShareClassifier.jev = ShareClassifier.Jev { null }
        }
    }
}
