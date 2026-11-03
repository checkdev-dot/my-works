package com.splitapp.data

const val ME = "me"

/** [upiId] is theirs, used only when the user pays them back. */
data class Person(val id: String, val name: String, val phone: String? = null, val onApp: Boolean = false, val upiId: String? = null)

/** [icon] is a key from GroupIcons; null means "guess it from the name". */
data class Group(val id: String, val name: String, val memberIds: List<String>, val icon: String? = null)

/**
 * A detected debit waiting in "To split". Splitting it creates an [Expense]; "Just me" dismisses it.
 * SKIPPED: set by the app, not the user, for a shop the user has kept as their own several times.
 */
enum class PaymentStatus { PENDING, LATER, DISMISSED, SPLIT, SKIPPED }

data class Payment(
    val id: String,
    val merchantId: String,
    val amountPaise: Long,
    val bank: String,
    val timestamp: Long,
    val status: PaymentStatus = PaymentStatus.PENDING,
    /** The shop as the bank wrote it, kept for payments to shops Split doesn't know yet. */
    val label: String? = null,
)

enum class SplitMode { EQUAL, EXACT, SHARES, PERCENT }

/** What one person owes of an expense. */
data class Share(val personId: String, val amountPaise: Long)

/**
 * The one kind of money record, the way Splitwise thinks about it: someone paid [totalPaise],
 * and each share says what a person owes of it. The payer's own share is in [shares] too.
 *
 * A settle-up is also an expense, with [isPayment] set: "Rahul paid you ₹500" is paidBy = Rahul,
 * shares = [me ₹500].
 */
data class Expense(
    val id: String,
    val title: String,
    val totalPaise: Long,
    val paidBy: String,
    val shares: List<Share>,
    val timestamp: Long = System.currentTimeMillis(),
    val groupId: String? = null,
    val merchantId: String? = null,
    /** The detected payment this came from, if any. */
    val paymentId: String? = null,
    val isPayment: Boolean = false,
    val mode: SplitMode = SplitMode.EQUAL,
    /** A friend's reference, when this came from their reminder: used to tell them it's paid. */
    val ref: String? = null,
) {
    fun owed(personId: String): Long = shares.filter { it.personId == personId }.sumOf { it.amountPaise }
    fun involves(personId: String): Boolean = paidBy == personId || shares.any { it.personId == personId }

    /**
     * What this expense moves between the user and [personId]. Positive: they owe the user more.
     * A third person paying moves nothing between the two of them.
     */
    fun netWith(personId: String): Long = when (paidBy) {
        ME -> owed(personId)
        personId -> -owed(ME)
        else -> 0L
    }
}

data class Ledger(
    val people: List<Person> = emptyList(),
    val groups: List<Group> = emptyList(),
    val payments: List<Payment> = emptyList(),
    val expenses: List<Expense> = emptyList(),
) {
    fun person(id: String): Person? = people.firstOrNull { it.id == id }
    fun group(id: String?): Group? = id?.let { g -> groups.firstOrNull { it.id == g } }
    fun payment(id: String): Payment? = payments.firstOrNull { it.id == id }
    fun expense(id: String): Expense? = expenses.firstOrNull { it.id == id }
    fun expenseFor(paymentId: String): Expense? = expenses.firstOrNull { it.paymentId == paymentId }

    /** Payments still waiting for an answer, newest first. */
    val toSplit: List<Payment> get() = payments.filter { it.status == PaymentStatus.PENDING || it.status == PaymentStatus.LATER }.sortedByDescending { it.timestamp }
}
