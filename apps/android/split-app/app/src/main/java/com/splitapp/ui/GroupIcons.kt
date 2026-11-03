package com.splitapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Celebration
import androidx.compose.material.icons.rounded.DirectionsCar
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LocalCafe
import androidx.compose.material.icons.rounded.Luggage
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Restaurant
import androidx.compose.material.icons.rounded.ShoppingBasket
import androidx.compose.material.icons.rounded.SportsCricket
import androidx.compose.material.icons.rounded.SportsSoccer
import androidx.compose.material.icons.rounded.SportsTennis
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.splitapp.data.Group
import com.splitapp.ui.theme.Inter
import com.splitapp.ui.theme.Night

/** A group's mark: picked from its name when it is made, changeable from a small set. */
object GroupIcons {
    val all: List<Pair<String, ImageVector>> = listOf(
        "home" to Icons.Rounded.Home, "football" to Icons.Rounded.SportsSoccer, "racket" to Icons.Rounded.SportsTennis,
        "cricket" to Icons.Rounded.SportsCricket, "trip" to Icons.Rounded.Luggage, "food" to Icons.Rounded.Restaurant,
        "cafe" to Icons.Rounded.LocalCafe, "movie" to Icons.Rounded.Movie, "party" to Icons.Rounded.Celebration,
        "work" to Icons.Rounded.Work, "ride" to Icons.Rounded.DirectionsCar, "grocery" to Icons.Rounded.ShoppingBasket,
    )

    private val words = listOf(
        "home" to listOf("flat", "home", "pg", "room", "house", "hostel"),
        "football" to listOf("football", "turf", "futsal", "soccer"),
        "racket" to listOf("badminton", "tennis", "squash", "pickleball"),
        "cricket" to listOf("cricket", "box cricket"),
        "trip" to listOf("trip", "goa", "travel", "holiday", "vacation", "manali", "weekend"),
        "food" to listOf("lunch", "dinner", "food", "brunch", "breakfast"),
        "cafe" to listOf("chai", "coffee", "cafe"),
        "movie" to listOf("movie", "film", "concert", "show"),
        "party" to listOf("party", "birthday", "wedding"),
        "work" to listOf("office", "work", "team"),
        "ride" to listOf("cab", "ride", "commute", "carpool"),
        "grocery" to listOf("grocery", "groceries", "kitchen", "blinkit"),
    )

    /** The icon a new group starts with, read from its name; null when nothing fits. */
    fun guess(name: String): String? {
        val n = name.lowercase()
        return words.firstOrNull { (_, ws) -> ws.any { n.contains(it) } }?.first
    }

    fun of(g: Group): String? = g.icon ?: guess(g.name)
    fun vector(key: String?): ImageVector? = all.firstOrNull { it.first == key }?.second
}

/** The group's badge: one neutral raised square for every group; the icon tells them apart. */
@Composable
fun GroupBadge(g: Group, size: Dp = 44.dp, iconKey: String? = GroupIcons.of(g)) {
    val c = Color(0xFF2B2F2D)
    val shape = RoundedCornerShape(size * 0.3f)
    Box(
        Modifier.size(size)
            .background(Brush.linearGradient(listOf(lerp(c, Color.White, 0.08f), c, lerp(c, Night, 0.3f))), shape)
            .border(1.dp, Color.White.copy(alpha = 0.12f), shape),
        contentAlignment = Alignment.Center,
    ) {
        val v = GroupIcons.vector(iconKey)
        if (v != null) Icon(v, null, tint = Color(0xFFF2EFE6), modifier = Modifier.size(size * 0.55f))
        else Text(g.name.take(1).uppercase(), color = Color(0xFFF2EFE6), fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.45f).sp)
    }
}
