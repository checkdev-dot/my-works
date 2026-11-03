package com.splitapp.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em
import androidx.compose.material3.LocalContentColor
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.splitapp.R

/** One family for every word and figure, in the app. (Notifications use the system condensed face: RemoteViews cannot load bundled fonts.) */
val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
    Font(R.font.inter_extrabold, FontWeight.ExtraBold),
)

val BoardGreen = Color(0xFF1B5A45)
/** The stadium at night: the ground every glowing card sits on. */
val Night = Color(0xFF0A0C0B)
private val Ink = Color(0xFF14130F)
private val Paint = Color(0xFFF2EFE6)

/**
 * A painted board: the ground, the paint written on it, and the tin plates hung on it.
 * Three values only; secondary text is the paint at lower strength, never grey.
 */
@Immutable
data class Board(val ground: Color, val paint: Color, val plate: Color, val plateInk: Color) {
    val muted: Color get() = paint.copy(alpha = 0.86f).compositeOver(ground)
    val rule: Color get() = paint.copy(alpha = 0.22f).compositeOver(ground)
    val isLight: Boolean get() = ground.luminance() > 0.4f

    companion object {
        /** Builds a board from a brand colour, darkening the ground until small text passes 4.5:1. */
        fun from(brand: Color): Board {
            var ground = brand
            repeat(12) {
                val best = maxOf(contrast(ground, Paint), contrast(ground, Ink))
                if (best >= 4.6) return@repeat
                ground = Color(ground.red * 0.92f, ground.green * 0.92f, ground.blue * 0.92f)
            }
            val paint = if (contrast(ground, Paint) >= contrast(ground, Ink)) Paint else Ink
            return Board(ground, paint, plate = paint, plateInk = ground)
        }

        fun contrast(a: Color, b: Color): Double {
            val la = a.luminance() + 0.05
            val lb = b.luminance() + 0.05
            return (maxOf(la, lb) / minOf(la, lb)).toDouble()
        }
    }
}

val HomeBoard = Board(BoardGreen, Paint, Paint, Color(0xFF123D30))
/** Content sitting on the night ground, outside any card. */
val NightBoard = Board(Night, Paint, Paint, Night)

/**
 * Colour carries one meaning: which way money runs. Everything else is cream on night.
 * Words always say the direction too ("owes you", "you owe"), so colour is never the only cue.
 */
val Owed = Color(0xFF6FD9A5)   // someone owes the user
val Owe = Color(0xFFFF8B7B)    // the user owes someone
/** A raised neutral surface on night: cards, rows, the payment card. */
val Surface = Color(0xFF181B1A)
/** Neutral board for cards that used to wear a brand: the brand stays in the small icon. */
val CardBoard = Board(Surface, Paint, Paint, Night)
/** Selection and ticks: cream, the one accent. */
val CreamBoard = Board(Paint, Night, Night, Paint)

/** Colour for a signed balance: positive is owed to the user. Zero stays muted. */
fun moneyColor(net: Long): Color = when { net > 0 -> Owed; net < 0 -> Owe; else -> Paint.copy(alpha = 0.6f) }
val LocalBoard = compositionLocalOf { HomeBoard }
/** The paying service's board, for accents on screens whose ground is night. */
val LocalBrand = compositionLocalOf { HomeBoard }

/** A brand colour bright enough to read as an accent on the night ground. */
val Board.accent: Color get() = if (ground.luminance() < 0.18f) androidx.compose.ui.graphics.lerp(ground, Color.White, 0.35f) else ground
val Board.onAccent: Color get() = if (accent.luminance() > 0.4f) Night else Color.White

private val Light = lightColorScheme(
    primary = BoardGreen, onPrimary = Paint,
    primaryContainer = Color(0xFFD3E6DC), onPrimaryContainer = Color(0xFF0B2A20),
    secondary = Color(0xFF4F6358), tertiary = Color(0xFF8A6A00),
    background = Color(0xFFF7F8F5), surface = Color(0xFFF7F8F5), onSurface = Color(0xFF181C1A),
    surfaceVariant = Color(0xFFDDE5DF), onSurfaceVariant = Color(0xFF414943),
    outline = Color(0xFF717973),
    surfaceContainerLowest = Color(0xFFFFFFFF), surfaceContainerLow = Color(0xFFF1F4F0), surfaceContainer = Color(0xFFEBEFEA),
    surfaceContainerHigh = Color(0xFFE5EAE4), surfaceContainerHighest = Color(0xFFDFE4DE),
    inverseSurface = Color(0xFF123D30), inverseOnSurface = Color(0xFFF2EFE6), inversePrimary = Color(0xFFF2C230),
)
private val Dark = darkColorScheme(
    primary = Color(0xFF9BD3B8), onPrimary = Color(0xFF00382A),
    primaryContainer = BoardGreen, onPrimaryContainer = Paint,
    secondary = Color(0xFFB4CCBF), tertiary = Color(0xFFF2C230),
    background = Night, surface = Night, onSurface = Color(0xFFF2EFE6),
    surfaceVariant = Color(0xFF29322D), onSurfaceVariant = Color(0xFFC0C9C2),
    outline = Color(0xFF8A938D),
    surfaceContainerLowest = Color(0xFF0A0F0D), surfaceContainerLow = Color(0xFF171D1A), surfaceContainer = Color(0xFF1B211E),
    surfaceContainerHigh = Color(0xFF252B28), surfaceContainerHighest = Color(0xFF303633),
    inverseSurface = Color(0xFFF2EFE6), inverseOnSurface = Color(0xFF123D30), inversePrimary = Color(0xFF123D30),
)

/**
 * The role scale. Big text tightens, small text opens up, and text on the night ground
 * sits a touch looser than Material's defaults so light-on-dark keeps its shape.
 */
private fun inter(size: Int, line: Int, weight: FontWeight, track: Double) =
    TextStyle(fontFamily = Inter, fontSize = size.sp, lineHeight = line.sp, fontWeight = weight, letterSpacing = track.sp)

val AppType = Typography(
    displaySmall = inter(34, 40, FontWeight.ExtraBold, -0.9),   // screen title
    headlineSmall = inter(24, 30, FontWeight.Bold, -0.5),       // step title
    titleLarge = inter(20, 26, FontWeight.Bold, -0.3),          // section heading, card title
    titleMedium = inter(17, 22, FontWeight.SemiBold, -0.15),    // person name, row title, primary button
    titleSmall = inter(15, 20, FontWeight.SemiBold, -0.1),
    bodyLarge = inter(16, 24, FontWeight.Normal, 0.0),          // body, secondary button
    bodyMedium = inter(15, 22, FontWeight.Normal, 0.05),
    bodySmall = inter(13, 18, FontWeight.Normal, 0.1),          // metadata under a title
    labelLarge = inter(14, 20, FontWeight.SemiBold, 0.1),       // chips, tags, text buttons
    labelMedium = inter(12, 16, FontWeight.SemiBold, 0.4),
    labelSmall = inter(11, 14, FontWeight.SemiBold, 0.9),       // caps labels: TO RECOVER, WAITING
)

/** Amounts in plates and tiles: Inter Bold with fixed-width figures so columns of money line up. */
fun numerals(size: Int) = TextStyle(
    fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = size.sp, lineHeight = (size * 1.1).sp,
    letterSpacing = (-0.02 * size).sp, fontFeatureSettings = "tnum",
)

/** The rupee sign sits a step lighter and smaller than the figures so the number leads. */
fun money(text: String): AnnotatedString = buildAnnotatedString {
    text.forEach { c ->
        if (c == '₹') withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, fontSize = 0.78.em)) { append(c) }
        else append(c)
    }
}

@Composable
fun AppTheme(board: Board = HomeBoard, content: @Composable () -> Unit) {
    // The app is a night stadium in both system themes: glowing brand cards need a dark ground to glow against.
    MaterialTheme(colorScheme = Dark, typography = AppType) {
        CompositionLocalProvider(LocalBoard provides board, LocalContentColor provides Color(0xFFF2EFE6), content = content)
    }
}

/** Material scheme painted from a board, so standard components inside a branded sheet match it. */
@Composable
fun BoardTheme(board: Board, content: @Composable () -> Unit) {
    val scheme = (if (board.isLight) lightColorScheme() else darkColorScheme()).copy(
        primary = board.plate, onPrimary = board.plateInk,
        surface = board.ground, onSurface = board.paint, onSurfaceVariant = board.muted,
        surfaceContainerLow = board.ground, surfaceContainer = board.ground, surfaceContainerHigh = board.ground,
        surfaceContainerHighest = board.rule,
        outline = board.paint.copy(alpha = 0.6f).compositeOver(board.ground), outlineVariant = board.rule,
        secondaryContainer = board.plate, onSecondaryContainer = board.plateInk,
    )
    MaterialTheme(colorScheme = scheme, typography = AppType) {
        CompositionLocalProvider(LocalBoard provides board, LocalContentColor provides board.paint, content = content)
    }
}
