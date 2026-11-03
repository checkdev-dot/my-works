package com.splitapp.data

import com.splitapp.detect.Merchants
import com.splitapp.split.SplitMath

/**
 * Sample people, groups and expenses so the app can be seen full before any real payment
 * arrives. Every sample id starts with "x-" so it can be removed exactly, leaving real records.
 */
object SampleData {
    private const val DAY = 24 * 60 * 60 * 1000L
    private val extraPeople = mutableListOf<Person>()
    private val extraGroups = mutableListOf<Group>()

    fun load(now: Long = System.currentTimeMillis()) {
        val people = listOf(
            Person("x-rahul", "Rahul Mehta", "9876500001", onApp = true), Person("x-meera", "Meera Iyer", "9876500002"),
            Person("x-kabir", "Kabir Shah", "9876500003"), Person("x-ira", "Ira Sen", "9876500004", onApp = true),
            Person("x-arjun", "Arjun Rao", "9876500005"), Person("x-sana", "Sana Khan", "9876500006", upiId = "sana@okaxis"),
            Person("x-rohan", "Rohan Das", "9876500007"),
        )
        val groups = listOf(
            Group("x-flat", "Flat 302", listOf("x-rahul", "x-meera")),
            Group("x-football", "Sunday football", listOf("x-kabir", "x-arjun", "x-rohan")),
            Group("x-goa", "Goa trip", listOf("x-ira", "x-sana", "x-meera", "x-rahul")),
            Group("x-lunch", "Office lunch", listOf("x-arjun", "x-ira")),
        )
        // merchant (or a title), rupees, days ago, group, who paid
        data class S(val what: String, val rs: Long, val ago: Double, val g: String, val by: String = ME)
        val history = listOf(
            S("zomato", 1260, 0.2, "x-flat"), S("blinkit", 846, 1.0, "x-flat"),
            S("swiggy", 1530, 3.0, "x-flat", by = "x-meera"), S("instamart", 612, 5.0, "x-flat"),
            S("playo", 2400, 1.5, "x-football"), S("playo", 2400, 8.5, "x-football", by = "x-kabir"),
            S("district", 7200, 2.0, "x-goa"), S("Beach shack dinner", 3840, 4.0, "x-goa", by = "x-meera"),
            S("Cab to the airport", 1600, 4.2, "x-goa", by = "x-ira"),
            S("swiggy", 942, 0.9, "x-lunch"), S("zomato", 1180, 6.0, "x-lunch", by = "x-arjun"),
        )
        val expenses = mutableListOf<Expense>()
        val payments = mutableListOf<Payment>()
        history.forEachIndexed { i, s ->
            val id = "x-e$i"
            val ts = now - (s.ago * DAY).toLong()
            val everyone = listOf(ME) + groups.first { it.id == s.g }.memberIds
            val parts = SplitMath.distribute(s.rs * 100, List(everyone.size) { 1 })
            val m = Merchants.byId(s.what)
            // Payments the user made were detected; the rest were added by hand.
            val paymentId = if (m != null && s.by == ME) "x-p$i" else null
            if (paymentId != null) payments += Payment(paymentId, m!!.id, s.rs * 100, listOf("HDFC", "ICICI", "SBI", "Axis")[i % 4], ts, PaymentStatus.SPLIT)
            expenses += Expense(id, m?.name ?: s.what, s.rs * 100, s.by, everyone.mapIndexed { j, p -> Share(p, parts[j]) }, ts, s.g, m?.id, paymentId)
        }
        // Some money has already come back, some only partly.
        fun paid(id: String, from: String, to: String, rs: Long, ago: Double, g: String? = null) =
            Expense(id, "Payment", rs * 100, from, listOf(Share(to, rs * 100)), now - (ago * DAY).toLong(), g, isPayment = true, mode = SplitMode.EXACT)
        expenses += paid("x-s1", "x-meera", ME, 282, 0.8, "x-flat")
        expenses += paid("x-s2", "x-arjun", ME, 800, 1.2, "x-football")
        expenses += paid("x-s3", "x-sana", ME, 1440, 1.6, "x-goa")
        expenses += paid("x-s4", "x-rahul", ME, 200, 0.5, "x-flat")
        // Enough groups to need search: the life of someone who splits a lot. Some are busy, some
        // owe a little, many are long settled.
        val more = listOf(
            Person("x-tara", "Tara Nair"), Person("x-vik", "Vikram Joshi"), Person("x-anya", "Anya Kapoor"),
            Person("x-dev2", "Dhruv Malhotra"), Person("x-zoya", "Zoya Ali"),
        )
        extraPeople.clear(); extraPeople += more
        data class G(val id: String, val name: String, val who: List<String>, val spends: List<Triple<String, Long, Double>>, val settled: Boolean, val by: String = ME)
        val extra = listOf(
            G("x-g1", "Badminton Tuesdays", listOf("x-kabir", "x-sana"), listOf(Triple("Playo", 800, 3.5), Triple("Shuttles", 650, 10.0)), false),
            G("x-g2", "Manali 2026", listOf("x-tara", "x-vik", "x-anya", "x-rahul"), listOf(Triple("Hotel Snow Valley", 14400, 34.0), Triple("Bus to Manali", 5200, 36.0), Triple("Cafe 1947", 2860, 33.0)), true),
            G("x-g3", "Book club", listOf("x-ira", "x-zoya"), listOf(Triple("Chai and samosa", 420, 12.0)), true),
            G("x-g4", "Diwali party", listOf("x-meera", "x-rahul", "x-tara", "x-vik"), listOf(Triple("Blinkit", 3120, 6.5), Triple("Decorations", 1800, 7.0)), false, "x-tara"),
            G("x-g5", "Cricket Sundays", listOf("x-kabir", "x-arjun", "x-rohan", "x-dev2"), listOf(Triple("Turf booking", 2400, 2.5)), false),
            G("x-g6", "Rent split", listOf("x-rahul", "x-meera"), listOf(Triple("October rent", 54000, 22.0)), true),
            G("x-g7", "Wi-Fi and bills", listOf("x-rahul", "x-meera"), listOf(Triple("ACT Fibernet", 1180, 15.0), Triple("Electricity", 2640, 18.0)), false),
            G("x-g8", "Pondicherry weekend", listOf("x-anya", "x-zoya", "x-ira"), listOf(Triple("Airbnb", 9600, 48.0), Triple("Scooty rental", 1500, 47.0)), true),
            G("x-g9", "Office chai", listOf("x-arjun", "x-ira", "x-dev2"), listOf(Triple("Chai Point", 360, 1.2)), false, "x-arjun"),
            G("x-g10", "Gym buddies", listOf("x-vik", "x-dev2"), listOf(Triple("Protein bars", 1240, 9.0)), true),
            G("x-g11", "Concert crew", listOf("x-sana", "x-zoya", "x-anya"), listOf(Triple("BookMyShow", 6000, 26.0)), true),
            G("x-g12", "Birthday: Meera", listOf("x-rahul", "x-ira", "x-tara"), listOf(Triple("Cake from Theobroma", 1450, 40.0), Triple("Dinner at Toit", 7600, 40.0)), true),
            G("x-g13", "Movie nights", listOf("x-rohan", "x-kabir"), listOf(Triple("PVR", 1080, 5.0)), false),
            G("x-g14", "Carpool", listOf("x-vik", "x-tara"), listOf(Triple("Uber", 640, 0.6), Triple("Fuel", 2000, 8.0)), false),
            G("x-g15", "Kitchen supplies", listOf("x-rahul", "x-meera"), listOf(Triple("Zepto", 1430, 4.0)), true),
            G("x-g16", "Coorg trip", listOf("x-ira", "x-sana", "x-anya", "x-dev2"), listOf(Triple("Homestay", 12800, 60.0), Triple("Jeep safari", 4000, 59.0)), true),
            G("x-g17", "Lunch with interns", listOf("x-zoya", "x-dev2"), listOf(Triple("EazyDiner", 2280, 2.8)), false),
            G("x-g18", "Wedding gift: Rohan", listOf("x-kabir", "x-arjun", "x-sana"), listOf(Triple("Amazon", 8000, 30.0)), true),
        )
        val icons = mapOf("x-g2" to "trip", "x-g8" to "trip", "x-g16" to "trip", "x-g6" to "home", "x-g7" to "home", "x-g15" to "grocery")
        extraGroups.clear()
        extra.forEachIndexed { gi, g ->
            extraGroups += Group(g.id, g.name, g.who, icons[g.id])
            val everyone = listOf(ME) + g.who
            g.spends.forEachIndexed { si, (title, rs, ago) ->
                val parts = SplitMath.distribute(rs * 100, List(everyone.size) { 1 })
                val ts = now - (ago * DAY).toLong()
                val m = Merchants.all.firstOrNull { it.name.equals(title, ignoreCase = true) }
                val id = "x-${g.id}-$si"
                expenses += Expense(id, title, rs * 100, g.by, everyone.mapIndexed { j, p -> Share(p, parts[j]) }, ts, g.id, m?.id)
                // A settled group: everyone squared up a day later.
                if (g.settled) everyone.filter { it != g.by }.forEachIndexed { j, p ->
                    expenses += Expense("$id-p$j", "Payment", parts[everyone.indexOf(p)], p, listOf(Share(g.by, parts[everyone.indexOf(p)])), ts + DAY, g.id, isPayment = true, mode = SplitMode.EXACT)
                }
            }
        }
        // Money outside any group.
        expenses += Expense("x-d1", "Concert tickets", 50000, "x-sana", listOf(Share(ME, 50000)), now - 4 * DAY, mode = SplitMode.EXACT)
        expenses += Expense("x-d2", "Chai and samosa", 15000, "x-rohan", listOf(Share(ME, 15000)), now - 1 * DAY, mode = SplitMode.EXACT)
        payments += Payment("x-w1", "blinkit", 41200, "HDFC", now - 20 * 60 * 1000L, PaymentStatus.LATER)
        payments += Payment("x-w2", "swiggy", 68400, "ICICI", now - 2 * 60 * 60 * 1000L, PaymentStatus.LATER)
        Store.update { l ->
            l.copy(
                people = l.people.filterNot { it.id.startsWith("x-") } + people + extraPeople,
                groups = l.groups.filterNot { it.id.startsWith("x-") } + groups + extraGroups,
                payments = (payments + l.payments.filterNot { it.id.startsWith("x-") }).sortedByDescending { it.timestamp },
                expenses = (expenses + l.expenses.filterNot { it.id.startsWith("x-") }).sortedByDescending { it.timestamp },
            )
        }
    }

    fun clear() = Store.update { l ->
        l.copy(
            people = l.people.filterNot { it.id.startsWith("x-") },
            groups = l.groups.filterNot { it.id.startsWith("x-") },
            payments = l.payments.filterNot { it.id.startsWith("x-") },
            expenses = l.expenses.filterNot { it.id.startsWith("x-") },
        )
    }

    fun present(l: Ledger) = l.people.any { it.id.startsWith("x-") }
}
