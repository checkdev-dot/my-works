package com.splitapp.sync

import android.content.Context
import com.splitapp.data.Expense
import com.splitapp.data.ME
import com.splitapp.data.Person
import com.splitapp.data.Share
import com.splitapp.data.SplitMode
import com.splitapp.data.Store
import com.splitapp.notify.Intake
import com.splitapp.rupees

/**
 * Tags from friends who also use the app. An "owe" tag adds an expense the sender paid for the
 * user; a "paid" tag records that a friend paid the user back. Each one is announced, never silent.
 */
object SyncReceiver {
    fun receive(context: Context, tags: List<SyncTag>, senderPhone: String?) {
        Store.init(context)
        tags.forEach { tag ->
            val l = Store.ledger.value
            when (tag) {
                is SyncTag.Owe -> {
                    if (l.expenses.any { it.ref == tag.ref }) return@forEach
                    val digits = senderPhone?.filter(Char::isDigit)?.takeLast(10)
                    val person = l.people.firstOrNull { digits != null && digits.length == 10 && it.phone?.filter(Char::isDigit)?.takeLast(10) == digits }
                        ?: l.people.firstOrNull { it.name.equals(tag.from, ignoreCase = true) }
                        ?: Person(Store.newId(), tag.from.ifBlank { "A friend" }, senderPhone, onApp = true)
                    Store.upsertPerson(person.copy(onApp = true))
                    Store.saveExpense(Expense(Store.newId(), tag.label.ifBlank { "Money" }, tag.paise, person.id, listOf(Share(ME, tag.paise)), mode = SplitMode.EXACT, ref = tag.ref), announce = false)
                    Intake.syncNote(context, "You owe ${first(person.name)} ${rupees(tag.paise)}", "Added from their reminder for ${tag.label}.")
                }
                is SyncTag.Paid -> {
                    // ref is "<expense>.<person>" for a share of a split, or "<expense>" for one-to-one money.
                    if (l.expenses.any { it.ref == "paid:${tag.ref}" }) return@forEach
                    val parts = tag.ref.split(".", limit = 2)
                    val e = l.expense(parts[0]) ?: return@forEach
                    if (e.paidBy != ME) return@forEach
                    val who = parts.getOrNull(1) ?: e.shares.firstOrNull { it.personId != ME }?.personId ?: return@forEach
                    val amount = e.owed(who).takeIf { it > 0 } ?: return@forEach
                    Store.saveExpense(Expense(Store.newId(), "Payment", amount, who, listOf(Share(ME, amount)), groupId = e.groupId, isPayment = true, mode = SplitMode.EXACT, ref = "paid:${tag.ref}"), announce = false)
                    Intake.syncNote(context, "${first(l.person(who)?.name)} paid you back", "${rupees(amount)} for ${e.title} is recorded.")
                }
            }
        }
    }

    private fun first(name: String?) = name?.substringBefore(' ') ?: "A friend"
}
