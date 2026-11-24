package app

// Links into the library: the phone's share sheet ({"t":"save","url":..}) and the desk's
// "Paste a link" use this one resolver (HUB-DIRECTION.md 4.1 and 8).
//
// The shared address is DATA. Only the four services' own hosts are ever looked at, and
// only over https with redirects kept on the same service; a YouTube link is resolved
// with oEmbed (no key), a Netflix, Prime or JioHotstar title page is matched on TMDB by
// its title (taken from what the phone shared, else the page's own og:title). Anything
// else is stored as a plain link and never fetched.

import (
	"encoding/json"
	"errors"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/library"
	"tvmode/internal/tmdb"
)

// shareIn is what the phone's share sheet (or the desk's box) hands over.
type shareIn struct {
	URL   string `json:"url"`
	Title string `json:"title"`
	Text  string `json:"text"`
}

var (
	reShareURL  = regexp.MustCompile(`https?://[^\s<>"']+`)
	reAmazon    = regexp.MustCompile(`^(?:www\.)?amazon\.(?:com|in|co\.uk|de|co\.jp|ca|com\.au|fr|it|es)$`)
	reOgTitle   = regexp.MustCompile(`(?is)<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']`)
	reHTMLTitle = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	reShareLead = regexp.MustCompile(`(?i)^\s*(check out|watch|have you seen|i'?m watching|look at|see)\s+`)
	reShareTail = regexp.MustCompile(`(?i)\s+(on|in|at|via)\s+(netflix|prime video|amazon prime video|amazon|jiohotstar|jio hotstar|hotstar|disney\+? hotstar|youtube)\W*$`)
	reShareYear = regexp.MustCompile(`\s*\((\d{4})\)\s*$`)
)

// shareFindURL picks the address out of what was shared: Android often puts it in the
// text ("Watch X on Netflix https://...") and leaves the url field empty.
func shareFindURL(in shareIn) string {
	for _, s := range []string{in.URL, in.Text, in.Title} {
		if m := reShareURL.FindString(strings.TrimSpace(s)); m != "" {
			return strings.TrimRight(m, ".,;:!?)]}")
		}
	}
	return ""
}

// shareService says which of the four services a link belongs to ("" for anything else).
func shareService(u *url.URL) string {
	h := strings.ToLower(u.Hostname())
	is := func(d string) bool { return h == d || strings.HasSuffix(h, "."+d) }
	switch {
	case is("youtube.com") || h == "youtu.be":
		return "youtube"
	case is("netflix.com"):
		return "netflix"
	case is("primevideo.com"):
		return "prime"
	case reAmazon.MatchString(h) && strings.HasPrefix(u.Path, "/gp/video"):
		return "prime"
	case is("hotstar.com") || is("jiohotstar.com"):
		return "jiohotstar"
	}
	return ""
}

// shareCleanTitle turns "Watch Stranger Things on Netflix" into "Stranger Things": the
// address is taken out, a leading verb and a trailing "on <service>" go, a year in
// brackets goes. It is a search string, nothing more.
func shareCleanTitle(s, rawURL string) string {
	s = strings.ReplaceAll(s, rawURL, " ")
	s = reShareURL.ReplaceAllString(s, " ")
	s = strings.Join(strings.Fields(s), " ")
	s = strings.Trim(s, " \t\r\n\"'“”-:|")
	s = reShareLead.ReplaceAllString(s, "")
	s = reShareTail.ReplaceAllString(s, "")
	s = strings.Trim(s, " \t\r\n\"'“”-:|")
	s = reShareYear.ReplaceAllString(s, "")
	if r := []rune(s); len(r) > 200 {
		s = string(r[:200])
	}
	return strings.TrimSpace(s)
}

// shareSlugTitle: JioHotstar's address names the title: /in/shows/gravity-falls/1234.
func shareSlugTitle(u *url.URL) (title, kind string) {
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	for i, p := range parts {
		if (p == "shows" || p == "movies" || p == "tv") && i+1 < len(parts) {
			t := history.SlugTitle(parts[i+1])
			k := "movie"
			if p != "movies" {
				k = "tv"
			}
			return t, k
		}
	}
	return "", ""
}

// Tests replace these two: nothing in a test touches the network.
var (
	shareOembed = func(id string) (title, author string, err error) {
		c := http.Client{Timeout: 8 * time.Second}
		resp, err := c.Get(history.OembedURL(id))
		if err != nil {
			return "", "", err
		}
		defer resp.Body.Close()
		var o struct {
			Title  string `json:"title"`
			Author string `json:"author_name"`
		}
		if resp.StatusCode != 200 || json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&o) != nil || o.Title == "" {
			return "", "", errors.New("oembed: no title")
		}
		return o.Title, o.Author, nil
	}
	// shareFetchTitle reads one service page's own title (og:title, else <title>). Only
	// ever called for a link that shareService accepted; redirects must stay on that service.
	shareFetchTitle = func(raw, svc string) (string, error) {
		c := http.Client{Timeout: 8 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 3 || req.URL.Scheme != "https" || shareService(req.URL) != svc {
				return http.ErrUseLastResponse
			}
			return nil
		}}
		req, _ := http.NewRequest(http.MethodGet, raw, nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36")
		req.Header.Set("Accept-Language", "en-IN,en;q=0.8")
		resp, err := c.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return "", errors.New("page: " + resp.Status)
		}
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 256<<10))
		if m := reOgTitle.FindSubmatch(b); m != nil {
			t := string(m[1])
			if t == "" {
				t = string(m[2])
			}
			return html.UnescapeString(strings.TrimSpace(t)), nil
		}
		if m := reHTMLTitle.FindSubmatch(b); m != nil {
			return html.UnescapeString(strings.TrimSpace(string(m[1]))), nil
		}
		return "", errors.New("page: no title")
	}
)

var errShareLink = errors.New("That is not a web link.")

// libResolveLink saves one shared address and says what it became. dup is true when the
// library already had it (a second share of the same link changes nothing).
func (a *App) libResolveLink(in shareIn, where, source string) (it library.Item, dup bool, err error) {
	st := a.libStore()
	if st == nil {
		return library.Item{}, false, errors.New("The library is not ready.")
	}
	raw := shareFindURL(in)
	u, perr := url.Parse(raw)
	if raw == "" || perr != nil || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.Hostname() == "" || len(raw) > 2048 {
		return library.Item{}, false, errShareLink
	}
	u.Fragment, u.RawFragment = "", ""
	svc := shareService(u)
	phrase := shareCleanTitle(libFirst(in.Text, in.Title), raw)
	if phrase == "" {
		phrase = shareCleanTitle(in.Title, raw)
	}
	rep := library.Report{Type: library.EvSave, Where: where, Source: source}

	switch {
	case svc == "youtube":
		id := libYTID(u.String())
		if id == "" {
			// a channel, a playlist or the home page: not a video, so a plain link
			svc = ""
			break
		}
		title := "YouTube video"
		if t, _, e := shareOembed(id); e == nil {
			title = t
		} else if phrase != "" {
			title = phrase
		}
		rep.ID, rep.Kind, rep.Title, rep.Service = "yt:"+id, "yt", title, "youtube"
		rep.URL = "https://www.youtube.com/watch?v=" + id
		rep.Img = "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"
	case svc != "":
		if u.Scheme != "https" {
			svc = ""
			break
		}
		title, kind := phrase, ""
		if t, k := shareSlugTitle(u); title == "" && t != "" {
			title, kind = t, k
		}
		if title == "" {
			if t, e := shareFetchTitle(u.String(), svc); e == nil {
				title = shareCleanTitle(history.CleanTitle(t), raw)
			}
		}
		if title == "" {
			svc = ""
			break
		}
		if kind == "" {
			_, kind = shareSlugTitle(u)
		}
		m, ok := a.shareMatch(title, kind)
		if !ok {
			// no exact match on TMDB: keep it as a link with the title we have
			rep.ID, rep.Kind, rep.Title, rep.Service = "url:"+shareLinkID(u), "other", title, svc
			rep.URL = u.String()
			break
		}
		key := itemKey(m)
		rep.ID, rep.Kind, rep.Title, rep.Service = key, m.Kind, m.Title, svc
		rep.Aliases = []string{"name:" + normTitle(m.Title)}
		rep.Img = tmdbImgSrc(m)
		rep.URL = u.String()
		m.Service = svc
		a.ld.mu.Lock()
		a.ld.byKey[key], a.ld.extra[key] = m, m
		a.ld.mu.Unlock()
	}
	if rep.ID == "" { // a plain link: stored, never fetched
		title := phrase
		if title == "" {
			title = strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
		}
		u.User = nil
		rep.ID, rep.Kind, rep.Title, rep.Service = "url:"+shareLinkID(u), "other", title, ""
		rep.URL = u.String()
	}
	res := st.Apply(rep)
	// it was already known by name (seen on the TV before): that item takes the TMDB key
	if strings.HasPrefix(res.Item.ID, "name:") && isTmdbKey(rep.ID) {
		st.Rekey(res.Item.ID, rep.ID, library.Patch{Kind: rep.Kind, Title: rep.Title, Img: rep.Img, Services: []string{rep.Service}})
	}
	out, _ := st.Get(rep.ID)
	if res.StateChanged || res.Created {
		a.libChanged()
	}
	log.Printf("library: saved %s (%s) from %s", rep.ID, rep.Kind, source)
	return out, !res.Created && !res.StateChanged, nil
}

// shareLinkID is host+path of a plain link (the identity rule's last resort).
func shareLinkID(u *url.URL) string {
	return strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.") + strings.TrimRight(u.EscapedPath(), "/")
}

// shareMatch finds the exact title on TMDB (kind: tv | movie | "" for either).
func (a *App) shareMatch(title, kind string) (tmdb.Item, bool) {
	if a.ld == nil || a.ld.tm == nil || title == "" {
		return tmdb.Item{}, false
	}
	list, err := a.ld.tm.Find(title)
	if err != nil {
		return tmdb.Item{}, false
	}
	want := normTitle(title)
	var any *tmdb.Item
	for i := range list {
		if normTitle(list[i].Title) != want {
			continue
		}
		if kind == "" || list[i].Kind == kind {
			return list[i], true
		}
		if any == nil {
			any = &list[i]
		}
	}
	if any != nil {
		return *any, true
	}
	return tmdb.Item{}, false
}

// libShare answers the phone's {"t":"save",...}: it works in standby too (the library
// does not need the TV), and tells that one phone what was saved.
func (a *App) libShare(c *client, raw []byte) {
	var in shareIn
	_ = json.Unmarshal(raw, &in)
	a.initLauncherData()
	it, dup, err := a.libResolveLink(in, "phone", "share")
	if err != nil {
		c.queue(map[string]any{"t": "saved", "ok": false, "msg": err.Error()})
		return
	}
	c.queue(map[string]any{"t": "saved", "ok": true, "id": it.ID, "title": it.Title, "kind": it.Kind, "playable": libPlayable(it), "dup": dup})
}

// libPlayWhenUp plays a library item from the phone while the TV is down: the same Start
// TV path as the shortcut, then the item once the session is on.
func (a *App) libPlayWhenUp(id, svc string, se, ep int) {
	a.initLauncherData()
	a.startThenPlay(func() { a.libOpenTV(id, svc, se, ep) })
}
