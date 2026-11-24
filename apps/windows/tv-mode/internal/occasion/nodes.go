package occasion

// The 61 nodes of HUB-DIRECTION 3.7, as data. Seed titles are starters, not
// canon: the app resolves each on TMDB once and keeps it only if it streams on
// one of Dev's apps; a title that does not resolve is dropped silently.

func fest(id, name, why string, before, after int, peak float64, hero bool, s Signals) Node {
	return Node{ID: id, Kind: "festival", Name: name, Why: why, Before: before, After: after, Peak: peak, Hero: hero, Signals: s}
}

func day(id, name, why string, before, after int, peak float64, hero bool, s Signals) Node {
	n := fest(id, name, why, before, after, peak, hero, s)
	n.Kind = "day"
	return n
}

func moment(id, kind, name, why string, peak float64, s Signals) Node {
	return Node{ID: id, Kind: kind, Name: name, Why: why, Peak: peak, Signals: s}
}

func season(id, name, why, from, to string, peak float64, s Signals) Node {
	return Node{ID: id, Kind: "season", Name: name, Why: why, From: from, To: to, Peak: peak, Signals: s}
}

func state(id, name, why string, peak float64, hero bool) Node {
	return Node{ID: id, Kind: "state", Name: name, Why: why, Peak: peak, Hero: hero}
}

const (
	gAction, gAdventure, gAnim, gComedy, gCrime, gDoc, gDrama, gFamily = 28, 12, 16, 35, 80, 99, 18, 10751
	gHorror, gMusic, gMystery, gRomance, gThriller                     = 27, 10402, 9648, 10749, 53
)

var siblingSeeds = []string{"Dil Dhadakne Do", "Raksha Bandhan", "Hum Saath-Saath Hain"}
var lohriSeeds = []string{"Udta Punjab", "Qismat", "Carry On Jatta", "Chal Mera Putt"}
var patriotSeeds = []string{"Lagaan", "Rang De Basanti", "Chak De! India", "Swades", "Uri: The Surgical Strike", "Shershaah", "Sardar Udham", "Raazi", "Border", "Bhaag Milkha Bhaag"}
var eidSeeds = []string{"Bajrangi Bhaijaan", "Sultan", "Ek Tha Tiger", "Kick", "Bharat", "Gully Boy"}
var cricketSeeds = []string{"M.S. Dhoni: The Untold Story", "83", "Jersey", "Lagaan", "Kai Po Che!", "Iqbal", "Bandon Mein Tha Dum"}
var diwaliSeeds = []string{"Kabhi Khushi Kabhie Gham", "Hum Saath-Saath Hain", "Hum Aapke Hain Koun..!", "Golmaal Again", "Housefull 4", "Sooryavanshi"}
var monsoonSeeds = []string{"Tumbbad", "Lagaan", "Monsoon Wedding", "Wake Up Sid", "Barsaat", "Parasite", "Blade Runner 2049"}
var summerSeeds = []string{"Dil Chahta Hai", "Zindagi Na Milegi Dobara", "Call Me by Your Name", "Mamma Mia!", "Top Gun: Maverick", "Jaws"}
var winterSeeds = []string{"Haider", "Kedarnath", "Fargo", "Goblin", "Crash Landing on You", "The Revenant"}

var nodes = []Node{
	// --- festivals and days (calendar nodes) ---
	fest("diwali", "Diwali week", "Big, bright and for the whole house.", 10, 0, 1.0, true, Signals{
		Keywords: []string{"diwali", "deepavali"}, Release: &Window{Lang: "hi", Years: 6, Before: 7, After: 3},
		Genres: []int{gFamily, gComedy, gDrama}, Langs: []string{"hi"}, Titles: diwaliSeeds}),
	{ID: "dhanteras", Kind: "festival", Name: "Diwali week", Why: "Two days to Diwali.", Before: 1, After: 0, Peak: 0.7, Pool: "diwali"},
	fest("bhai-dooj", "Bhai Dooj", "Sisters, brothers and one long dinner.", 1, 0, 0.5, false, Signals{Titles: siblingSeeds}),
	fest("holi", "Holi", "Colour, a song and a crowd.", 5, 1, 0.9, true, Signals{
		Keywords: []string{"holi"}, Release: &Window{Lang: "hi", Years: 6, Before: 7, After: 3},
		Genres: []int{gComedy, gRomance}, Langs: []string{"hi"},
		Titles: []string{"Silsila", "Sholay", "Yeh Jawaani Hai Deewani", "Darr", "Mohabbatein", "Waqt: The Race Against Time", "Ram-Leela", "Baghban"}}),
	fest("navratri", "Navratri nights", "Nine nights of garba.", 3, 0, 0.7, true, Signals{
		Langs: []string{"gu", "hi"}, Keywords: []string{"garba", "dandiya"}, Genres: []int{gMusic, gRomance},
		Titles: []string{"Kai Po Che!", "Loveyatri", "Hum Dil De Chuke Sanam"}}),
	fest("durga-puja", "Durga Puja", "Kolkata, drums and a goddess.", 3, 1, 0.8, true, Signals{
		Langs: []string{"bn"}, Keywords: []string{"durga puja", "kolkata"}, Genres: []int{gDrama, gMystery},
		Titles: []string{"Kahaani", "Devdas", "Pather Panchali", "Bulbbul"}}),
	fest("dussehra", "Dussehra", "Good wins. Eventually.", 3, 1, 0.8, true, Signals{
		Keywords: []string{"ramayana", "ravana", "hindu mythology"},
		Titles:   []string{"Ramayana: The Legend of Prince Rama", "Raavan", "Adipurush", "Baahubali: The Beginning", "Baahubali 2: The Conclusion"}}),
	fest("ganesh", "Ganesh Chaturthi", "Mumbai with the drums on.", 3, 7, 0.7, true, Signals{
		Langs: []string{"mr"}, Keywords: []string{"ganesh", "mumbai"}, Genres: []int{gDrama, gAction},
		Titles: []string{"Agneepath", "Vaastav", "Don", "Ventilator", "Sairat"}}),
	fest("eid-fitr", "Eid", "Eid release day, the way the cinemas do it.", 4, 2, 0.9, true, Signals{
		Keywords: []string{"eid", "ramadan"}, Release: &Window{Lang: "hi", Years: 6, Before: 7, After: 3},
		Genres: []int{gAction, gDrama}, Langs: []string{"hi"}, Titles: eidSeeds}),
	{ID: "eid-adha", Kind: "festival", Name: "Eid al-Adha", Why: "Eid again, the quieter one.", Before: 3, After: 1, Peak: 0.6, Pool: "eid-fitr"},
	fest("rakhi", "Raksha Bandhan", "Siblings, with less shouting than yours.", 3, 1, 0.6, false, Signals{Titles: siblingSeeds}),
	fest("janmashtami", "Janmashtami", "A night for Krishna.", 2, 1, 0.6, false, Signals{
		Keywords: []string{"krishna", "hindu mythology"}, Titles: []string{"OMG: Oh My God!", "Little Krishna", "Mahabharat", "Sita Ramam"}}),
	fest("onam", "Onam", "Kerala, at its best.", 5, 2, 0.8, true, Signals{
		Langs: []string{"ml"}, Titles: []string{"Drishyam", "Premam", "Bangalore Days", "Kumbalangi Nights", "Manjummel Boys", "2018"}}),
	fest("pongal", "Pongal and Sankranti", "Tamil cinema's big week.", 4, 2, 0.8, true, Signals{
		Langs: []string{"ta", "te"}, Keywords: []string{"harvest"}, Release: &Window{Lang: "ta", Years: 6, Before: 7, After: 3},
		Titles: []string{"Vikram", "Jai Bhim", "96", "Super Deluxe", "Soorarai Pottru", "Jailer"}}),
	fest("lohri", "Lohri", "Fire, folk songs and Punjab.", 2, 0, 0.5, false, Signals{
		Langs: []string{"pa"}, Genres: []int{gComedy, gRomance}, Titles: lohriSeeds}),
	day("independence", "Independence Day", "For the country, in two and a half hours.", 7, 1, 0.9, true, Signals{
		Keywords: []string{"india", "patriotism", "freedom fighter", "indian army"}, Titles: patriotSeeds}),
	day("republic", "Republic Day", "Republic Day on the sofa.", 5, 1, 0.8, true, Signals{
		Keywords: []string{"india", "patriotism", "freedom fighter", "indian army"}, Titles: append([]string{"Article 15", "Jai Bhim", "Court"}, patriotSeeds...)}),
	day("gandhi", "Gandhi Jayanti", "A quiet one about a loud idea.", 2, 1, 0.5, false, Signals{
		Keywords: []string{"gandhi", "non-violence"}, Titles: []string{"Gandhi", "Lage Raho Munna Bhai", "Sardar Udham"}}),
	day("childrens", "Children's Day", "You were one once.", 2, 1, 0.5, false, Signals{
		Genres: []int{gFamily, gAnim}, Titles: []string{"Taare Zameen Par", "Stanley Ka Dabba", "Chillar Party", "Hawaa Hawaai", "Gattu"}}),
	day("teachers", "Teachers' Day", "The one who stayed after class.", 2, 0, 0.4, false, Signals{
		Keywords: []string{"teacher", "school"}, Titles: []string{"Hichki", "Super 30", "Dead Poets Society", "Taare Zameen Par", "12th Fail"}}),
	day("womens", "Women's Day", "Her story, for once.", 3, 1, 0.5, false, Signals{
		Keywords: []string{"female protagonist", "woman director"}, Titles: []string{"Queen", "Thappad", "Piku", "English Vinglish", "Gangubai Kathiawadi", "Darlings"}}),
	day("mothers", "Mother's Day", "Call her after.", 3, 0, 0.5, false, Signals{
		Keywords: []string{"mother", "motherhood"}, Titles: []string{"Mom", "Nil Battey Sannata", "Tribhanga", "Secret Superstar", "Lady Bird"}}),
	day("fathers", "Father's Day", "Call him too.", 3, 0, 0.5, false, Signals{
		Keywords: []string{"father", "father daughter relationship"}, Titles: []string{"Piku", "Dangal", "Chhichhore", "Udaan", "The Pursuit of Happyness"}}),
	day("friendship", "Friendship Day", "For the group chat.", 3, 0, 0.5, false, Signals{
		Keywords: []string{"friendship", "road trip"}, Titles: []string{"3 Idiots", "Zindagi Na Milegi Dobara", "Dil Chahta Hai", "Kai Po Che!", "Rang De Basanti", "Chhichhore"}}),
	day("valentines", "Valentine's", "Romance, no apologies.", 6, 1, 0.8, true, Signals{
		Genres: []int{gRomance}, Keywords: []string{"love", "romantic comedy"},
		Titles: []string{"Jab We Met", "Dilwale Dulhania Le Jayenge", "Before Sunrise", "Barfi!", "Sita Ramam", "Crash Landing on You", "About Time"}}),
	day("halloween", "Halloween", "Lights off, properly.", 7, 1, 0.8, true, Signals{
		Genres: []int{gHorror}, Keywords: []string{"halloween", "haunted house", "ghost"},
		Titles: []string{"Tumbbad", "Stree", "Bulbbul", "Hereditary", "The Conjuring", "Get Out"}}),
	day("christmas", "Christmas", "Snow on screen, fan on.", 14, 1, 1.0, true, Signals{
		Keywords: []string{"christmas", "holiday"}, Genres: []int{gFamily, gComedy}, Release: &Window{Lang: "hi", Years: 6, Before: 7, After: 3},
		Titles: []string{"Home Alone", "Love Actually", "Klaus", "Elf", "The Holiday", "Die Hard", "The Grinch"}}),
	day("newyear", "New Year's week", "A week off deserves a long one.", 0, 2, 0.9, true, Signals{
		Keywords: []string{"new year's eve", "party"}, Kinds: []string{"tv"}, MinVotes: 500,
		Titles: []string{"When Harry Met Sally", "Zindagi Na Milegi Dobara", "Dil Chahta Hai", "Yeh Jawaani Hai Deewani"}}),
	fest("mahashivratri", "Mahashivratri", "A night awake, on purpose.", 2, 0, 0.4, false, Signals{
		Keywords: []string{"shiva", "hindu mythology", "himalayas"}, Langs: []string{"hi"}, Titles: []string{"Kedarnath"}}),
	fest("ugadi", "Ugadi and Gudi Padwa", "New year, the other one.", 2, 1, 0.5, false, Signals{
		Langs: []string{"te", "kn", "mr"}, Titles: []string{"RRR", "Kantara", "Pushpa: The Rise", "Sairat"}}),
	fest("baisakhi", "Baisakhi", "Punjab in April.", 2, 1, 0.4, false, Signals{Langs: []string{"pa"}, Titles: lohriSeeds}),
	fest("karva-chauth", "Karva Chauth", "The moon can take its time.", 1, 0, 0.4, false, Signals{
		Keywords: []string{"marriage", "husband wife relationship"}, Titles: []string{"Dilwale Dulhania Le Jayenge", "Kabhi Khushi Kabhie Gham", "Hum Dil De Chuke Sanam"}}),
	fest("chhath", "Chhath", "Bihar, UP and the river.", 2, 1, 0.4, false, Signals{
		Langs: []string{"hi"}, Keywords: []string{"bihar"}, Titles: []string{"Gangs of Wasseypur", "Super 30", "Panchayat"}}),
	fest("guru-nanak", "Guru Nanak Jayanti", "Punjab, the thoughtful one.", 2, 0, 0.4, false, Signals{
		Langs: []string{"pa"}, Keywords: []string{"sikh"}, Titles: lohriSeeds}),
	fest("ipl", "IPL season", "Between the overs.", 3, 0, 0.5, false, Signals{
		Keywords: []string{"cricket"}, Titles: cricketSeeds}),
	fest("cricket-event", "Cricket on", "Cricket on, and something for the rain delay.", 3, 1, 0.6, true, Signals{
		Keywords: []string{"cricket"}, Titles: cricketSeeds}),
	fest("oscars", "Oscars week", "What the fuss was about.", 7, 2, 0.5, false, Signals{
		Langs: []string{"en"}, Keywords: []string{"oscar winner"}, MinVotes: 2000}),
	day("birthday", "Your birthday", "Your day. One press.", 1, 0, 1.0, true, Signals{}),

	// --- seasons (month-driven, low weight, never the hero) ---
	season("winter", "Winter nights", "Blanket weather.", "12-01", "02-15", 0.3, Signals{
		Keywords: []string{"snow", "winter", "mountain"}, Genres: []int{gDrama, gThriller}, Titles: winterSeeds}),
	season("spring", "Spring", "Lighter evenings.", "02-16", "03-31", 0.25, Signals{Genres: []int{gRomance, gComedy}}),
	season("summer", "Summer", "Too hot to go out. Good.", "04-01", "06-15", 0.3, Signals{
		Keywords: []string{"beach", "road trip", "summer vacation"}, Genres: []int{gAdventure, gComedy}, Titles: summerSeeds}),
	season("monsoon", "Monsoon", "Rain on the window, rain on screen.", "06-16", "09-15", 0.35, Signals{
		Keywords: []string{"rain", "monsoon"}, Genres: []int{gDrama, gMystery}, Titles: monsoonSeeds}),
	season("festive-autumn", "Festive season", "The long festive run.", "09-16", "11-30", 0.25, Signals{
		Genres: []int{gFamily, gComedy}, Langs: []string{"hi"}}),

	// --- clock (hour of day, India time; the moment shelf) ---
	moment("late-night", "clock", "Late tonight", "Short enough to finish.", 0.5, Signals{Kinds: []string{"tv"}, Runtime: [2]int{0, 50}}),
	moment("evening", "clock", "Evening", "", 0.3, Signals{}),
	moment("afternoon", "clock", "Afternoon", "Time for a long one.", 0.3, Signals{Kinds: []string{"movie"}}),
	moment("morning", "clock", "Morning", "Easy start.", 0.3, Signals{Genres: []int{gComedy}}),

	// --- week ---
	moment("friday-night", "week", "New this week", "Fresh this week.", 0.45, Signals{Kinds: []string{"movie"}}),
	moment("saturday", "week", "Saturday", "You have the time.", 0.4, Signals{Kinds: []string{"movie"}, MinVotes: 1500}),
	moment("sunday-evening", "week", "Sunday evening", "Something kind before Monday.", 0.45, Signals{Genres: []int{gComedy, gFamily}}),
	moment("weeknight", "week", "Weeknight", "One episode. Maybe two.", 0.34, Signals{Kinds: []string{"tv"}}),

	// --- weather (optional; off without a location) ---
	{ID: "rain-now", Kind: "weather", Name: "Rainy evening", Why: "It's raining. Stay in.", Peak: 0.5, Pool: "monsoon"},
	{ID: "heat", Kind: "weather", Name: "Hot night", Why: "Something cold.", Peak: 0.4, Pool: "summer"},
	{ID: "cold", Kind: "weather", Name: "Cold night", Why: "Blanket weather, confirmed.", Peak: 0.4, Pool: "winter"},

	// --- state (what Dev is in the middle of) ---
	state("mid-title", "Continue watching", "You stopped last night", 1.0, true),
	state("up-next", "Up next", "Carry on.", 1.0, true),
	state("just-finished", "Because you finished", "Here is more like it.", 0.8, false),
	state("new-episode", "New episodes of your shows", "Out this week.", 0.9, true),
	state("binge", "Keep going", "You're on a roll.", 0.7, false),
	state("stuck", "Just press OK", "OK plays this.", 0.6, true),
	state("away", "Welcome back", "It's been a while.", 0.4, false),
}

func init() {
	for i := range nodes {
		if nodes[i].ID == "newyear" {
			nodes[i].Span = 6 // 26-31 Dec at full weight
		}
	}
}
