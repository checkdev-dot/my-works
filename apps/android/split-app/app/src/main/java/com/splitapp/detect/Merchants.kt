package com.splitapp.detect

/** A service whose payments are usually shared. Colours are close approximations of each brand. */
data class Merchant(
    val id: String,
    val name: String,
    val category: Category,
    val brandArgb: Long,
    val keywords: List<String>,
    val packageName: String? = null,
)

enum class Category { FOOD, QUICK, DINING, SPORTS, EVENTS, RIDES }

object Merchants {
    // Order matters: more specific keywords first (Instamart before Swiggy).
    val all = listOf(
        Merchant("instamart", "Swiggy Instamart", Category.QUICK, 0xFFFC8019, listOf("instamart"), "in.swiggy.android"),
        Merchant("dineout", "Swiggy Dineout", Category.DINING, 0xFFFC8019, listOf("dineout"), "in.swiggy.android"),
        Merchant("swiggy", "Swiggy", Category.FOOD, 0xFFFC8019, listOf("swiggy", "bundl technologies"), "in.swiggy.android"),
        Merchant("district", "District", Category.DINING, 0xFF2B1E5C, listOf("district"), null),
        Merchant("zomato", "Zomato", Category.FOOD, 0xFFE23744, listOf("zomato", "eternal ltd"), "com.application.zomato"),
        Merchant("blinkit", "Blinkit", Category.QUICK, 0xFFF8CB46, listOf("blinkit", "grofers", "blink commerce"), "com.grofers.customerapp"),
        Merchant("zepto", "Zepto", Category.QUICK, 0xFF4B1E8C, listOf("zepto", "kiranakart"), "com.zeptoconsumerapp"),
        Merchant("amazonnow", "Amazon Now", Category.QUICK, 0xFF232F3E, listOf("amazon now", "amazonnow"), "in.amazon.mShop.android.shopping"),
        Merchant("eazydiner", "EazyDiner", Category.DINING, 0xFFE4572E, listOf("eazydiner"), "com.easydiner"),
        Merchant("playo", "Playo", Category.SPORTS, 0xFF00A86B, listOf("playo"), "com.techmash.playo"),
        Merchant("bookmyshow", "BookMyShow", Category.EVENTS, 0xFFF84464, listOf("bookmyshow", "bigtree"), "com.bt.bms"),
        Merchant("uber", "Uber", Category.RIDES, 0xFF111111, listOf("uber"), "com.ubercab"),
        Merchant("ola", "Ola", Category.RIDES, 0xFF1C1C1C, listOf("olacabs", "ani technologies"), "com.olacabs.customer"),
        Merchant("rapido", "Rapido", Category.RIDES, 0xFFF9C935, listOf("rapido", "roppen"), "com.rapido.passenger"),
    )

    fun byId(id: String): Merchant? = all.firstOrNull { it.id == id }

    /** Payments to shops not in the list share this id; the shop's own name rides on the payment. */
    const val UNKNOWN = "other"
    fun unknown(shop: String) = Merchant(UNKNOWN, shop.replaceFirstChar { it.uppercase() }, Category.FOOD, 0xFF3A3E3C, emptyList())

    fun match(text: String): Merchant? {
        val t = text.lowercase()
        return all.firstOrNull { m -> m.keywords.any { k -> Regex("\\b${Regex.escape(k)}").containsMatchIn(t) } }
    }
}
