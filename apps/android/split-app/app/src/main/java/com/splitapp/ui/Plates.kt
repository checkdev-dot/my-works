package com.splitapp.ui

import android.provider.Settings as AndroidSettings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.graphics.drawable.toBitmap
import com.splitapp.detect.Merchant
import com.splitapp.ui.theme.LocalBoard
import com.splitapp.ui.theme.numerals
import com.splitapp.ui.theme.money
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * A hung tin number plate. State is its form, not its colour:
 * solid = open, struck = settled, outlined = your own share.
 * A solid plate is a keycap: it stands on a darker lip and sinks onto it when pressed.
 * When the value changes the plate flips about its top edge like a scoreboard number.
 */
@Composable
fun Plate(
    text: String,
    modifier: Modifier = Modifier,
    settled: Boolean = false,
    mine: Boolean = false,
    size: Int = 28,
    minWidth: Dp = 92.dp,
    onClick: (() -> Unit)? = null,
    label: String? = null,
) {
    val b = LocalBoard.current
    val view = androidx.compose.ui.platform.LocalView.current
    val reduceMotion = rememberReduceMotion()
    val rot = remember { Animatable(0f) }
    var shown by remember { mutableStateOf(text) }
    LaunchedEffect(text) {
        if (text == shown) return@LaunchedEffect
        if (reduceMotion) { shown = text; return@LaunchedEffect }
        rot.animateTo(90f, tween(110))
        shown = text
        rot.snapTo(-90f)
        rot.animateTo(0f, tween(140))
    }
    val source = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    LaunchedEffect(pressed) { if (pressed) Feel.tick(view) }
    val sink by androidx.compose.animation.core.animateFloatAsState(
        if (pressed) 1f else 0f,
        androidx.compose.animation.core.spring(dampingRatio = 0.5f, stiffness = 1400f), label = "plate",
    )
    val shape = RoundedCornerShape(6.dp)
    val solid = !mine && !settled
    val lift = if (solid) 3.dp else 0.dp
    Box(
        modifier
            .graphicsLayer { rotationX = rot.value; transformOrigin = TransformOrigin(0.5f, 0f); cameraDistance = 12 * density }
            .then(if (solid) Modifier.background(androidx.compose.ui.graphics.lerp(b.plate, Color.Black, 0.45f), shape) else Modifier),
    ) {
        val face = Modifier
            .padding(bottom = lift)
            .graphicsLayer { translationY = sink * lift.toPx() }
            .defaultMinSize(minWidth = minWidth, minHeight = (size * 1.5).dp)
            .clip(shape)
            .let { m ->
                when {
                    solid -> m.background(Brush.verticalGradient(listOf(Color.White, b.plate)), shape)
                    mine -> m.border(1.5.dp, b.paint.copy(alpha = 0.7f), shape)
                    else -> m.border(1.5.dp, b.paint, shape)
                }
            }
            .let { m -> if (onClick != null) m.clickable(source, androidx.compose.material3.ripple(), role = Role.Button, onClickLabel = label, onClick = onClick) else m }
            .padding(horizontal = 12.dp)
        // Settling draws a strike across the figure, left to right, like a pen through a paid line.
        val strike by androidx.compose.animation.core.animateFloatAsState(
            if (settled) 1f else 0f, tween(if (reduceMotion) 0 else 320), label = "strike",
        )
        val ink = if (solid) b.plateInk else b.paint
        Box(
            face.drawWithContent {
                drawContent()
                if (strike > 0f) drawLine(ink, androidx.compose.ui.geometry.Offset(0f, drawContext.size.height / 2), androidx.compose.ui.geometry.Offset(drawContext.size.width * strike, drawContext.size.height / 2), 2.dp.toPx())
            },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                money(shown),
                style = numerals(size),
                color = if (solid) b.plateInk else b.paint.copy(alpha = if (settled) 0.6f else 1f),
                maxLines = 1,
            )
        }
    }
}
@Composable
fun rememberReduceMotion(): Boolean {
    val ctx = LocalContext.current
    return remember { AndroidSettings.Global.getFloat(ctx.contentResolver, AndroidSettings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}

/** The service's real icon, read from the app installed on this phone; a lettered plate when it is not installed. */
@Composable
fun MerchantIcon(merchant: Merchant?, size: Dp = 40.dp) {
    val b = LocalBoard.current
    val ctx = LocalContext.current
    val icon by produceState<ImageBitmap?>(null, merchant?.packageName) {
        val pkg = merchant?.packageName ?: return@produceState
        value = withContext(Dispatchers.IO) {
            runCatching { ctx.packageManager.getApplicationIcon(pkg).toBitmap(128, 128).asImageBitmap() }.getOrNull()
        }
    }
    val shape = RoundedCornerShape(size * 0.25f)
    val current = icon
    if (current != null) {
        Image(current, contentDescription = merchant?.name, modifier = Modifier.size(size).clip(shape))
    } else {
        // The brand's colour lives here, in the small icon, and nowhere else on screen.
        val brand = merchant?.let { Color(it.brandArgb) } ?: b.plate
        val ink = if (brand.luminance() > 0.45f) Color(0xFF0A0C0B) else Color.White
        Box(Modifier.size(size).background(brand, shape), contentAlignment = Alignment.Center) {
            Text((merchant?.name ?: "₹").take(1), style = numerals((size.value * 0.55f).toInt()), color = ink)
        }
    }
}
