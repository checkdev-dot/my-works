package com.splitapp.split

import com.splitapp.data.SplitMode
import kotlin.math.roundToLong

/**
 * One person's line in the split being edited.
 * [fixedPaise] pins an amount the user typed; everyone else rebalances around it.
 */
data class Line(
    val personId: String,
    val included: Boolean = true,
    val fixedPaise: Long? = null,
    val weight: Int = 1,
    val percent: Double = 0.0,
)

data class Outcome(val amounts: Map<String, Long>, val unassignedPaise: Long)

object SplitMath {
    fun compute(totalPaise: Long, mode: SplitMode, lines: List<Line>): Outcome {
        val active = lines.filter { it.included }
        val amounts = linkedMapOf<String, Long>()
        lines.forEach { amounts[it.personId] = 0L }

        when (mode) {
            SplitMode.PERCENT -> active.forEach { amounts[it.personId] = (totalPaise * it.percent / 100.0).roundToLong() }
            SplitMode.EQUAL, SplitMode.EXACT, SplitMode.SHARES -> {
                val fixed = active.filter { it.fixedPaise != null }
                fixed.forEach { amounts[it.personId] = it.fixedPaise!! }
                val free = active.filter { it.fixedPaise == null }
                val rest = totalPaise - fixed.sumOf { it.fixedPaise!! }
                if (free.isNotEmpty() && rest > 0) {
                    val weights = free.map { if (mode == SplitMode.SHARES) it.weight.coerceAtLeast(0) else 1 }
                    distribute(rest, weights).forEachIndexed { i, v -> amounts[free[i].personId] = v }
                }
            }
        }
        return Outcome(amounts, totalPaise - amounts.values.sum())
    }

    /**
     * Splits [total] by [weights] in whole rupees where possible, so nobody is asked for ₹419.99.
     * Leftover rupees and paise go to the first lines.
     */
    fun distribute(total: Long, weights: List<Int>): List<Long> {
        val sum = weights.sum()
        if (sum == 0) return weights.map { 0L }
        val rupees = total / 100
        val paise = total % 100
        val base = weights.map { rupees * it / sum }
        var left = rupees - base.sum()
        val out = base.toMutableList()
        var i = 0
        while (left > 0) {
            if (weights[i % weights.size] > 0) { out[i % weights.size]++; left-- }
            i++
        }
        val result = out.map { it * 100 }.toMutableList()
        val first = weights.indexOfFirst { it > 0 }
        if (first >= 0) result[first] += paise
        return result
    }
}
