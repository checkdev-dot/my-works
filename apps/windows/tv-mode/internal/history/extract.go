package history

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// Page is what one CDP evaluation reads from the current service page.
type Page struct {
	Href     string
	Title    string // document.title
	OGTitle  string
	OGImage  string
	PTitle   string // Prime player title (.atvwebplayersdk-title-text)
	PSub     string // Prime player subtitle ("Season 1, Ep. 3 Name")
	H1       string
	HasVideo bool
	Playing  bool
	Pos, Dur int
	Loop     bool
}

var (
	reSE1 = regexp.MustCompile(`(?i)\bseason\s*(\d+)\W+(?:episode|ep\.?)\s*(\d+)\b[\s:.\-\x{2013}]*(.*)`)
	reSE2 = regexp.MustCompile(`(?i)\bS(\d{1,2})\s*[ .\-]?\s*E(\d{1,3})\b[\s:.\-\x{2013}]*(.*)`)
	reEp  = regexp.MustCompile(`(?i)\b(?:episode|ep\.?)\s*(\d+)\b[\s:.\-\x{2013}]*(.*)`)
	reYT  = regexp.MustCompile(`[?&]v=([A-Za-z0-9_-]{11})`)
	reHS  = regexp.MustCompile(`/(shows|movies|tv|sports)/([^/]+)/(\d+)(?:/([^/]+)/(\d+))?/watch`)
	// JioHotstar's tab title: "Watch Gravity Falls S2 Episode 1 on JioHotstar" (or "S2 E1")
	reHSNum = regexp.MustCompile(`(?i)\bS(\d{1,2})\s*(?:Episode|Ep\.?|E)\s*(\d{1,3})\b`)
)

// ParseEpisode finds "Season 1, Ep. 3 Name", "S1 E3 Name" or "Episode 3: Name".
func ParseEpisode(s string) (season, ep int, rest string) {
	s = strings.TrimSpace(s)
	for _, re := range []*regexp.Regexp{reSE1, reSE2} {
		if m := re.FindStringSubmatch(s); m != nil {
			season, _ = strconv.Atoi(m[1])
			ep, _ = strconv.Atoi(m[2])
			return season, ep, strings.TrimSpace(m[3])
		}
	}
	if m := reEp.FindStringSubmatch(s); m != nil {
		ep, _ = strconv.Atoi(m[1])
		return 0, ep, strings.TrimSpace(m[2])
	}
	return 0, 0, s
}

// SlugTitle turns "bbtel-day-58-revenge" into "Bbtel Day 58 Revenge".
func SlugTitle(s string) string {
	w := strings.Fields(strings.ReplaceAll(strings.ReplaceAll(s, "-", " "), "_", " "))
	for i, x := range w {
		if x != "" {
			r := []rune(x)
			w[i] = strings.ToUpper(string(r[0])) + string(r[1:])
		}
	}
	return strings.Join(w, " ")
}

func stripParam(u, name string) string {
	// a YouTube TV address keeps its query after the # (#/watch?v=ID&t=5s)
	i := strings.IndexAny(u, "?")
	if i < 0 {
		return u
	}
	head, q := u[:i], u[i+1:]
	var keep []string
	for _, kv := range strings.Split(q, "&") {
		if !strings.HasPrefix(kv, name+"=") {
			keep = append(keep, kv)
		}
	}
	if len(keep) == 0 {
		return head
	}
	return head + "?" + strings.Join(keep, "&")
}

// FromPage turns what a page showed into an entry. ok is false unless a real
// video is playing: longer than two minutes, not looping, not paused.
func FromPage(service string, p Page) (e Entry, ok bool) {
	if !p.HasVideo || !p.Playing || p.Dur <= 120 || p.Loop {
		return e, false
	}
	e = Entry{Service: service, URL: p.Href, Pos: p.Pos, Dur: p.Dur, Img: p.OGImage}
	switch service {
	case "youtube":
		m := reYT.FindStringSubmatch(p.Href)
		if m == nil {
			return e, false // the TV home, a channel page: never an item
		}
		e.Group = "yt:" + m[1]
		e.Title = CleanTitle(p.Title)
		if e.Title == "" || e.Title == "YouTube on TV" || e.Title == "YouTube" {
			e.Title = "YouTube video"
		}
		e.Img = "https://i.ytimg.com/vi/" + m[1] + "/hqdefault.jpg"
		e.URL = stripParam(p.Href, "t") + "&t=" + strconv.Itoa(p.Pos) + "s"
		if !strings.Contains(p.Href, "?") {
			e.URL = p.Href
		}
		return e, true
	case "prime":
		show := strings.TrimSpace(p.PTitle)
		if show == "" {
			show = CleanTitle(strings.TrimPrefix(p.Title, "Prime Video: "))
		}
		if show == "" {
			return e, false
		}
		e.Title = show
		if p.PSub != "" {
			e.Season, e.Episode, e.EpTitle = ParseEpisode(p.PSub)
			if e.Episode == 0 {
				e.EpTitle = strings.TrimSpace(p.PSub)
			}
		}
		e.Show = show
		e.URL = stripParam(p.Href, "t")
		if e.Episode > 0 || e.EpTitle != "" {
			e.Group = "prime|" + strings.ToLower(show)
		} else {
			e.Show = ""
		}
		return e, true
	case "jiohotstar":
		if m := reHS.FindStringSubmatch(p.Href); m != nil {
			kind, slug := m[1], m[2]
			e.Title = SlugTitle(slug)
			if kind == "shows" && m[4] != "" {
				e.Show = e.Title
				e.Season, e.Episode, e.EpTitle = ParseEpisode(SlugTitle(m[4]))
				if e.Episode == 0 && e.EpTitle == "" {
					e.EpTitle = SlugTitle(m[4])
				}
				// the slug is the episode's name; its number is in the tab title ("Watch Gravity Falls S2 Episode 1 on JioHotstar")
				if e.Season == 0 {
					if n := reHSNum.FindStringSubmatch(p.Title + " " + p.OGTitle + " " + p.H1); n != nil {
						e.Season, _ = strconv.Atoi(n[1])
						e.Episode, _ = strconv.Atoi(n[2])
					}
				}
				e.Group = "jiohotstar|" + strings.ToLower(slug)
			}
		} else {
			if !strings.Contains(p.Href, "/watch") {
				return e, false // the home page plays trailers by itself: never an item
			}
			t := CleanTitle(p.OGTitle)
			if t == "" {
				t = CleanTitle(p.Title)
			}
			if t == "" {
				return e, false
			}
			e.Title = t
		}
		e.URL = stripParam(p.Href, "t")
		return e, true
	}
	return e, false
}

// OembedURL is the YouTube oEmbed address for a video id (no key needed).
func OembedURL(id string) string {
	return "https://www.youtube.com/oembed?format=json&url=" + url.QueryEscape("https://www.youtube.com/watch?v="+id)
}
