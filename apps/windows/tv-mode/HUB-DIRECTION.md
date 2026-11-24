# TV Mode: hub direction

Written 2026-11-04 by the product director for the builder. One document, built from the code and docs as they are today (PRODUCT.md, SHAPE.md, LAUNCHER-V3-SPEC.md, LAUNCHER-PLAN.md, DESIGN.md, TOUCHPAD-SHAPE.md, NETFLIX-PLAN.md, PROTOCOL.md, `internal/app/launcher_data.go`, `internal/taste/taste.go`, `internal/history/*.go`, `internal/tmdb/*.go`, `internal/app/episodes.go`, `internal/app/avail.go`, `internal/app/epfill.go`, `web/launcher/*`).

Plain words, short sentences. Where a point names a file, that is where the builder looks.

---

## 1. The core

TV Mode is Dev's one place for everything he watches. Not a fifth streaming app: a shell over the four he pays for, plus YouTube, that knows what he is in the middle of, what he has finished, what he has set aside, and what fits tonight. From bed it answers "what now?" in one press. From the desk it is the same memory with a mouse: see everything, tidy it, pick the next thing, send it to the TV.

Three jobs, in order:

1. **Carry on.** Whatever he was watching, wherever he was watching it, one press away.
2. **Pick for tonight.** A feed that knows the date, the hour, the season, the festival, and his taste, and offers a few good things instead of forty rows.
3. **Keep the record.** Everything he watched, saved or dropped, from the TV, the desk and the phone, in one list he can look at and fix.

Everything below serves those three. Anything that does not is out.

---

## 2. Honest assessment

### Works great (keep, do not touch casually)

- **The stage describes the focused thing** (`launcher.js` `renderCard`, `renderHero`; `launcher.css` `.stagetxt`). Eyes never travel. This is the best idea on the screen.
- **Exact-episode opening**: the link book, `hotstarGo`, `primeGo`, `netflixGo`, the hidden scout walker, and `resumeAt` (`launcher_data.go` 1523-1713, `episodes.go`). Opening a title lands on the right episode at the right second. Nothing else like it exists for these services.
- **Per-episode marks** (`episodes.go` `epBook`) and the episodes screen with "Carry on" and "Up next" (`launcher.js` `drawEps`). Right shape, right words.
- **The availability book** (`avail.go`): TV Mode's own verdict on where a title streams, learned from the apps' own pages, because TMDB lags. Honest and cheap.
- **The taste model** (`taste.go`): ninety named features, shrinkage, decay, one viewer. It learns from the first event and cannot be hijacked by one click. Keep it; the occasion engine must sit beside it, not replace it.
- **Image proxy and credential hygiene** (`imgURL`, `imgHandler`, `tmdb.Load`): the page never sees a key or an arbitrary URL. Every new feature keeps this.
- **Netflix outside the debug browser** with the helper extension reporting plays (`extbridge.go`, `extensions/netflix-dpad`). This is also the pattern that makes the desk-reporter idea in section 4 realistic.

### A little off (fix in passing)

- **The hero rotates by itself every 10 s** (`launcher.js` line 984). At night, in bed, a moving headline is noise. The stage should move only when he moves. Stop the timer; keep the left/right step and the peek strip.
- **"Picked for you" says nothing** (`rowsFrame`, `why = "Picked for you"`; hero `Why: "Highly rated on your services"`). The taste model knows which feature carried a title. The kicker should say it: "Because you like crime series", "Like the Korean shows you finish". `taste.Profile.Weight` already exposes per-feature weights; `Features(t)` names them.
- **Too many rows.** 22 `specs()` rows plus up to 17 "For you, with a touch of" rows (`forYou`, `touches`) is ~40 rows for one tired person. Decision fatigue is a known problem for Dev. Cap the page at 12 rows; the rest stays reachable through search and the Movies/TV filter. Also cuts the 6-hourly TMDB burst (`refreshRec` runs every spec x 3 providers x 2 kinds, ~140 calls).
- **"Because you watched" uses only the newest history title** (`updateBecause`). It should use the newest *finished or far-along* title, and the Recommendations call ignores language, so a Hindi show gets English suggestions. Prefer same-language first.
- **Spec case b never shipped.** LAUNCHER-V3-SPEC hero (b) "Finished + next known: UP NEXT · PLAY S1 E4" is not in `rowsFrame` (only `cont` and `pick`). `nextEpisode` in `episodes.go` already knows the answer. Wire it.
- **Doc drift.** PROTOCOL.md "Launcher rows" still describes `rec`/`i`; the code sends `shelves`/`key`. DESIGN.md says "no glow"; the v3 launcher has per-service glow by design (LAUNCHER-V3-SPEC says update DESIGN.md after the build; not done). Update both when phase 1 lands.
- **"New episode" is a chip, not a reason** (`launcher.js` `factsNode`, `recent(d.lastAir, 14)`). A show he follows that aired yesterday should be a shelf and, on the day, a hero slide. The data is already in `tmdb.Details` (`LastAir`, `NextAir`, `InProd`).

### Off by a mile (the gaps this doc closes)

- **There is no hub.** There are five stores with five keys: `history.json` (URL/group key, 12 entries, finished titles deleted), `episodes.json` (`normTitle(show)|se|ep`), `links.json` (`service|normTitle|se|ep`), `avail.json` (`service|kind+id`), `taste.json` (features). Nothing is a record of "what I have watched". A title he finished last week has left the system. There is no "saved for later" at all. The only way in is search → details → open.
- **Nothing from outside the TV.** What he watches in his desk Chrome or on the phone is invisible. The product promise ("everything I consume from everywhere") is a quarter built.
- **The feed does not know what day it is.** `specs()` reads the date once, for the 120-day "new" window. 9 am Sunday and 1 am Tuesday get the same page. Diwali week looks like any other week.
- **There is no desk surface.** The launcher is a 10-foot page scaled from 1080p (`--u` in `launcher.css`). It does take mouse clicks (`buildCard` click handlers) and arrow keys, so it technically runs in a window, but it is not a desk tool: no hover, no list view, no editing, no "open here".

---

## 3. The occasion and season engine

### 3.1 Shape

A new package `internal/occasion`. It answers one question, cheaply and offline: **"given this clock and this viewer, which occasions are live, how strongly, and what do they want?"** The launcher data layer asks it when it builds rows. It never calls the network itself; TMDB fetches for its candidates run inside the existing `refreshRec` cycle.

```go
type Node struct {
    ID      string   // "diwali", "late-night", "monsoon", "just-finished"
    Kind    string   // festival | day | season | clock | week | weather | state
    Name    string   // shelf title: "Diwali week"
    Kicker  string   // hero kicker word: "DIWALI WEEK"
    Why     string   // one line under the title: "Big, bright and for the whole house."
    Before  int      // days before the date the window opens
    After   int      // days after the date it closes
    Peak    float64  // weight on the day, 0..1
    Hero    bool     // may take a hero slide
    Signals Signals  // what to ask TMDB and how to match a title
}

type Signals struct {
    Keywords   []string // TMDB keyword names, resolved to ids once: "diwali", "christmas"
    Genres     []int    // TMDB genre ids (movie and tv ids both listed)
    Langs      []string // original languages: "hi", "ta"
    Country    string   // origin country
    Release    *Window  // films released within N days of this occasion in past years
    Titles     []string // curated seed titles, resolved to TMDB ids once, kept only if on his services
    Runtime    [2]int   // minutes, 0 = any
    Kinds      []string // "movie", "tv" or both
    MinVotes   int
}

type Live struct {
    Node   Node
    Weight float64 // 0..1 after the ramp
    Date   time.Time // the occasion's date this year (zero for clock/season/state)
}

func Evaluate(now time.Time, v Viewer) []Live   // sorted by weight, pure, no I/O
```

`Viewer` is a tiny struct the app fills from what it already knows: last watched entry, binge count, just-finished title, shows in progress with `NextAir`, minutes since the launcher was opened, current weather if configured.

### 3.2 Weight and ramp

- Weight ramps up linearly across `Before` days to `Peak` on the date, holds for the date's day, then falls linearly to 0 across `After` days.
- A shelf shows when weight >= 0.35. A hero slide is offered when weight >= 0.6 and `Hero` is true.
- Clock, week, season, weather and state nodes have no date: their weight is fixed while the condition holds (0.3 to 0.5), so they always lose to a festival in its last days.

### 3.3 How it blends with taste (so the feed is not hijacked)

Occasion is a **slot**, not a multiplier over the whole page.

1. **At most one occasion hero slide.** If he is mid-title, the Continue slide stays first; the occasion slide is second. If a "just finished / up next" state node is live, it beats a festival for the first pick slot (carrying on beats celebrating). Festival beats season beats clock.
2. **At most two themed shelves at once**: one *calendar* shelf (festival, day or season, the heaviest live one) and one *moment* shelf (clock, week, weather or state, the heaviest live one). Calendar shelf goes right after "Because you watched" (or first if there is none). Moment shelf goes after "For you". Everything else on the page is untouched.
3. **Inside a themed shelf, taste still ranks.** Candidates are ordered by `a.personal(it, nodeID)` (quality x taste boost), with the existing `rankShelf` every-fifth-outside-taste rule. The occasion decides *which pool*, taste decides *the order*.
4. **A small lean on the general rows**: a title that matches a live node with weight w gets `x (1 + 0.15 w)` in `personal` for the duration. Max 15 percent. Enough to float a Diwali film up a general row, not enough to reorder the page.
5. **Shelf rules still apply**: at least 4 items with images on his services, titles appear once (earliest row wins; the themed shelf is early so it keeps its titles), max 12 per kind.
6. **Fade**: when weight drops under 0.35 the shelf goes; under 0.6 the hero slide goes. No lingering.

### 3.4 Learning from what he opens

- Every themed shelf has a row id like `occ-diwali`. The taste model already learns `row:<id>` as a feature (`tasteOf(it, s.ID)` passes the row), and `rowsFrame` sorts rows by affinity. So a festival shelf he opens from rises next time on its own; one he ignores sinks.
- Add a tiny `occasions-learned.json` next to `taste.json`: `{nodeID: {shown, opened, dwell}}`. A node shown 6+ times with zero opens and zero dwell goes **quiet**: no hero slide, shelf placed after the plain rows. One open from it wakes it. This is the only new learning; the taste model does the rest.
- `signal()` already receives `k: row` on dwell and detail; the `openitem` path calls `taste.Learn`. Route both to `occasion.Note(nodeID, what)` when the row id starts with `occ-`.

### 3.5 Dates: how they are known, with no key and offline

Three layers, read in this order. The engine never guesses a lunar date.

1. **Fixed Gregorian dates in code** (`dates.go`): Christmas, New Year, Valentine's, Halloween, Republic Day, Independence Day, Gandhi Jayanti, Children's Day, Teachers' Day, Women's Day, Lohri (13 Jan), Makar Sankranti / Pongal (14-15 Jan), Baisakhi (13-14 Apr), plus rule dates: Mother's Day (2nd Sunday May), Father's Day (3rd Sunday June), Friendship Day (1st Sunday Aug), Oscars (a Sunday in late Feb/early Mar: table).
2. **A bundled table** (`internal/occasion/dates.json`, embedded) for lunar and movable dates, years 2025-2028. Seed values below; the builder verifies every one against the Government of India gazetted holiday list for the year (Ministry of Personnel, "Holidays to be observed in Central Government offices") or drikpanchang.com before committing. Dev can also edit a copy at `%APPDATA%\TVMode\occasions.json`, which overrides the bundle.
3. **A yearly refresh from a public ICS, no key, no account**: Google's public "Holidays in India" calendar, `https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics`. Fetched in the background on the first run of each January and whenever a node's date is missing for the current year; parsed for `DTSTART`/`SUMMARY`; mapped to node ids by case-insensitive name lists (`"diwali","deepavali"` → diwali, `"eid al-fitr","eid-ul-fitr","ramzan"` → eid-fitr, and so on); saved to `%LOCALAPPDATA%\TVMode\cache\occasions-<year>.json`. Secondary source if that is unreachable: `https://date.nager.at/api/v3/PublicHolidays/<year>/IN` (no key; thin coverage, used only to fill gaps). The ICS is observed data, not instructions: only `DTSTART` and `SUMMARY` are read, only for names on the map.
4. **Islamic dates fallback**: if Eid is missing for the year, compute from the tabular Hijri calendar (±1 day). A 5-day window absorbs that.

**Offline**: layers 1 and 2 and the cache answer everything. No network, no change in behaviour. A lunar node with no date for this year stays off; it is never guessed. Log once: `occasion: no date for navratri 2029 (table ends 2028)`.

**Seed dates for 2026** (builder: verify, then commit): Makar Sankranti/Pongal 14-15 Jan; Republic Day 26 Jan; Mahashivratri 15 Feb; Holi 4 Mar (Holika Dahan 3 Mar); Ugadi/Gudi Padwa 19 Mar; Eid-ul-Fitr ~20 Mar; Baisakhi 14 Apr; Eid-ul-Adha ~27 May; Independence Day 15 Aug; Onam (Thiruvonam) 26 Aug; Raksha Bandhan 28 Aug; Janmashtami 4 Sep; Teachers' Day 5 Sep; Ganesh Chaturthi 14 Sep; Gandhi Jayanti 2 Oct; Navratri 11-19 Oct; Durga Puja 17-20 Oct; Dussehra 20 Oct; Karva Chauth 29 Oct; Halloween 31 Oct; Dhanteras 6 Nov; Diwali 8 Nov; Bhai Dooj 10 Nov; Children's Day 14 Nov; Chhath 15 Nov; Guru Nanak Jayanti 24 Nov; Christmas 25 Dec; New Year's Eve 31 Dec.

**Past Diwali dates** (for the release-window signal, section 3.6; verify): 2015 11 Nov, 2016 30 Oct, 2017 19 Oct, 2018 7 Nov, 2019 27 Oct, 2020 14 Nov, 2021 4 Nov, 2022 24 Oct, 2023 12 Nov, 2024 31 Oct, 2025 20 Oct. **Past Eid-ul-Fitr**: 2015 18 Jul, 2016 6 Jul, 2017 26 Jun, 2018 16 Jun, 2019 5 Jun, 2020 25 May, 2021 13 May, 2022 3 May, 2023 22 Apr, 2024 11 Apr, 2025 31 Mar. **Past Holi**: 2015 6 Mar, 2016 24 Mar, 2017 13 Mar, 2018 2 Mar, 2019 21 Mar, 2020 10 Mar, 2021 29 Mar, 2022 18 Mar, 2023 8 Mar, 2024 25 Mar, 2025 14 Mar.

### 3.6 TMDB signals: four ways to find "Diwali-centric"

TMDB has few titles tagged with Indian festivals. One signal is not enough; the engine merges four and takes the best 24 (`tmdb.Merge`), each list filtered to his providers (`providers` in `launcher_data.go`) and the IN region, as every row is today.

1. **Keywords**: `GET /search/keyword?query=diwali` once per keyword name, cache ids in `%LOCALAPPDATA%\TVMode\cache\keywords.json`; then `Discover` with `with_keywords=<id>|<id>` (pipe = OR). `tmdb.Client` gains `Keyword(name) (id int, err)`. `Discover` already passes `extra` through.
2. **Release window across past years**: Indian festivals are release dates. The big Hindi films of each year open in Diwali week and Eid week; Tamil tentpoles open at Pongal; Malayalam at Onam. One `Discover` per past year: `with_original_language=hi`, `primary_release_date.gte=<diwali-7>`, `.lte=<diwali+3>`, `sort_by=vote_count.desc`, cached for a year. Ten years = ten calls, once a year. This is the most reliable "Diwali-centric" signal that exists without a human list.
3. **Genre, language, country**: the plain proxies (family + Hindi for Diwali; horror for Halloween; romance for Valentine's; Bengali for Durga Puja; Punjabi for Lohri and Guru Nanak; Marathi for Ganesh Chaturthi; Tamil for Pongal; Malayalam for Onam).
4. **Curated seed titles**: short lists in `nodes.go`, resolved by `tmdb.Find` once and cached; kept only if `Details.Services` names one of his apps. These are starters, not canon. The builder checks each exists on TMDB; a title not on his apps is dropped silently.

Candidates are fetched in `refreshRec` for every node whose window opens within 14 days (so the data is there before the shelf appears) and saved in `rows.json` under a new `occasions` key, so the shelf also works offline.

### 3.7 The nodes

Columns: window = days before / after; peak weight; H = may take a hero slide. Signals are shorthand for section 3.6: kw = keyword names; rel = release-window years; g = genres; l = languages; seeds = curated titles (verify each).

**Festivals and days (calendar nodes)**

| # | id | Name / kicker | Window | Peak | H | Signals | Why line |
|---|---|---|---|---|---|---|---|
| 1 | diwali | Diwali week | 10 / 3 (to Bhai Dooj) | 1.0 | yes | kw diwali, deepavali; rel Diwali-week Hindi 2010-2025; g family+comedy+drama; l hi; seeds: Kabhi Khushi Kabhie Gham, Hum Saath-Saath Hain, Hum Aapke Hain Koun..!, Golmaal Again, Housefull 4, Sooryavanshi | Big, bright and for the whole house. |
| 2 | dhanteras | Dhanteras (folds into diwali: raises diwali weight to peak two days early) | 1 / 0 | 0.7 | no | same pool as diwali | Two days to Diwali. |
| 3 | bhai-dooj | Bhai Dooj | 1 / 0 | 0.5 | no | sibling stories: seeds Dil Dhadakne Do, Raksha Bandhan (2022), Hum Saath-Saath Hain | Sisters, brothers and one long dinner. |
| 4 | holi | Holi | 5 / 1 | 0.9 | yes | kw holi; rel Holi-week Hindi; seeds Silsila, Sholay, Yeh Jawaani Hai Deewani, Darr, Mohabbatein, Waqt: The Race Against Time, Ram-Leela, Baghban; g comedy+romance; l hi | Colour, a song and a crowd. |
| 5 | navratri | Navratri nights | 3 / 0 (runs 9 days) | 0.7 | yes | l gu, hi; kw garba, dandiya; g music+romance; seeds Kai Po Che!, Loveyatri, Hum Dil De Chuke Sanam | Nine nights of garba. |
| 6 | durga-puja | Durga Puja | 3 / 1 | 0.8 | yes | l bn; kw durga puja, kolkata; seeds Kahaani, Devdas (2002), Pather Panchali, Bulbbul; g drama+mystery | Kolkata, drums and a goddess. |
| 7 | dussehra | Dussehra | 3 / 1 | 0.8 | yes | kw ramayana, ravana, hindu mythology; seeds Ramayana: The Legend of Prince Rama, Raavan, Adipurush, Baahubali: The Beginning, Baahubali 2 | Good wins. Eventually. |
| 8 | ganesh | Ganesh Chaturthi | 3 / 7 (ten days) | 0.7 | yes | l mr; kw ganesh, mumbai; seeds Agneepath (2012), Vaastav, Don (2006), Ventilator (2016), Sairat; g drama+action | Mumbai with the drums on. |
| 9 | eid-fitr | Eid | 4 / 2 | 0.9 | yes | rel Eid-week Hindi 2010-2025 (the Salman Khan slot); kw eid, ramadan; seeds Bajrangi Bhaijaan, Sultan, Ek Tha Tiger, Kick, Bharat, Gully Boy; g action+drama | Eid release day, the way the cinemas do it. |
| 10 | eid-adha | Eid al-Adha | 3 / 1 | 0.6 | no | same pool as eid-fitr | Eid again, the quieter one. |
| 11 | rakhi | Raksha Bandhan | 3 / 1 | 0.6 | no | sibling pool (see bhai-dooj) plus seeds Raksha Bandhan (2022), Dil Dhadakne Do, Hum Saath-Saath Hain | Siblings, with less shouting than yours. |
| 12 | janmashtami | Janmashtami | 2 / 1 | 0.6 | no | kw krishna, hindu mythology; seeds OMG: Oh My God!, Little Krishna, Mahabharat (2013 series), Sita Ramam | A night for Krishna. |
| 13 | onam | Onam | 5 / 2 | 0.8 | yes | l ml; rel Onam-week Malayalam 2015-2025; seeds Drishyam (2013), Premam, Bangalore Days, Kumbalangi Nights, Manjummel Boys, 2018 | Kerala, at its best. |
| 14 | pongal | Pongal and Sankranti | 4 / 2 | 0.8 | yes | l ta, te; rel Pongal-week Tamil 2015-2025; seeds Vikram, Jai Bhim, 96, Super Deluxe, Soorarai Pottru, Jailer; kw harvest | Tamil cinema's big week. |
| 15 | lohri | Lohri | 2 / 0 | 0.5 | no | l pa; seeds Udta Punjab, Qismat, Carry On Jatta, Chal Mera Putt; g comedy+romance | Fire, folk songs and Punjab. |
| 16 | independence | Independence Day | 7 / 1 | 0.9 | yes | kw india, patriotism, freedom fighter, indian army; seeds Lagaan, Rang De Basanti, Chak De! India, Swades, Uri: The Surgical Strike, Shershaah, Sardar Udham, Raazi, Border, Bhaag Milkha Bhaag; rel Aug-15-week Hindi 2010-2025 | For the country, in two and a half hours. |
| 17 | republic | Republic Day | 5 / 1 | 0.8 | yes | same pool as independence, plus seeds Article 15, Jai Bhim, Court | Republic Day on the sofa. |
| 18 | gandhi | Gandhi Jayanti | 2 / 1 | 0.5 | no | seeds Gandhi (1982), Lage Raho Munna Bhai, Sardar Udham; kw gandhi, non-violence | A quiet one about a loud idea. |
| 19 | childrens | Children's Day | 2 / 1 | 0.5 | no | g family+animation; seeds Taare Zameen Par, Stanley Ka Dabba, Chillar Party, Hawaa Hawaai, Gattu | You were one once. |
| 20 | teachers | Teachers' Day | 2 / 0 | 0.4 | no | kw teacher, school; seeds Hichki, Super 30, Dead Poets Society, Taare Zameen Par, 12th Fail | The one who stayed after class. |
| 21 | womens | Women's Day | 3 / 1 | 0.5 | no | kw female protagonist, woman director; seeds Queen, Thappad, Piku, English Vinglish, Gangubai Kathiawadi, Darlings | Her story, for once. |
| 22 | mothers | Mother's Day | 3 / 0 | 0.5 | no | kw mother, motherhood; seeds Mom, Nil Battey Sannata, Tribhanga, Secret Superstar, Lady Bird | Call her after. |
| 23 | fathers | Father's Day | 3 / 0 | 0.5 | no | kw father, father daughter relationship; seeds Piku, Dangal, Chhichhore, Udaan, The Pursuit of Happyness | Call him too. |
| 24 | friendship | Friendship Day | 3 / 0 | 0.5 | no | kw friendship, road trip; seeds 3 Idiots, Zindagi Na Milegi Dobara, Dil Chahta Hai, Kai Po Che!, Rang De Basanti, Chhichhore | For the group chat. |
| 25 | valentines | Valentine's | 6 / 1 | 0.8 | yes | g romance; kw love, romantic comedy; seeds Jab We Met, Dilwale Dulhania Le Jayenge, Before Sunrise, Barfi!, Sita Ramam, Crash Landing on You, About Time | Romance, no apologies. |
| 26 | halloween | Halloween | 7 / 1 | 0.8 | yes | g horror; kw halloween, haunted house, ghost; seeds Tumbbad, Stree, Bulbbul, Hereditary, The Conjuring, Get Out | Lights off, properly. |
| 27 | christmas | Christmas | 14 / 1 | 1.0 | yes | kw christmas, holiday; seeds Home Alone, Love Actually, Klaus, Elf, The Holiday, Die Hard, The Grinch; g family+comedy; rel Dec-25-week Hindi (the Aamir slot: Dangal, PK, Dhoom 3, 3 Idiots, Ghajini) | Snow on screen, fan on. |
| 28 | newyear | New Year's week | 5 (from 26 Dec) / 2 | 0.9 | yes | kw new year's eve, party; long series pools (tv, 3+ seasons, top rated) for the week off; seeds When Harry Met Sally, Zindagi Na Milegi Dobara, Dil Chahta Hai, Yeh Jawaani Hai Deewani | A week off deserves a long one. |
| 29 | mahashivratri | Mahashivratri | 2 / 0 | 0.4 | no | kw shiva, hindu mythology, himalayas; seeds Kedarnath, Kailasa docs if available; l hi | A night awake, on purpose. |
| 30 | ugadi | Ugadi and Gudi Padwa | 2 / 1 | 0.5 | no | l te, kn, mr; seeds RRR, Kantara, Pushpa, Sairat | New year, the other one. |
| 31 | baisakhi | Baisakhi | 2 / 1 | 0.4 | no | lohri pool | Punjab in April. |
| 32 | karva-chauth | Karva Chauth | 1 / 0 | 0.4 | no | kw marriage, husband wife relationship; seeds Dilwale Dulhania Le Jayenge, Kabhi Khushi Kabhie Gham, Hum Dil De Chuke Sanam | The moon can take its time. |
| 33 | chhath | Chhath | 2 / 1 | 0.4 | no | l bho, hi; kw bihar; seeds Gangs of Wasseypur, Super 30, Panchayat (series) | Bihar, UP and the river. |
| 34 | guru-nanak | Guru Nanak Jayanti | 2 / 0 | 0.4 | no | lohri pool plus kw sikh | Punjab, the thoughtful one. |
| 35 | ipl | IPL season | 3 / 0, runs ~Mar 22 to late May (table) | 0.5 | no | kw cricket; seeds M.S. Dhoni: The Untold Story, 83, Jersey, Lagaan, Kai Po Che!, Iqbal, Bandon Mein Tha Dum (docuseries); plus a fixed card "Live cricket on JioHotstar" that opens hotstar.com/in/sports | Between the overs. |
| 36 | cricket-event | ICC World Cup or a big India series | 3 / 1, from a small table of tournament windows (builder adds 2026 T20 World Cup Feb-Mar 2026 window; 2027 ODI World Cup) | 0.6 | yes | same pool as ipl | Cricket on, and something for the rain delay. |
| 37 | oscars | Oscars week | 7 / 2 | 0.5 | no | top rated English, year-1 and year-2, vote_count high; kw oscar winner if present | What the fuss was about. |
| 38 | birthday | Dev's birthday (date in `config.json` `birthday`, off if missing) | 1 / 0 | 1.0 | yes | the single highest-affinity unwatched title in the pool | Your day. One press. |

**Seasons (month-driven, low weight, never the hero; a weather node overrides them while it holds)**

| # | id | Name | When (India, north) | Peak | Signals | Why line |
|---|---|---|---|---|---|---|
| 39 | winter | Winter nights | 1 Dec - 15 Feb | 0.3 | kw snow, winter, mountain; seeds Haider, Kedarnath, Fargo (film and series), Goblin, Crash Landing on You, The Revenant; g drama+thriller | Blanket weather. |
| 40 | spring | Spring | 16 Feb - 31 Mar | 0.25 | g romance+comedy; recent top-rated, light | Lighter evenings. |
| 41 | summer | Summer | 1 Apr - 15 Jun | 0.3 | kw beach, road trip, summer vacation; seeds Dil Chahta Hai, Zindagi Na Milegi Dobara, Call Me by Your Name, Mamma Mia!, Top Gun: Maverick, Jaws; g adventure+comedy | Too hot to go out. Good. |
| 42 | monsoon | Monsoon | 16 Jun - 15 Sep | 0.35 | kw rain, monsoon; seeds Tumbbad, Lagaan, Monsoon Wedding, Wake Up Sid, Barsaat, Parasite, Blade Runner 2049; g drama+mystery | Rain on the window, rain on screen. |
| 43 | festive-autumn | Festive season | 16 Sep - 30 Nov | 0.25 | g family+comedy; l hi | The long festive run. |

**Clock (hour of day; India time; the "moment" shelf)**

| # | id | Name | When | Peak | What it does | Why line |
|---|---|---|---|---|---|---|
| 44 | late-night | Late tonight | 23:00 - 04:00 | 0.5 | Prefers series and anything with runtime <= 50 min (`Details.Runtime` when cached, else kind tv); the hero pick prefers an episode over a film; the Continue slide shows "N min left" bigger. Horror and 3-hour films sink. | Short enough to finish. |
| 45 | evening | Evening | 18:00 - 23:00 | 0.3 | The default page. Nothing special; this is the time the page was designed for. | (none) |
| 46 | afternoon | Afternoon | 12:00 - 18:00 | 0.3 | Prefers films over series; long films allowed; documentaries up. | Time for a long one. |
| 47 | morning | Morning | 04:00 - 12:00 | 0.3 | Prefers YouTube Continue items and short comedy; no horror. | Easy start. |

**Week (weekday vs weekend; combined with clock)**

| # | id | Name | When | Peak | What it does | Why line |
|---|---|---|---|---|---|---|
| 48 | friday-night | New this week | Fri 17:00 - Sat 02:00 | 0.45 | Promotes the existing "new" row to the moment slot, newest first, films first. | Fresh this week. |
| 49 | saturday | Saturday | Sat 10:00 - 23:00 | 0.4 | Long films, blockbusters (v:blockbuster feature), trilogies if seeds exist. | You have the time. |
| 50 | sunday-evening | Sunday evening | Sun 17:00 - 23:00 | 0.45 | Comfort: comedy, family, his top-affinity genre; nothing heavy; series he is mid-way through first. | Something kind before Monday. |
| 51 | weeknight | Weeknight | Mon-Thu 20:00 - 23:00 | 0.35 | One episode: series only, mid-way shows first, then series he finished a season of. | One episode. Maybe two. |

**Weather (optional; needs `lat`/`lon` in `config.json`; Open-Meteo, free, no key: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,precipitation,weather_code`; fetched hourly, cached, off when missing or unreachable)**

| # | id | Name | Condition | Peak | Signals | Why line |
|---|---|---|---|---|---|---|
| 52 | rain-now | Rainy evening | precipitation > 0 or weather_code 51-99 | 0.5 | monsoon pool | It's raining. Stay in. |
| 53 | heat | Hot night | temperature >= 35 C | 0.4 | summer pool, plus kw snow for contrast | Something cold. |
| 54 | cold | Cold night | temperature <= 12 C | 0.4 | winter pool | Blanket weather, confirmed. |

**State (what Dev is in the middle of; from history, episodes, library)**

| # | id | Name | Condition | Peak | What it does | Why line |
|---|---|---|---|---|---|---|
| 55 | mid-title | Continue watching | newest history entry 2-95 percent | 1.0 | Already the first hero slide (`contHero`). Unchanged. | You stopped last night at 23:10 |
| 56 | up-next | Up next | an episode finished (>= 92 percent) and `nextEpisode` knows the next | 1.0 | Hero slide: kicker `UP NEXT · PRIME VIDEO`, title, `S1 E4 · Episode name`, action `OK  PLAY S1 E4`. This is LAUNCHER-V3-SPEC hero (b), unbuilt. Beats every festival. | Carry on. |
| 57 | just-finished | Because you finished X | a show's last episode or a film finished within 7 days | 0.8 | Shelf from `Recommendations` of that title, same language first; if TMDB says the next season exists and is on his apps, the first card is "Season N+1". | You finished X. Here is more like it. |
| 58 | new-episode | New episodes of your shows | any show in progress or finished-season with `LastAir` within 7 days or `NextAir` today | 0.9 | Shelf of those shows, newest air date first; on the air day, a hero slide `NEW EPISODE · NETFLIX`. Needs `Details` refreshed weekly for shows in the library (cheap: one call per show). | Out this week. |
| 59 | binge | Keep going | 3+ episodes of one show in 48 h | 0.7 | The Continue slide's action reads `OK  NEXT EPISODE`; the moment shelf is that show's season (episodes as cards). | You're on a roll. |
| 60 | stuck | Just press OK | launcher open 8+ min, nothing opened, 20+ focus moves | 0.6 | The hero jumps to the highest-affinity unwatched pick and the kicker says `CAN'T DECIDE? · PRIME VIDEO`. Once per session. | OK plays this. |
| 61 | away | Welcome back | no history event for 7+ days | 0.4 | For you is rebuilt before the page is sent (not from the 6 h cache); the hero is a pick, not a stale Continue. | It's been a while. |

Sixty-one nodes. The calendar ones carry the festival ask; the clock, week, weather and state ones carry "the other things".

### 3.8 How banners and sections appear

The design world stays (DESIGN.md: black ground, dim text, one red fill; LAUNCHER-V3-SPEC stage). No festival artwork, no colour accents, no lamps, no confetti. The argument: at 3 m, at night, a festival is a *word* and a *picture*. The picture is the chosen title's own backdrop, which is already how the stage works. The word is the kicker.

- **Hero slide** (the "banner"): same `heroFrame` with two new fields, `Kick` ("DIWALI WEEK") and `Occ` (node id). The kicker reads `DIWALI WEEK · NETFLIX`. The why line is the node's `Why`. Action `OK  OPEN IN NETFLIX`. The stage backdrop is the title's. Nothing else changes.
- **Themed shelf** (the "section"): a `shelfFrame` with id `occ-<node>`, title the node `Name` ("Diwali week"), `Why` the node's why line (so the stage kicker for a card reads `ON PRIME VIDEO · DIWALI WEEK`). Same cards, same glow, same size.
- **How many at once**: one calendar shelf, one moment shelf, one occasion hero slide. Never more.
- **When they fade**: by weight (3.3). On Bhai Dooj evening the Diwali shelf is still there; on the 12th it is gone. "Late tonight" appears at 23:00 and is gone at 04:00; the page re-sends itself on the hour (3.9), so a launcher left open at 22:40 changes at 23:00 without a restart.
- **The phone**: nothing changes on the remote. The remote never shows occasions.

### 3.9 How the system keeps itself current

- **Date**: `occasion.Evaluate(time.Now(), viewer)` runs inside `rowsFrame`, so every push is current. Add a ticker in `launcherData`: `pushRows()` on the hour and at the first minute after midnight (only when a launcher is connected and no panel is open: send `{"t":"rows"}` as today; the page already rebuilds rows without moving focus when `sel.id` survives `navIds()`).
- **Candidates**: fetched in `refreshRec` (every 6 h) for nodes whose window opens within 14 days; saved in `rows.json` under `occasions: {nodeID: [items]}`; so a cold start on Diwali evening with no network still has the shelf from the last refresh.
- **Dates**: bundled + cache + January refresh (3.5).
- **Learning**: section 3.4.
- **Preview for Dev and tests**: `TVMODE_FAKE_NOW=2026-11-06T21:30` (environment) makes the engine and the clock nodes use that moment; logged loudly at start (`occasion: FAKE NOW 2026-11-06 21:30`). The smoke mode (`TVMODE_TEST_ROWS`) gets a canned `occ-diwali` shelf in `cannedData()` so the page can be checked with no TMDB.
- **Log line** per build: `occasion: live diwali=0.80 late-night=0.50; shelves occ-diwali(12) occ-late-night(9); hero diwali`.

---

## 4. The hub: everything he watches, from everywhere

### 4.1 Sources that are realistic (no logins, no Chrome profile)

| Source | How it gets in | What it gives | Status |
|---|---|---|---|
| JioHotstar, Prime, YouTube in TV Mode's own Edge | the poll loop, `JSWatch` → `noteWatching` | title, show, episode, position, image | built |
| Netflix in Dev's Chrome | the helper extension's reports to `/api/ext/*` | title, episode, position | built |
| **Desk Chrome (all four sites)** | a sibling extension, "TV Mode reporter", same pattern as `netflix-dpad`: content script reads the page's own title/episode/`<video>` time on netflix.com, primevideo.com, hotstar.com, youtube.com and POSTs to `127.0.0.1:8770/api/ext/watch` with `where:"desk"`. Dev installs it himself (Load unpacked), like the Netflix helper. It reads no cookies, no history, nothing outside the open tab. | what he watches at the desk, with progress | phase 4 |
| **Phone: share to TV Mode** | the remote PWA gains a Web Share Target (`manifest.webmanifest` `share_target`, GET with `?url=`). From any app's share sheet he picks "TV Mode"; the page opens, sends `{"t":"save","url":...}` to the PC over the relay, and shows "Saved to TV". The PC resolves the URL (YouTube id via oEmbed, a Netflix/Prime/Hotstar title page via `tmdb.Find` on the page title, else the raw link) and adds it to Saved. | links he finds on the phone: YouTube videos, a show someone sent, a trailer | phase 2 |
| **Desk mode "Open here"** | clicking a title in desk mode and choosing Open here records an `open` event with `where:"desk"` | which titles he opened at the desk (progress only with the reporter) | phase 3 |
| Prime and Hotstar watchlists | the hidden scout walker (already used by `hotstarGo`) opens the signed-in watchlist page in TV Mode's own Edge profile once a day and reads the titles | his in-app watchlists as Saved items, tagged by service | phase 4, fragile, optional |
| Netflix "My List" | the helper extension already reads Netflix's metadata responses; it can report the list page | same | phase 4, optional |
| Letterboxd / Trakt / IMDb lists | only if public and only by RSS or public page; needs an account he already has | out, until he asks |
| Phone apps (YouTube app, Netflix app) | no path without a login | out |

### 4.2 One model: the library

New package `internal/library`, file `%APPDATA%\TVMode\library.json`. Additive: `history.json` keeps feeding Continue watching exactly as today; the library records on top, from the same hooks (`noteWatching`, `NoteOpened`, `openItem`, the ext bridge, share, desk open).

```go
type Item struct {
    ID       string   // "tv1396" | "movie27205" | "yt:dQw4w9WgXcQ" | "url:host/path"
    Kind     string   // movie | tv | yt | other
    Title    string
    Show     string   // series name when Kind is tv
    Img      string   // registered through imgURL like everything else
    Services []string // where it streams (avail book first, then TMDB)
    State    string   // watching | finished | saved | dropped
    Season, Episode int
    Pos, Dur int
    Pct      float64
    Added    int64    // first seen
    LastAt   int64
    LastWhere string  // tv | desk | phone
    LastSvc  string
    Source   string   // tv-poll | netflix-helper | desk-reporter | share | desk-open | watchlist
}

type Event struct {
    At   int64
    ID   string
    Type string // play | progress | finish | save | drop | open
    Where, Service string
    Pos, Dur int
}
```

Identity rule: resolve to a TMDB key when a title can be found (the app already does this in `fillMeta` and `seedTaste`); YouTube by video id; else by host+path. Events capped at 5000, oldest rolled. `finish` is written when `Pct() >= 0.92` (the same threshold `nextEpisode` uses) or when the last episode of the last season reaches it.

Views the library answers, for both TV and desk:

- **Continue**: `watching`, newest first (today's history, but unlimited and with `LastWhere`).
- **Saved**: `saved`, newest first.
- **Finished**: `finished`, newest first; "this month", "this year".
- **Shows I follow**: `tv` with any event in 60 days and `InProd` true (feeds node 58).
- **Dropped**: hidden from every shelf; taught to taste as `Abandon` once.

### 4.3 Navigation to any of it

- **TV**: a `Saved` row after Continue watching (only when 2+ items, like `cont`); OK on a card opens the service exactly as `openItem` does today (TMDB items through the link book and scouts; YouTube by URL). A `Finished recently` row is not shown on the TV; it is desk material.
- **Desk**: section 5.
- **Phone**: the remote does not show lists. The one addition is the share target ("Saved to TV") and a "Play on TV" link in that confirmation, which sends `{"t":"openitem"}` for the just-saved item.

---

## 5. Desktop mode

### 5.1 What it is

The same memory, at the desk, with a mouse. Dev sits at the PC (main monitor, lit room, keyboard and mouse) and wants to see everything in one place, tidy it, pick the next thing, and either watch it here or send it to the TV. TV mode is lean-back and shows almost nothing; desk mode is lean-forward and shows everything, densely.

### 5.2 How it runs and how it shares data

- Served by the same Go program at `http://127.0.0.1:8770/desk/` from `web/desk/` (loopback only, like the launcher). It works in standby too, because `-standby` keeps the HTTP server up with no Edge. That is the common case at the desk.
- Opened by a second desktop shortcut, "TV Mode desk", which runs `tvmode.exe -desk`: if 8770 is busy it just opens the URL in the default browser (a plain URL open; no flags, no profile), else it starts standby and then opens the URL.
- Data over plain loopback JSON, no socket: `GET /api/rows` (the same `rowsFrame`), `GET /api/library?view=continue|saved|finished|all`, `POST /api/library` (`{id, state}` to mark finished, saved, dropped, or `{url}` to add a link), `GET /api/occasions?at=` (what the engine would show at a date; the preview for Dev), `POST /api/open` (`{key|id|i, where:"tv"|"desk", se, ep}`). `where:"tv"` calls `openItem` (starting the TV first with the existing `/api/start` path when in standby); `where:"desk"` opens the URL `openItem` would have used, in the default browser (`rundll32 url.dll,FileProtocolHandler <url>`), and records an `open` event `where:"desk"`. Netflix at the desk opens its normal page in his default browser; nothing else.
- Search, details and episodes reuse `/api/search`, `/api/title`, `/api/episodes` unchanged.

### 5.3 Layout (1440 to 2560 wide; no phone layout)

Left rail, five words, in this order and no more: **Tonight · Continue · Saved · Library · Search**. Search also opens with `/` from anywhere.

- **Tonight**: the hero (Continue or Up next first, the occasion slide second), the live occasions as small lines under it ("Diwali in 2 days · Late tonight"), then the same rows as the TV, as a vertical list of horizontal rails, 12 max. Hover lifts a card; click opens a side panel (the TV detail panel's content, desktop size) with two buttons: **Open here** (primary, red) and **Play on TV**. If the TV is off, "Play on TV" reads "Start TV and play".
- **Continue**: every `watching` item as a list: picture, title, S/E, progress bar, last seen (where and when), service. Row actions: Open here, Play on TV, Finished, Drop.
- **Saved**: the same list for `saved`, plus a text box "Paste a link" at the top (YouTube or a show page).
- **Library**: a table, sortable: title, kind, service, state, last seen, where. Filters: state, service, year. Bulk mark. A small line at the top: "This month: 9 titles, 14 h" and "This year: 61 titles". This is where he fixes wrong entries.
- **Search**: the TV search grid, mouse-sized.

Design: the same tokens (DESIGN.md colours; `#000` ground, `#141414` surfaces, `#e6e6e6` / `#9a9a9a` text, `#b00710` only as the primary fill). Type: Segoe UI at 14-16 px body, 20-24 px titles (not the TV's 28+ floor). Cards 240x135 with the service ring on hover and selection. No glow spreads at desk size; a 2 px ring is enough. It is a dark desktop tool, not a lit room page, because he is a designer and his desk is dark already; if he wants a light theme later that is one CSS variable block.

Keyboard: `/` search, arrows move in the grid, Enter opens the panel, `Space` is Open here, `T` is Play on TV, `S` save, `F` finished, `Esc` closes. Mouse does everything too.

### 5.4 What desk mode is not

Not a second remote (the phone is the remote). Not a player (the services play). Not a settings app beyond editing the library and the occasion table. Not phone width.

---

## 6. Innovative ideas, ranked by value for Dev

1. **Up next as the first press** (node 56). Finishing an episode anywhere makes the next one the hero with one action. Why: it is the most common "what now?" and the spec already promised it.
2. **Share to TV from the phone** (4.1). Why: it is the only way phone discoveries reach the TV, and it needs no login, no app, one share-sheet tap.
3. **The occasion engine** (section 3). Why: asked for, and it is what makes the page feel alive and his.
4. **New episodes of your shows** (node 58) with a hero slide on the air day. Why: TMDB already has the date; today it is a chip he has to focus to see.
5. **The library and desk mode** (4, 5). Why: without a record there is no hub; without a mouse surface there is no way to fix it.
6. **Reasons that name the feature** ("Because you finish Korean thrillers"). Why: free, from `taste.Weight`, and it turns "Picked for you" from filler into trust.
7. **Late tonight** (node 44). Why: he watches tired at night; an episode-length pick is kinder than a 3-hour film at 00:40.
8. **Desk reporter extension** (4.1). Why: closes the biggest hole in "everywhere" with a pattern he already trusts.
9. **Just press OK** (node 60). Why: decision fatigue is the enemy; after 8 minutes the page should decide.
10. **Year recap** (desk, December): "61 titles, 40 h, most finished: crime series, most dropped: horror, longest show: Pantheon". Why: delight, cheap once the library exists, and it is the kind of thing he will screenshot.
11. **On this day** shelf: titles he finished exactly a year ago, or classics released this week in past years. Why: cheap once the library exists; warm.
12. **Mood tap on the phone** (three words in the drawer: Light, Gripping, Comfort; biases tonight's ranking). Why: one optional tap, no menu; but it is a choice, so it ranks below the automatic ones.
13. **Weather nodes** (52-54). Why: small delight, free API, off by default.
14. **Watchlist imports** (Prime, Hotstar, Netflix lists). Why: real value but fragile scraping; last.

---

## 7. Phased build plan

Each phase is shippable on its own and verified before the next starts. Model for subagents: Sonnet builds and reviews.

### Phase 1: the occasion engine on the existing launcher (one sitting)

Files:
- `internal/occasion/occasion.go` (types, `Evaluate`, ramp maths, clock/week/season/state rules), `nodes.go` (the 61 nodes as data), `dates.go` (fixed and rule dates), `dates.json` (embedded table 2025-2028, verified), `ics.go` (the January refresh, mapped by name lists, cached), `learned.go` (`occasions-learned.json`), `occasion_test.go`.
- `internal/tmdb/tmdb.go`: `Keyword(name string) (int, error)` with a cache file; nothing else changes.
- `internal/app/launcher_data.go`: `refreshRec` also fetches node candidates (keywords, release windows, genre/lang proxies, seeds) for nodes opening within 14 days and saves them in `rows.json` `occasions`; `rowsFrame` asks `occasion.Evaluate`, inserts up to two `occ-*` shelves at the positions in 3.3, adds the occasion hero slide with `Kick`/`Occ`, applies the 15 percent lean in `personal`; `signal()` and `openItem` call `occasion.Note` for `occ-*` rows; an hourly/midnight `pushRows` ticker; `cannedData()` gains `occ-diwali`; `TVMODE_FAKE_NOW` read in one place (`a.now()`), used by `stoppedAt`, `specs`, and the engine.
- `internal/app/launcher_data.go`, hero: also build spec case (b) "Up next" from `nextEpisode` (node 56). Small and the highest-value item on the list.
- `web/launcher/launcher.js`: `renderHero` uses `h.kick` when present for the kicker's first word (else the existing words); `renderCard` already prints `item.why` after the service, which carries the node's why line; remove the 10 s hero auto-rotate.
- `web/launcher/launcher.css`: nothing, unless the kicker needs `white-space` for longer words.
- PROTOCOL.md: `rows` frame gains `shelves[].id = "occ-*"`, `hero[].kick`, `hero[].occ`; `sig` unchanged. DESIGN.md: note the per-service glow as it is built.

What done looks like:
- `TVMODE_FAKE_NOW=2026-11-06T21:30 tvmode.exe -windowed`: the hero's first pick slide reads `DIWALI WEEK · <service>` with a Hindi family film and the why line; the third row is "Diwali week" with 8+ cards, all on his services; the stage for a card in it reads `ON NETFLIX · DIWALI WEEK`. Log shows the live line from 3.9.
- `2026-02-10T21:30`: no `occ-*` shelf, no occasion slide, the page is as today minus the auto-rotate.
- `2026-02-10T00:30`: a "Late tonight" shelf after For you, series and short films first.
- `2026-12-20T21:30`: Christmas week shelf; `2026-12-27`: New Year's week replaces it.
- An episode marked >= 92 percent in `episodes.json` with a known next episode: the first hero slide is `UP NEXT`, action `OK  PLAY S1 E4`, and OK opens it exactly (the `openitem` path with `se`/`ep` already exists).

How to test:
- `go vet ./... && go test ./internal/occasion ./internal/app ./internal/tmdb` with table tests for: ramp values on each day of a window; the Diwali window from the table; Holi 2026; a missing-year lunar node stays off; the ICS parser on a fixed sample; clock and week nodes at boundary minutes; state nodes from a canned viewer; blending: at most two shelves, hero order (Continue > Up next > festival > season > clock).
- `node --check web/launcher/launcher.js`; the smoke launcher mode (`cmd/smoke -launcher` with `TVMODE_TEST_ROWS`) with the canned `occ-diwali` shelf: focus reaches it, OK opens the panel, the stage kicker carries the why line.
- Screenshot at 1920x1080 for the four fake dates above; a zoomed visual sweep of the kicker and shelf title per the review rule; nothing brighter than the title text, no new colours.
- Count TMDB calls in one `refreshRec` with a log counter: must stay under 180 (today ~140); keyword and release-window results cached for a year.

### Phase 2: the library, Saved, share to TV

Files: `internal/library/{library.go, library_test.go}`; hooks in `launcher_data.go` (`noteWatching`, `openItem`, `fillMeta`), `extbridge.go`, `app.go` (`NoteOpened`); `rowsFrame` adds the `saved` row; `handleRemote` gains `{"t":"save","url"}`; `web/remote/manifest.webmanifest` `share_target`, `remote.js` handles `?url=` on load (after `state`), shows "Saved to TV" with a Play on TV link; `relay/worker.js` passes the GET through to the page (static; no change if the page handles the query); PROTOCOL.md.
Done: sharing a YouTube link from the phone shows a Saved row on the TV within 5 s with the right title and thumbnail (oEmbed); finishing an episode writes a `finish` event; `library.json` lists it; the Continue row is unchanged.
Test: Go tests for identity resolution and state transitions; a smoke that POSTs a fake ext report and a fake share and reads the library view; phone check by Dev.

### Phase 3: desk mode

Files: `web/desk/{index.html, desk.css, desk.js}`; `server.go` routes `/desk/`, `/api/rows`, `/api/library`, `/api/occasions`, `/api/open`; `cmd/tvmode/main.go` `-desk`; a second shortcut.
Done: at the desk, with the TV off, `tvmode.exe -desk` opens Tonight in the default browser; Continue lists everything with where/when; marking Finished removes it from the TV's Continue on the next push; Open here opens the title's page in the default browser; Play on TV starts the TV and plays; `/api/occasions?at=2026-11-06` shows what Diwali week will look like.
Test: Go tests for the API handlers (loopback gate: 403 off-loopback like everything else); a browser check at 1920 and 2560 wide with the review rule (desktop sizes only).

### Phase 4: desk reporter extension, watchlists

Files: `extensions/tvmode-reporter/{manifest.json, content.js, background.js, README.md}` (same shape as `netflix-dpad`; manifest `host_permissions` for the four sites; no cookies, no history permission; POST to loopback only); `extbridge.go` accepts `where:"desk"`; optional scout walker for Prime/Hotstar watchlists.
Done: a video played in desk Chrome appears in the library within a minute with `LastWhere: desk`; the TV's Continue shows it with "at the desk, 20:14".

### Phase 5: delight

Year recap page in desk mode; On this day shelf; mood tap in the phone drawer; weather nodes switched on when `lat`/`lon` exist.

---

## 8. Risks and what must not change

**Must not change**
- The four services, exactly (SHAPE.md "decisions a builder must not invent").
- Netflix rules (NETFLIX-PLAN.md): never read, copy or write Chrome's profile; no `--user-data-dir`, no `--remote-debugging-port`; never sign in for Dev; close with WM_CLOSE only. The desk reporter and the desk "Open here" are a URL open and a page's own report; nothing more.
- Credential hygiene: TMDB and any other key read only in Go, never logged, never sent to a page; images only through `imgURL`/`imgHandler`; pages can never name an arbitrary URL. Keyword ids and ICS data are cache files, not secrets, but they live beside the cache, not in `web/`.
- The pairing and relay protocol, the ack/id rules, and `Esc never quits` (`launcher.js` comment).
- `/ws/screen` frames: add fields, never rename or remove; the page ignores unknown fields today and must keep doing so.
- DESIGN.md's world on the TV: black, dim text, one red fill, no new colours for occasions. The per-service glow stays as built in v3.
- Smoke behaviour: `TVMODE_TEST_ROWS` never touches `taste.json`, `links.json`, `avail.json`, `episodes.json`; the new `library.json` and `occasions-learned.json` follow the same rule (empty path in test).
- No paid APIs, no accounts, no scraping of anything he has not signed into inside TV Mode's own Edge profile.

**Risks**
- *TMDB keyword coverage for Indian festivals is thin.* Mitigated by the release-window and language/genre proxies and the seed lists; a node that yields under 4 titles on his apps shows nothing rather than a wrong shelf (same rule as `updateBecause`).
- *Wrong festival dates.* A bundled table is only as good as its checking. The builder verifies each seed date against a government or panchang source before committing; the ICS refresh is a second opinion, logged when it disagrees with the table (`occasion: ics says diwali 2027-10-29, table says 2027-10-28`): table wins until Dev edits it.
- *The ICS source changes or goes away.* The engine must work with the table alone; the refresh is an extra.
- *Over-festivalising.* The caps in 3.3 are the guard: one slide, two shelves, 15 percent lean. If a review still finds it loud, lower `Peak` on the day nodes; do not add more slots.
- *TMDB call budget.* Candidates fetched only for nodes opening within 14 days; keyword and release-window results cached a year; a log counter per refresh.
- *Shelf de-duplication starves other rows.* The themed shelf sits early, so it wins titles from "Indian" or "Family"; acceptable, and bounded to 12 per kind.
- *The hero no longer rotates.* Dev may miss it; the peek strip and left/right stay. If he wants it back, make it a config flag, not the default.
- *Library identity errors* (two entries for one show). Resolve through the same `normTitle`/TMDB path the episodes book uses; desk mode exists so he can merge or fix by hand.
- *Desk "Open here" in the default browser.* If his default is Edge rather than Chrome, Netflix still opens fine; nothing in this plan depends on which it is.
- *Share target on the public origin.* It is a static GET to the remote page; nothing is sent to the worker beyond the URL in the query; the page forwards it over the authenticated session like any other frame. Treat the shared URL as data: validate host (youtube, youtu.be, netflix, primevideo, hotstar) before resolving; anything else is stored as a plain link and never fetched.
- *Weather API outage or no `lat`/`lon`.* Nodes 52-54 are simply off.

---

## 9. Three decisions for Dev

1. **At the desk, what should a click do first: open here, or play on the TV?** Recommended: Open here is the primary (red) button, Play on TV the second. He is at the desk; the TV is usually off.
2. **Festival look: words and the title's own picture only (recommended), or festival artwork and colour accents?** Recommended: words only. It keeps DESIGN.md intact and reads better at 3 m in the dark.
3. **Is a "TV Mode reporter" extension in his desk Chrome (installed by him, reports only the open tab's playback to the PC) acceptable?** Recommended: yes, as phase 4. Without it, desk watching is tracked only when he starts it from desk mode.

## Dev's decisions

- 2026-11-04: Desk click opens the title on the desk first; "Play on TV" is the second button.
- 2026-11-04: Festival look: **words plus the title's own picture only.** No new artwork, no new colours (DESIGN.md "Occasions on the launcher").
- Desk reporter extension: not decided yet (Fable recommends yes, in phase 4).
- 2026-11-04 (later, overrides the festival-look line above): **stronger festival look.** A festival slide or festival-shelf card lights the banner in the festival's own warm colour (`--occ`/`--occ2` per `[data-occ]`, replacing the service glow while it shows), a string of softly glowing lamps along the foot of the picture, a mark before the kicker (a diya for Diwali, a spark otherwise), and the festival shelf's heading and focus ring in that colour. Built in `web/launcher/launcher.css` (end of file) and `launcher.js` (`occFor`, `occMark`). Do not undo as "new colours": Dev asked for it.
- 2026-11-04: Desk reporter: **yes**, and "build it all" (phases 2, 4, 5). Phase 4 extends the existing TV Mode Helper (already in his everyday Chrome) to report desk playback passively, rather than a second extension, unless a reason against turns up.
