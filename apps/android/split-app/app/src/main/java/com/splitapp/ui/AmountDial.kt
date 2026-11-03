package com.splitapp.ui

import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.splitapp.rupees
import com.splitapp.ui.theme.Inter
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlinx.coroutines.launch

/**
 * The big number with a gauge behind it: an arc of fine ticks, lit up to [progress],
 * and a needle at that point. When the amount changes the figure counts to its new value,
 * the needle sweeps, and each tick the needle passes is felt as a light haptic tap.
 */
@Composable
fun AmountDial(
    paise: Long,
    color: Color,
    modifier: Modifier = Modifier,
    progress: Float = 0f,
    height: Dp = 170.dp,
    caption: String? = null,
) {
    val view = LocalView.current
    val reduceMotion = rememberReduceMotion()
    val shown = remember { Animatable(paise.toFloat()) }
    val needle = remember { Animatable(progress) }
    var lastTick by remember { mutableIntStateOf(-1) }
    LaunchedEffect(paise, progress) {
        if (reduceMotion) { shown.snapTo(paise.toFloat()); needle.snapTo(progress); return@LaunchedEffect }
        kotlinx.coroutines.coroutineScope {
            launch { shown.animateTo(paise.toFloat(), tween(650, easing = FastOutSlowInEasing)) }
            needle.animateTo(progress, tween(650, easing = FastOutSlowInEasing)) {
                // One light tap per sixth of the dial the needle crosses: felt, never a buzz.
                val step = (value * 6).toInt()
                if (step != lastTick) { if (lastTick >= 0) view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK); lastTick = step }
            }
        }
    }
    // While counting, whole rupees; at rest, the exact amount.
    val text = if (shown.isRunning) rupees(shown.value.roundToLong() / 100 * 100, symbol = false) else rupees(paise, symbol = false)
    BoxWithConstraints(
        modifier.fillMaxWidth().height(height).semantics { contentDescription = rupees(paise) + (caption?.let { ", $it" } ?: "") },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Canvas(Modifier.matchParentSize()) {
            val ticks = 61
            val cx = size.width / 2
            val r = minOf(size.width * 0.46f, size.height * 0.92f)
            val cy = r + 6.dp.toPx()
            val long = 14.dp.toPx(); val short = 8.dp.toPx()
            for (i in 0 until ticks) {
                val f = i / (ticks - 1f)
                val a = PI * (1 + f) // left to right across the top
                val len = if (i % 5 == 0) long else short
                val lit = f <= needle.value + 0.001f && needle.value > 0f
                val c = if (lit) color.copy(alpha = 0.85f) else color.copy(alpha = 0.18f)
                val o = Offset(cx + r * cos(a).toFloat(), cy + r * sin(a).toFloat())
                val inn = Offset(cx + (r - len) * cos(a).toFloat(), cy + (r - len) * sin(a).toFloat())
                drawLine(c, inn, o, strokeWidth = 1.4.dp.toPx(), cap = StrokeCap.Round)
            }
            if (needle.value > 0f) {
                val a = PI * (1 + needle.value)
                val o = Offset(cx + (r + 6.dp.toPx()) * cos(a).toFloat(), cy + (r + 6.dp.toPx()) * sin(a).toFloat())
                // The needle stays inside the tick band so it never crosses the figure.
                val inn = Offset(cx + (r - 20.dp.toPx()) * cos(a).toFloat(), cy + (r - 20.dp.toPx()) * sin(a).toFloat())
                drawLine(color, inn, o, strokeWidth = 2.dp.toPx(), cap = StrokeCap.Round)
            }
        }
        // The figure fits inside the arc: its width is held to the chord inside the ticks,
        // so the rupee sign and the last digit never touch them. Long amounts step down.
        val size = with(LocalDensity.current) {
            val r = minOf(maxWidth.toPx() * 0.46f, height.toPx() * 0.92f)
            val inner = 2 * (r - 14.dp.toPx() - 14.dp.toPx())
            val ems = text.count { it.isDigit() } * 0.6f + text.count { it == ',' || it == '.' } * 0.28f + 0.42f
            minOf(height.toPx() * 0.5f, inner / ems).toSp()
        }
        Row(verticalAlignment = Alignment.Top, modifier = Modifier.padding(bottom = 0.dp)) {
            Text(
                "₹", color = color.copy(alpha = 0.75f),
                style = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = size * 0.32f),
                modifier = Modifier.padding(top = with(LocalDensity.current) { (size * 0.18f).toDp() }, end = 4.dp),
            )
            Text(
                text,
                style = TextStyle(
                    fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = size, lineHeight = size, color = color,
                    letterSpacing = size * -0.055f, fontFeatureSettings = "tnum",
                ),
            )
        }
    }
}

/** The dial in miniature, for status panels: a full ring of ticks lit up to [progress]. */
@Composable
fun RingGauge(progress: Float, color: Color, modifier: Modifier = Modifier, size: Dp = 64.dp) {
    val anim = remember { Animatable(0f) }
    LaunchedEffect(progress) { anim.animateTo(progress, tween(700, easing = FastOutSlowInEasing)) }
    Canvas(modifier.size(size)) {
        val ticks = 36
        val c = Offset(this.size.width / 2, this.size.height / 2)
        val r = this.size.minDimension / 2
        for (i in 0 until ticks) {
            val f = i / ticks.toFloat()
            val a = 2 * PI * f - PI / 2
            val lit = f < anim.value
            val len = if (i % 9 == 0) 9.dp.toPx() else 6.dp.toPx()
            drawLine(
                if (lit) color else color.copy(alpha = 0.2f),
                Offset(c.x + (r - len) * cos(a).toFloat(), c.y + (r - len) * sin(a).toFloat()),
                Offset(c.x + r * cos(a).toFloat(), c.y + r * sin(a).toFloat()),
                strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round,
            )
        }
    }
}