package com.splitapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.sin

/**
 * A person's mark: a soft gradient creature with a tiny face. Shape, colours and expression
 * come from the name, so the same friend always looks the same and two friends rarely match.
 */
@Composable
fun Avatar(name: String, size: Dp = 40.dp, @Suppress("UNUSED_PARAMETER") ring: Color = Color.Transparent) {
    val seed = name.trim().lowercase().hashCode() and 0x7fffffff
    val (a, b) = Pairs[(seed xor (seed ushr 13)) % Pairs.size]
    val shape = (seed ushr 5) % 5
    val face = (seed ushr 9) % 4
    // Blink every few seconds, each character on its own rhythm; a tap squishes it.
    val reduce = rememberReduceMotion()
    val life = rememberInfiniteTransition(label = "life")
    val blink by life.animateFloat(
        1f, 1f,
        infiniteRepeatable(androidx.compose.animation.core.keyframes {
            durationMillis = 3200 + (seed % 2400)
            1f at 0; 1f at durationMillis - 220; 0.1f at durationMillis - 140; 1f at durationMillis - 40
        }), label = "blink",
    )
    val squish = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    Canvas(
        Modifier.size(size).semantics { contentDescription = name }
            .graphicsLayer { scaleY = squish.value; scaleX = 2f - squish.value; transformOrigin = TransformOrigin(0.5f, 1f) }
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val e = awaitPointerEvent(PointerEventPass.Initial)
                        if (!reduce && e.changes.any { it.pressed }) scope.launch {
                            squish.animateTo(0.82f, tween(90)); squish.animateTo(1f, androidx.compose.animation.core.spring(0.35f, 500f))
                        }
                    }
                }
            },
    ) {
        val w = this.size.width; val h = this.size.height
        val fill = Brush.linearGradient(listOf(a, b), start = Offset(0f, 0f), end = Offset(w, h))
        val body = bodyPath(shape, w, h)
        drawPath(body, fill)
        // Soft highlight, upper left, so the body reads as a rounded thing.
        drawPath(body, Brush.radialGradient(listOf(Color.White.copy(alpha = 0.45f), Color.Transparent), center = Offset(w * 0.32f, h * 0.28f), radius = w * 0.55f))
        drawFace(face, w, h, if (reduce) 1f else blink)
    }
}

// Muted on purpose: faces tell friends apart without competing with the money colours.
private val Pairs = listOf(
    Color(0xFFFFB13B) to Color(0xFFFF6A3D),   // orange creature
    Color(0xFF7CE0FF) to Color(0xFF3D6BFF),   // cyan to blue
    Color(0xFFFF8AD8) to Color(0xFF9B5CFF),   // pink to violet
    Color(0xFFB6F36B) to Color(0xFF1FB58F),   // lime to teal
    Color(0xFF9DF5D8) to Color(0xFF29A3C7),   // mint to ocean
    Color(0xFFB9A6FF) to Color(0xFF5C7CFF),   // lilac to periwinkle
).map { (a, b) -> mute(a) to mute(b) }

private fun mute(c: Color): Color = androidx.compose.ui.graphics.lerp(c, Color(0xFF8E8A80), 0.55f)

private fun DrawScope.bodyPath(kind: Int, w: Float, h: Float): Path = Path().apply {
    when (kind) {
        0 -> addOval(androidx.compose.ui.geometry.Rect(w * 0.06f, h * 0.06f, w * 0.94f, h * 0.94f))                       // round
        1 -> addRoundRect(androidx.compose.ui.geometry.RoundRect(w * 0.2f, h * 0.02f, w * 0.8f, h * 0.98f, CornerRadius(w * 0.3f)))   // tall pill
        2 -> {                                                                                                             // soft triangle
            moveTo(w * 0.5f, h * 0.08f)
            cubicTo(w * 0.62f, h * 0.08f, w * 0.98f, h * 0.78f, w * 0.9f, h * 0.88f)
            cubicTo(w * 0.82f, h * 0.98f, w * 0.18f, h * 0.98f, w * 0.1f, h * 0.88f)
            cubicTo(w * 0.02f, h * 0.78f, w * 0.38f, h * 0.08f, w * 0.5f, h * 0.08f)
            close()
        }
        3 -> addRoundRect(androidx.compose.ui.geometry.RoundRect(w * 0.06f, h * 0.06f, w * 0.94f, h * 0.94f, CornerRadius(w * 0.32f)))  // squircle
        else -> {                                                                                                          // tilted diamond
            val c = Offset(w / 2, h / 2); val r = w * 0.46f
            val pts = (0 until 4).map { i -> val t = Math.toRadians(90.0 * i + 15); Offset(c.x + r * cos(t).toFloat(), c.y + r * sin(t).toFloat()) }
            moveTo(pts[0].x, pts[0].y); pts.drop(1).forEach { lineTo(it.x, it.y) }; close()
        }
    }
}

private fun DrawScope.drawFace(kind: Int, w: Float, h: Float, open: Float = 1f) {
    val ink = Color(0xFF1B1530)
    val eyeY = h * 0.5f; val gap = w * 0.13f; val eye = w * 0.045f
    // A blink squashes the eyes to a line for a beat.
    if (open < 0.9f && kind != 2) {
        drawLine(ink, Offset(w / 2 - gap - eye, eyeY), Offset(w / 2 - gap + eye, eyeY), w * 0.035f, StrokeCap.Round)
        drawLine(ink, Offset(w / 2 + gap - eye, eyeY), Offset(w / 2 + gap + eye, eyeY), w * 0.035f, StrokeCap.Round)
        return drawMouth(kind, w, h, ink)
    }
    val stroke = Stroke(width = w * 0.045f, cap = StrokeCap.Round)
    when (kind) {
        0 -> { // calm: dots and a flat line
            drawCircle(ink, eye, Offset(w / 2 - gap, eyeY)); drawCircle(ink, eye, Offset(w / 2 + gap, eyeY))
            drawLine(ink, Offset(w / 2 - w * 0.05f, h * 0.64f), Offset(w / 2 + w * 0.05f, h * 0.64f), stroke.width, StrokeCap.Round)
        }
        1 -> { // smile
            drawCircle(ink, eye, Offset(w / 2 - gap, eyeY)); drawCircle(ink, eye, Offset(w / 2 + gap, eyeY))
            drawArc(ink, 20f, 140f, false, Offset(w / 2 - w * 0.08f, h * 0.54f), Size(w * 0.16f, h * 0.12f), style = stroke)
        }
        2 -> { // sleepy u_u
            drawArc(ink, 0f, 180f, false, Offset(w / 2 - gap - w * 0.05f, eyeY - h * 0.04f), Size(w * 0.1f, h * 0.08f), style = stroke)
            drawArc(ink, 0f, 180f, false, Offset(w / 2 + gap - w * 0.05f, eyeY - h * 0.04f), Size(w * 0.1f, h * 0.08f), style = stroke)
        }
        else -> { // little o mouth
            drawCircle(ink, eye, Offset(w / 2 - gap, eyeY)); drawCircle(ink, eye, Offset(w / 2 + gap, eyeY))
            drawCircle(ink, w * 0.035f, Offset(w / 2, h * 0.64f), style = Stroke(w * 0.035f))
        }
    }
}

/** Mouth only, for the blink frame. */
private fun DrawScope.drawMouth(kind: Int, w: Float, h: Float, ink: Color) {
    val stroke = Stroke(width = w * 0.045f, cap = StrokeCap.Round)
    when (kind) {
        0 -> drawLine(ink, Offset(w / 2 - w * 0.05f, h * 0.64f), Offset(w / 2 + w * 0.05f, h * 0.64f), stroke.width, StrokeCap.Round)
        1 -> drawArc(ink, 20f, 140f, false, Offset(w / 2 - w * 0.08f, h * 0.54f), Size(w * 0.16f, h * 0.12f), style = stroke)
        else -> drawCircle(ink, w * 0.035f, Offset(w / 2, h * 0.64f), style = Stroke(w * 0.035f))
    }
}

/**
 * The night ground, alive: one wide green glow drifts and breathes on a long loop, a touch
 * leaves a glow under the finger, and each tap sends out one soft ring. Touches pass straight
 * through. With animations removed, the washes hold still and touches leave no trail.
 */
@Composable
fun LivingGround(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val reduce = rememberReduceMotion()
    val t = rememberInfiniteTransition(label = "ground")
    val drift by t.animateFloat(0f, (2 * Math.PI).toFloat(), infiniteRepeatable(tween(16000, easing = LinearEasing), RepeatMode.Restart), label = "drift")
    val breathe by t.animateFloat(0.85f, 1.15f, infiniteRepeatable(tween(5200), RepeatMode.Reverse), label = "breathe")
    var touch by remember { mutableStateOf<Offset?>(null) }
    var ringAt by remember { mutableStateOf<Offset?>(null) }
    val glow = remember { Animatable(0f) }
    val ring = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    Box(
        modifier.pointerInput(reduce) {
            if (reduce) return@pointerInput
            awaitPointerEventScope {
                var wasDown = false
                while (true) {
                    val e = awaitPointerEvent(PointerEventPass.Initial)
                    val c = e.changes.firstOrNull() ?: continue
                    if (c.pressed) {
                        touch = c.position
                        if (!wasDown) {
                            ringAt = c.position
                            scope.launch { ring.snapTo(0f); ring.animateTo(1f, tween(900)) }
                        }
                        scope.launch { glow.animateTo(1f, tween(160)) }
                    } else scope.launch { glow.animateTo(0f, tween(1100)) }
                    wasDown = c.pressed
                }
            }
        },
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val d = if (reduce) 0f else drift
            val s = if (reduce) 1f else breathe
            // One open gradient: a single wide warm glow from the top, fading into night,
            // drifting a little side to side and breathing. Neutral, because green now means "owed to you".
            val r = size.maxDimension * 0.75f * s
            val center = Offset(size.width * (0.5f + 0.18f * cos(d)), size.height * (0.08f + 0.05f * sin(d * 0.8f)))
            drawRect(
                Brush.radialGradient(
                    0f to Color(0xFFF2EFE6).copy(alpha = 0.10f), 0.4f to Color(0xFFF2EFE6).copy(alpha = 0.035f), 1f to Color.Transparent,
                    center = center, radius = r,
                ),
            )
            touch?.let { p ->
                if (glow.value > 0f) {
                    val gr = 280.dp.toPx()
                    drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.13f * glow.value), Color.Transparent), center = p, radius = gr), gr, p)
                }
            }
            ringAt?.let { p ->
                if (ring.value < 1f) drawCircle(
                    Color.White.copy(alpha = 0.22f * (1f - ring.value)), 24.dp.toPx() + ring.value * 180.dp.toPx(), p,
                    style = Stroke(1.5.dp.toPx()),
                )
            }
        }
        content()
    }
}