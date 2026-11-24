package app

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"tvmode/internal/tmdb"
)

// Netflix runs in Dev's own Chrome, where TV Mode cannot drive the page without the
// extension. It does not need to: Netflix's public title page (no sign-in) carries
// every season's episodes with their own ids, and /watch/<episode id> plays that
// episode in his signed-in Chrome. The show's Netflix id comes from Wikidata, which
// records it against the TMDB id (P1874 Netflix ID; P4983 TMDB TV, P4947 TMDB film).

var nfHTTP = &http.Client{Timeout: 12 * time.Second}

const nfUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"

var reNFID = regexp.MustCompile(`^\d{5,10}$`)

// nfShowID is the title's Netflix id: the link book's, else Wikidata's.
func (a *App) nfShowID(it tmdb.Item) string {
	if u := a.linkGet(linkKey("netflix", it.Title, 0, 0)); u != "" {
		if m := regexp.MustCompile(`/(?:title|watch)/(\d+)`).FindStringSubmatch(u); m != nil {
			return m[1]
		}
	}
	prop := "P4983"
	if it.Kind == "movie" {
		prop = "P4947"
	}
	q := fmt.Sprintf(`SELECT ?n WHERE { ?i wdt:%s "%d" . ?i wdt:P1874 ?n } LIMIT 3`, prop, it.ID)
	req, _ := http.NewRequest("GET", "https://query.wikidata.org/sparql?query="+url.QueryEscape(q), nil)
	req.Header.Set("Accept", "application/sparql-results+json")
	req.Header.Set("User-Agent", "TVMode/1.0 (personal TV launcher)")
	r, err := nfHTTP.Do(req)
	if err != nil {
		log.Printf("netflix: wikidata: %v", err)
		return ""
	}
	defer r.Body.Close()
	var out struct {
		Results struct {
			Bindings []struct {
				N struct {
					Value string `json:"value"`
				} `json:"n"`
			} `json:"bindings"`
		} `json:"results"`
	}
	if json.NewDecoder(r.Body).Decode(&out) != nil {
		return ""
	}
	for _, b := range out.Results.Bindings {
		if reNFID.MatchString(b.N.Value) {
			a.linkPut(linkKey("netflix", it.Title, 0, 0), "https://www.netflix.com/title/"+b.N.Value)
			return b.N.Value
		}
	}
	log.Printf("netflix: no Netflix id on Wikidata for %s %d", it.Kind, it.ID)
	return ""
}

var (
	reNFSeason = regexp.MustCompile(`"__typename":"Season","episodes"`)
	reNFEp     = regexp.MustCompile(`"__typename":"Episode","videoId":(\d+),"number":(\d+)`)
	reNFMore   = regexp.MustCompile(`"hasNextPage":true`)
	// each season block ends with its own label: Netflix lists some shows newest first
	reNFLabel = regexp.MustCompile(`"shortTitle":"Season(?:\\x20| )(\d+)"`)
)

// nfInIndia asks Netflix India's public page for the title: ok when it is there,
// sure when Netflix answered clearly (a 404 or a move away from the title).
func nfInIndia(id string) (ok, sure bool) {
	req, _ := http.NewRequest("GET", "https://www.netflix.com/in/title/"+id, nil)
	req.Header.Set("User-Agent", nfUA)
	req.Header.Set("Accept-Language", "en-IN,en;q=0.9")
	c := *nfHTTP
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	r, err := c.Do(req)
	if err != nil {
		return false, false
	}
	r.Body.Close()
	switch {
	case r.StatusCode == 200:
		return true, true
	case r.StatusCode == 404, r.StatusCode >= 300 && r.StatusCode < 400 && !strings.Contains(r.Header.Get("Location"), id):
		return false, true
	}
	return false, false
}

// nfEpisodes reads a show's public page into season -> episode -> watch id. The page
// lists ten episodes a season; a longer season whose ten ids run one after another is
// counted on (Netflix numbers a season's episodes that way), up to maxEp.
func nfEpisodes(showID string, wantSe, maxEp int) (map[int]map[int]string, error) {
	req, _ := http.NewRequest("GET", "https://www.netflix.com/in/title/"+showID, nil)
	req.Header.Set("User-Agent", nfUA)
	req.Header.Set("Accept-Language", "en-IN,en;q=0.9")
	r, err := nfHTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	b, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	h := string(b)
	idx := reNFSeason.FindAllStringIndex(h, -1)
	out := map[int]map[int]string{}
	type block struct {
		label int
		first int
		eps   map[int]string
		more  bool
	}
	var blocks []block
	for i, at := range idx {
		end := len(h)
		if i+1 < len(idx) {
			end = idx[i+1][0]
		}
		seg := h[at[0]:end]
		eps := map[int]string{}
		var nums []int
		for _, m := range reNFEp.FindAllStringSubmatch(seg, -1) {
			n, _ := strconv.Atoi(m[2])
			if _, dup := eps[n]; !dup {
				eps[n] = m[1]
				nums = append(nums, n)
			}
		}
		if len(eps) == 0 {
			continue
		}
		b := block{eps: eps, more: reNFMore.MatchString(seg)}
		if m := reNFLabel.FindStringSubmatch(seg); m != nil {
			b.label, _ = strconv.Atoi(m[1])
		}
		b.first, _ = strconv.Atoi(eps[nums[0]])
		blocks = append(blocks, b)
	}
	// season numbers: the labels when every block has a different one, else the order of
	// the ids (a later season's episodes have higher ids)
	labelled := len(blocks) > 0
	seenL := map[int]bool{}
	for _, b := range blocks {
		if b.label <= 0 || seenL[b.label] {
			labelled = false
		}
		seenL[b.label] = true
	}
	if !labelled {
		sort.Slice(blocks, func(i, j int) bool { return blocks[i].first < blocks[j].first })
	}
	for i, b := range blocks {
		eps := b.eps
		se := i + 1
		if labelled {
			se = b.label
		}
		if b.more && se == wantSe && maxEp > len(eps) {
			seq := true // 1..10 present, ids consecutive
			first, _ := strconv.Atoi(eps[1])
			for k := 1; k <= len(eps) && seq; k++ {
				v, err := strconv.Atoi(eps[k])
				seq = err == nil && v == first+k-1
			}
			if seq {
				for k := len(eps) + 1; k <= maxEp; k++ {
					eps[k] = strconv.Itoa(first + k - 1)
				}
			}
		}
		out[se] = eps
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no episodes on the page")
	}
	return out, nil
}

// netflixDirect finds the Netflix address that plays this title (the episode's own
// for a series), or "" when it cannot tell.
func (a *App) netflixDirect(it tmdb.Item, se, ep int) string {
	id := a.nfShowID(it)
	if id == "" {
		return ""
	}
	if ok, sure := nfInIndia(id); sure && !ok {
		go a.lacks("netflix", it, se, ep, "not on Netflix India")
		return ""
	} else if ok {
		a.availPut("netflix", itemKey(it), true, "on Netflix India")
	}
	if it.Kind != "tv" || se == 0 {
		return "https://www.netflix.com/watch/" + id // a film, or the show where Netflix left it
	}
	maxEp := ep
	if l, err := a.seasonEps(it.ID, se); err == nil && len(l) > maxEp {
		maxEp = len(l)
	}
	all, err := nfEpisodes(id, se, maxEp)
	if err != nil {
		log.Printf("netflix: %s episodes: %v", it.Title, err)
		return "https://www.netflix.com/watch/" + id
	}
	for s, eps := range all {
		for e, v := range eps {
			a.linkPut(linkKey("netflix", it.Title, s, e), "https://www.netflix.com/watch/"+v)
		}
	}
	if v := all[se][ep]; v != "" {
		return "https://www.netflix.com/watch/" + v
	}
	log.Printf("netflix: %s has no S%d E%d on its page", it.Title, se, ep)
	return "https://www.netflix.com/watch/" + id
}
