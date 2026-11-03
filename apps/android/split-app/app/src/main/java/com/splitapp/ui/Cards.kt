package com.splitapp.ui

import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.layout.width
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.splitapp.ui.theme.Board
import com.splitapp.ui.theme.BoardTheme
import com.splitapp.ui.theme.Night
import kotlin.math.max

/**
 * The card every payment lives on: the brand colour glowing from the upper middle,
 * deepening to near-black at the edges, with a faint dot grid like a stadium board's bulbs.
 */
@Composable
fun GlowCard(
    board: Board,
    modifier: Modifier = Modifier,
    radius: Dp = 32.dp,
    glow: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    val brand = board.ground
    val light = lerp(brand, Color.White, if (board.isLight) 0.10f else 0.22f)
    val deep = lerp(brand, Night, 0.55f)
    val edge = lerp(brand, Night, 0.82f)
    val shadowed = if (glow) modifier.shadow(28.dp, shape, ambientColor = brand, spotColor = brand) else modifier
    Box(
        shadowed
            .clip(shape)
            .drawBehind {
                drawRect(
                    Brush.radialGradient(
                        0f to light, 0.38f to brand, 0.78f to deep, 1f to edge,
                        center = Offset(size.width * 0.5f, size.height * 0.32f),
                        radius = max(size.width, size.height) * 0.78f,
                    ),
                )
                // Dot grid: the board's bulbs, felt more than seen.
                val step = 7.dp.toPx()
                val dot = Color.White.copy(alpha = if (board.isLight) 0.10f else 0.055f)
                var y = step / 2
                while (y < size.height) {
                    var x = step / 2
                    while (x < size.width) { drawCircle(dot, 0.9f, Offset(x, y)); x += step }
                    y += step
                }
            }
            .border(1.dp, Color.White.copy(alpha = 0.14f), shape),
    ) { BoardTheme(board) { content() } }
}

/** Haptics shared by every pressable thing: a light tick on touch, a firmer confirm on the action. */
object Feel {
    fun tick(view: android.view.View) { view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }
    fun confirm(view: android.view.View) {
        view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
    }
}

/**
 * A keycap: a face that sits [lift] above a darker lip. Pressing sinks the face onto the lip
 * with a spring and a haptic tick; letting go springs it back.
 */
@Composable
fun Keycap(
    onClick: () -> Unit,
    face: Color,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    radius: Dp = 26.dp,
    lift: Dp = 4.dp,
    lip: Color = lerp(face, Color.Black, 0.45f).copy(alpha = maxOf(face.alpha, 0.55f)),
    confirm: Boolean = false,
    label: String? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    val view = LocalView.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val sink by animateFloatAsState(
        if (pressed && enabled) 1f else 0f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessHigh),
        label = "sink",
    )
    LaunchedEffect(pressed) { if (pressed && enabled) Feel.tick(view) }
    // propagateMinConstraints: a keycap given a size fills it; one without a size wraps its label.
    Box(modifier.graphicsLayer { alpha = if (enabled) 1f else 0.5f }.lipUnder(shape, lip, lift), propagateMinConstraints = true) {
        Box(
            Modifier
                .padding(bottom = lift)
                .graphicsLayer { translationY = sink * lift.toPx() }
                .clip(shape)
                .background(Brush.verticalGradient(listOf(lerp(face, Color.White, 0.16f).copy(alpha = face.alpha), face)))
                .border(1.dp, Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.5f * face.alpha.coerceAtLeast(0.3f)), Color.Transparent)), shape)
                .clickable(source, ripple(), enabled = enabled, role = Role.Button, onClickLabel = label) {
                    if (confirm) Feel.confirm(view)
                    onClick()
                },
            contentAlignment = Alignment.Center,
            content = content,
        )
    }
}

/** The one filled action: a light keycap. */
@Composable
fun PrimaryPill(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, board: Board, icon: androidx.compose.ui.graphics.vector.ImageVector? = null) {
    Keycap(onClick, board.plate, modifier.height(56.dp), enabled = enabled, confirm = true) {
        Row(Modifier.padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
            if (icon != null) { Icon(icon, null, tint = board.plateInk, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)) }
            Text(text, style = MaterialTheme.typography.titleMedium, color = board.plateInk, maxLines = 1)
        }
    }
}

/** Secondary actions: a translucent keycap that takes the colour of whatever it sits on. */
@Composable
fun GhostPill(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, board: Board, icon: androidx.compose.ui.graphics.vector.ImageVector? = null) {
    // On light brand colours a dark wash muddies the label; a light wash keeps it legible.
    val face = if (board.isLight) Color.White.copy(alpha = 0.38f) else board.paint.copy(alpha = 0.16f)
    Keycap(onClick, face, modifier.height(56.dp), enabled = enabled, lip = Color.Black.copy(alpha = if (board.isLight) 0.22f else 0.35f)) {
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
            if (icon != null) { Icon(icon, null, tint = board.paint, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)) }
            Text(text, style = MaterialTheme.typography.bodyLarge, color = board.paint, maxLines = 1)
        }
    }
}

/** A small fact on a raised plate: the same face-on-lip as every keycap, only not pressable. */
@Composable
fun Tag(text: String, board: Board, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(14.dp)
    Box(modifier.lipUnder(shape, Color.Black.copy(alpha = 0.5f), 3.dp)) {
        Text(
            text, style = MaterialTheme.typography.labelLarge, color = board.paint,
            modifier = Modifier.padding(bottom = 3.dp)
                .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.16f), Color.White.copy(alpha = 0.09f))), shape)
                .border(1.dp, Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.25f), Color.Transparent)), shape)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}
// ---------------------------------------------------------------------------------------------
// Surface tiers. Size, glow, saturation and corner radius step down with importance:
//   GlowCard  = the action you must decide now (one on screen, brand glow, 32 radius)
//   Panel     = status you glance at (flat tint, no glow, 24 radius)
//   Tile      = one row of a list you edit (neutral, 20 radius)
// ---------------------------------------------------------------------------------------------

/** Status tier: a flat surface tinted from [tint], lit faintly from the top edge. */
@Composable
fun Panel(tint: Color, modifier: Modifier = Modifier, radius: Dp = 24.dp, content: @Composable BoxScope.() -> Unit) {
    val shape = RoundedCornerShape(radius)
    Box(
        modifier
            .clip(shape)
            .background(Brush.verticalGradient(listOf(lerp(Night, tint, 0.30f), lerp(Night, tint, 0.16f))))
            .border(1.dp, tint.copy(alpha = 0.28f), shape),
        content = content,
    )
}

/** List tier: one editable row. Selected rows pick up the accent faintly. */
@Composable
fun Tile(modifier: Modifier = Modifier, accent: Color? = null, content: @Composable BoxScope.() -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    Box(
        modifier
            .clip(shape)
            .background(if (accent != null) accent.copy(alpha = 0.10f) else Color.White.copy(alpha = 0.045f))
            .border(1.dp, if (accent != null) accent.copy(alpha = 0.35f) else Color.White.copy(alpha = 0.08f), shape),
        content = content,
    )
}

/** A round keycap that ticks on and off: the app's checkbox. */
@Composable
fun TickKey(checked: Boolean, accent: Color, onAccent: Color, onToggle: () -> Unit, label: String) {
    Keycap(
        onToggle,
        if (checked) accent else Color.White.copy(alpha = 0.10f),
        Modifier.minimumInteractiveComponentSize().size(36.dp),
        radius = 18.dp, lift = 3.dp,
        lip = if (checked) lerp(accent, Color.Black, 0.5f) else Color.Black.copy(alpha = 0.5f),
        label = label,
    ) {
        if (checked) Icon(Icons.Filled.Check, null, tint = onAccent, modifier = Modifier.size(20.dp))
    }
}

/** Text field colours for the night ground: a soft filled well, no hard outline until focused. */
@Composable
fun wellColors(accent: Color) = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
    unfocusedContainerColor = Color.White.copy(alpha = 0.06f), focusedContainerColor = Color.White.copy(alpha = 0.09f),
    unfocusedBorderColor = Color.Transparent, focusedBorderColor = accent,
    cursorColor = accent, focusedLabelColor = accent,
    unfocusedPlaceholderColor = Color(0xFFF2EFE6).copy(alpha = 0.62f), unfocusedLabelColor = Color(0xFFF2EFE6).copy(alpha = 0.72f),
)
val WellShape = RoundedCornerShape(20.dp)
/**
 * Section header in the app's own language: spaced caps, then a rule of gauge ticks that fades
 * out to the right, ending in the count on a small plate. Same ticks as the dial.
 */
@Composable
fun SectionHeader(title: String, count: Int? = null, modifier: Modifier = Modifier, color: Color = Color(0xFFF2EFE6), onAdd: (() -> Unit)? = null, addLabel: String = "Add") {
    Row(modifier.fillMaxWidth().height(28.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title.uppercase(), style = MaterialTheme.typography.labelLarge.copy(letterSpacing = 1.6.sp), color = color)
        Spacer(Modifier.width(12.dp))
        androidx.compose.foundation.Canvas(Modifier.weight(1f).height(12.dp)) {
            val step = 6.dp.toPx()
            var x = 0f; var i = 0
            while (x < size.width) {
                val fade = 1f - x / size.width
                val tall = i % 5 == 0
                drawLine(
                    color.copy(alpha = (if (tall) 0.55f else 0.3f) * fade),
                    Offset(x, if (tall) 0f else size.height * 0.35f), Offset(x, size.height),
                    strokeWidth = 1.2.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round,
                )
                x += step; i++
            }
        }
        if (count != null) {
            Spacer(Modifier.width(10.dp))
            Box(
                Modifier.background(color, RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
            ) { Text(count.toString(), style = com.splitapp.ui.theme.numerals(15), color = Night) }
        }
        if (onAdd != null) {
            Spacer(Modifier.width(10.dp))
            Keycap(onAdd, Color.White.copy(alpha = 0.12f), Modifier.minimumInteractiveComponentSize().size(36.dp), radius = 18.dp, lift = 3.dp, lip = Color.Black.copy(alpha = 0.5f), label = addLabel) {
                Icon(androidx.compose.material.icons.Icons.Filled.Add, addLabel, tint = color, modifier = Modifier.size(20.dp))
            }
        }
    }
}

/** A small dot that breathes while the app is listening, and sits still and grey when it is not. */
@Composable
fun LiveDot(on: Boolean, color: Color = Color(0xFF5BD69A)) {
    val pulse = androidx.compose.animation.core.rememberInfiniteTransition(label = "live")
    val a by pulse.animateFloat(
        0.35f, 1f,
        androidx.compose.animation.core.infiniteRepeatable<Float>(androidx.compose.animation.core.tween(1100), androidx.compose.animation.core.RepeatMode.Reverse),
        label = "a",
    )
    val reduce = rememberReduceMotion()
    Box(Modifier.size(8.dp).background(if (on) color.copy(alpha = if (reduce) 1f else a) else Color(0xFF6B726E), RoundedCornerShape(4.dp)))
}
/** The spacing scale. Every gap in the app is one of these. */
object Space {
    val xs = 4.dp; val s = 8.dp; val m = 12.dp; val l = 16.dp; val xl = 24.dp; val xxl = 32.dp; val xxxl = 48.dp
}
/**
 * The depth every raised surface shares with the keycaps: a face standing [depth] above a darker
 * lip. With [onClick] it sinks onto the lip when pressed, with a haptic tick; without, it only stands.
 */
@Composable
fun Slab(
    shape: androidx.compose.ui.graphics.Shape,
    lip: Color,
    modifier: Modifier = Modifier,
    depth: Dp = 5.dp,
    onClick: (() -> Unit)? = null,
    label: String? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val view = LocalView.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val sink by animateFloatAsState(if (pressed) 1f else 0f, spring(dampingRatio = 0.55f, stiffness = 900f), label = "slab")
    LaunchedEffect(pressed) { if (pressed) Feel.tick(view) }
    Box(modifier.lipUnder(shape, lip, depth), propagateMinConstraints = true) {
        Box(
            Modifier
                .padding(bottom = depth)
                .graphicsLayer { translationY = sink * depth.toPx() }
                .let { m -> if (onClick != null) m.clip(shape).clickable(source, ripple(), role = Role.Button, onClickLabel = label, onClick = onClick) else m },
            propagateMinConstraints = true,
            content = content,
        )
    }
}
/** The app's switch: a groove with a keycap that slides across. On is the cream face; off is a dark groove. */
@Composable
fun KeySwitch(on: Boolean, enabled: Boolean = true) {
    val x by animateFloatAsState(if (on) 1f else 0f, spring(dampingRatio = 0.6f, stiffness = 700f), label = "switch")
    val track = lerp(Color.White.copy(alpha = 0.10f), Color(0xFFF2EFE6).copy(alpha = 0.9f), x)
    Box(
        Modifier.size(56.dp, 32.dp).graphicsLayer { alpha = if (enabled) 1f else 0.4f }
            .background(track, RoundedCornerShape(16.dp))
            .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(16.dp))
            .padding(3.dp),
    ) {
        Box(
            Modifier.graphicsLayer { translationX = x * 24.dp.toPx() }.size(26.dp)
                .background(Color.Black.copy(alpha = 0.45f), RoundedCornerShape(13.dp))
                .padding(bottom = 2.dp)
                .background(if (on) Night else Color(0xFFF2EFE6), RoundedCornerShape(13.dp)),
        )
    }
}
/**
 * Draws a keycap lip that shows only below the face: the lip shape offset down by [lift], with the
 * face's own area cleared, so translucent faces never look muddy over a dark lip.
 */
fun Modifier.lipUnder(shape: androidx.compose.ui.graphics.Shape, lip: Color, lift: Dp) = this
    .graphicsLayer { compositingStrategy = androidx.compose.ui.graphics.CompositingStrategy.Offscreen }
    .drawBehind {
        val l = lift.toPx()
        val faceSize = androidx.compose.ui.geometry.Size(size.width, size.height - l)
        val lipOutline = shape.createOutline(faceSize, layoutDirection, this)
        translate(top = l) { drawOutline(lipOutline, lip) }
        drawOutline(lipOutline, Color.Black, blendMode = androidx.compose.ui.graphics.BlendMode.Clear)
    }
// ---------------------------------------------------------------------------------------------
// Attention tiers (docs/attention-map.md). Each element gets one, from its 40-point score:
//   T1 Hero  = the one figure or action a screen is about: big numerals on the ground, no box
//   T2 Card  = things you act on: a raised Tile (people, payments to split, who's in)
//   T3 Line  = things you read: a plain line with a hairline, no box (activity, groups, shares)
//   T4 Quiet = labels, counts, small text buttons
// A screen's first view may spend at most 40 points: T1 10, T2 5, T3 2, T4 1.
// ---------------------------------------------------------------------------------------------

/** T1: the screen's one big figure, with what it means in words above it. */
@Composable
fun Hero(words: String, paise: Long, color: Color, modifier: Modifier = Modifier, size: Int = 44) {
    androidx.compose.foundation.layout.Column(modifier) {
        Text(words, style = MaterialTheme.typography.bodyLarge, color = Color(0xFFF2EFE6).copy(alpha = 0.72f))
        Text(com.splitapp.ui.theme.money(com.splitapp.rupees(paise)), style = com.splitapp.ui.theme.numerals(size), color = color)
    }
}

/** T4: a quiet section label, small caps and a count, with an optional small add button. */
@Composable
fun SectionLabel(title: String, count: Int? = null, modifier: Modifier = Modifier, onAdd: (() -> Unit)? = null, addLabel: String = "Add") {
    Row(modifier.fillMaxWidth().height(32.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title.uppercase(), style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.4.sp), color = Color(0xFFF2EFE6).copy(alpha = 0.6f))
        if (count != null) Text("  $count", style = MaterialTheme.typography.labelSmall, color = Color(0xFFF2EFE6).copy(alpha = 0.4f))
        Spacer(Modifier.weight(1f))
        if (onAdd != null) androidx.compose.material3.TextButton(onAdd) {
            Icon(Icons.Filled.Add, null, tint = Color(0xFFF2EFE6), modifier = Modifier.size(18.dp))
            Text(" $addLabel", style = MaterialTheme.typography.labelLarge, color = Color(0xFFF2EFE6))
        }
    }
}

/** T3: one readable line, no box; a hairline below separates it from the next. */
@Composable
fun Line(onClick: (() -> Unit)? = null, label: String? = null, divider: Boolean = true, content: @Composable RowScope.() -> Unit) {
    androidx.compose.foundation.layout.Column {
        Row(
            Modifier.fillMaxWidth()
                .let { m -> if (onClick != null) m.clickable(role = Role.Button, onClickLabel = label, onClick = onClick) else m }
                .padding(vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically, content = content,
        )
        if (divider) Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.06f)))
    }
}

/** A quiet panel that holds T3 lines together (groups on home), so a list reads as one thing. */
@Composable
fun LinePanel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier.clip(RoundedCornerShape(24.dp)).background(Color.White.copy(alpha = 0.03f))
            .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(24.dp)).padding(horizontal = 16.dp),
    ) { androidx.compose.foundation.layout.Column { content() } }
}