// Package tmdb reads The Movie Database for the launcher recommendations.
// The credentials live in %APPDATA%\TVMode\tmdb.json and are read only here;
// they are sent only to api.themoviedb.org (a Bearer header, or an api_key
// query parameter when only a v3 key exists) and are never logged, returned or
// handed to a page.
package tmdb

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// Item is one title for the launcher.
type Item struct {
	ID       int      `json:"id"`
	Kind     string   `json:"kind"` // movie | tv
	Title    string   `json:"title"`
	Year     string   `json:"year"`
	Service  string   `json:"service"` // netflix | prime | jiohotstar
	Poster   string   `json:"poster"`
	Backdrop string   `json:"backdrop"`
	Pop      float64  `json:"pop"`
	Vote     float64  `json:"vote"`
	Votes    int      `json:"votes"`
	Date     string   `json:"date"`
	Overview string   `json:"overview"`
	Genres   []string `json:"genres"`
	GIDs     []int    `json:"gids,omitempty"` // every TMDB genre id (Genres keeps two names for display)
	Lang     string   `json:"lang,omitempty"` // original language, ISO 639-1
}

// Client talks to the API.
type Client struct {
	base   string
	token  string
	apiKey string
	hc     *http.Client
	kwMu   sync.Mutex
	kw     map[string]int // keyword name -> id (0: TMDB has none), kept in kwPath
	kwPath string
}

type creds struct {
	ReadToken string `json:"readToken"`
	APIKey    string `json:"apiKey"`
}

// Load reads the credentials file. Its errors never include the contents.
func Load() (*Client, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(filepath.Join(dir, "TVMode", "tmdb.json"))
	if err != nil {
		return nil, errors.New("tmdb: no credentials file")
	}
	var c creds
	if json.Unmarshal(b, &c) != nil || (c.ReadToken == "" && c.APIKey == "") {
		return nil, errors.New("tmdb: credentials file is not usable")
	}
	cl := &Client{base: "https://api.themoviedb.org/3", token: c.ReadToken, apiKey: c.APIKey, hc: &http.Client{Timeout: 15 * time.Second}}
	if base := os.Getenv("LOCALAPPDATA"); base != "" && !testing.Testing() {
		cl.kwPath = filepath.Join(base, "TVMode", "cache", "keywords.json")
	}
	return cl, nil
}

// NewWithBase builds a client for tests against a fake server.
func NewWithBase(base, token string) *Client {
	return &Client{base: base, token: token, hc: &http.Client{Timeout: 5 * time.Second}}
}

func (c *Client) get(path string, q url.Values, out any) error {
	if c.token == "" && c.apiKey != "" {
		q.Set("api_key", c.apiKey)
	}
	req, err := http.NewRequest("GET", c.base+path+"?"+q.Encode(), nil)
	if err != nil {
		return errors.New("tmdb: bad request")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	req.Header.Set("Accept", "application/json")
	resp, err := c.hc.Do(req)
	if err != nil { // one retry: the network is often not up yet at start
		time.Sleep(700 * time.Millisecond)
		resp, err = c.hc.Do(req)
	}
	if err != nil {
		return errors.New("tmdb: network error") // never wrap err: it can carry the URL
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("tmdb: status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

type discoverResp struct {
	Results []struct {
		ID           int     `json:"id"`
		GenreIDs     []int   `json:"genre_ids"`
		Overview     string  `json:"overview"`
		VoteAverage  float64 `json:"vote_average"`
		VoteCount    int     `json:"vote_count"`
		Title        string  `json:"title"`
		Name         string  `json:"name"`
		ReleaseDate  string  `json:"release_date"`
		FirstAirDate string  `json:"first_air_date"`
		PosterPath   string  `json:"poster_path"`
		BackdropPath string  `json:"backdrop_path"`
		Popularity   float64 `json:"popularity"`
		OrigLang     string  `json:"original_language"`
	} `json:"results"`
}

// Discover lists titles of one kind on a provider (ids joined with |) in a region.
// extra holds the row-specific query (genres, sort, language, dates); a missing
// sort_by means popularity.
func (c *Client) Discover(kind, providers, region, service string, n int, extra url.Values) ([]Item, error) {
	q := url.Values{}
	q.Set("with_watch_providers", providers)
	q.Set("watch_region", region)
	q.Set("sort_by", "popularity.desc")
	q.Set("language", "en-US")
	q.Set("with_watch_monetization_types", "flatrate")
	for k, v := range extra {
		q[k] = v
	}
	var r discoverResp
	if err := c.get("/discover/"+kind, q, &r); err != nil {
		return nil, err
	}
	var out []Item
	for _, x := range r.Results {
		if x.BackdropPath == "" && x.PosterPath == "" {
			continue
		}
		it := Item{ID: x.ID, Kind: kind, Service: service, Poster: x.PosterPath, Backdrop: x.BackdropPath, Pop: x.Popularity, Title: x.Title, Year: year(x.ReleaseDate), Vote: x.VoteAverage, Votes: x.VoteCount, Date: x.ReleaseDate, Overview: x.Overview}
		if kind == "tv" {
			it.Title, it.Year, it.Date = x.Name, year(x.FirstAirDate), x.FirstAirDate
		}
		it.Genres = genreNames(kind, x.GenreIDs)
		it.GIDs, it.Lang = x.GenreIDs, x.OrigLang
		out = append(out, it)
		if len(out) >= n {
			break
		}
	}
	return out, nil
}

func year(d string) string {
	if len(d) >= 4 {
		return d[:4]
	}
	return ""
}

// Trailer returns the YouTube key of the best trailer, or "".
func (c *Client) Trailer(kind string, id int) (string, error) {
	var r struct {
		Results []struct {
			Key      string
			Site     string
			Type     string
			Official bool
		} `json:"results"`
	}
	if err := c.get(fmt.Sprintf("/%s/%d/videos", kind, id), url.Values{"language": {"en-US"}}, &r); err != nil {
		return "", err
	}
	best := ""
	for _, v := range r.Results {
		if v.Site == "YouTube" && v.Type == "Trailer" {
			if v.Official {
				return v.Key, nil
			}
			if best == "" {
				best = v.Key
			}
		}
	}
	return best, nil
}

// Merge combines lists, drops repeats of the same title, sorts (by "pop", "date" or "vote", best first) and keeps n.
func Merge(n int, by string, lists ...[]Item) []Item {
	seen := map[string]bool{}
	var all []Item
	for _, l := range lists {
		for _, it := range l {
			k := fmt.Sprintf("%s%d", it.Kind, it.ID)
			if seen[k] {
				continue
			}
			seen[k] = true
			all = append(all, it)
		}
	}
	sort.SliceStable(all, func(i, j int) bool {
		switch by {
		case "date":
			return all[i].Date > all[j].Date
		case "score":
			return Score(all[i]) > Score(all[j])
		case "vote":
			return all[i].Vote > all[j].Vote
		}
		return all[i].Pop > all[j].Pop
	})
	if len(all) > n {
		all = all[:n]
	}
	return all
}

var movieGenres = map[int]string{28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller", 10752: "War", 37: "Western"}
var tvGenres = map[int]string{10759: "Action", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family", 10762: "Kids", 9648: "Mystery", 10765: "Sci-Fi & Fantasy", 10768: "War", 37: "Western"}

func genreNames(kind string, ids []int) []string {
	m := movieGenres
	if kind == "tv" {
		m = tvGenres
	}
	var out []string
	for _, id := range ids {
		if n, ok := m[id]; ok {
			out = append(out, n)
		}
		if len(out) == 2 {
			break
		}
	}
	return out
}

// Search finds the best movie or tv match for a title.
func (c *Client) Search(title string) (kind string, id int, err error) {
	var r struct {
		Results []struct {
			ID        int    `json:"id"`
			MediaType string `json:"media_type"`
		} `json:"results"`
	}
	if err = c.get("/search/multi", url.Values{"query": {title}, "language": {"en-US"}}, &r); err != nil {
		return
	}
	for _, x := range r.Results {
		if x.MediaType == "movie" || x.MediaType == "tv" {
			return x.MediaType, x.ID, nil
		}
	}
	return "", 0, errors.New("tmdb: no match")
}

// Recommendations lists titles TMDB suggests for one title.
func (c *Client) Recommendations(kind string, id, n int) ([]Item, error) {
	var r discoverResp
	if err := c.get(fmt.Sprintf("/%s/%d/recommendations", kind, id), url.Values{"language": {"en-US"}}, &r); err != nil {
		return nil, err
	}
	var out []Item
	for _, x := range r.Results {
		if x.BackdropPath == "" {
			continue
		}
		it := Item{ID: x.ID, Kind: kind, Poster: x.PosterPath, Backdrop: x.BackdropPath, Pop: x.Popularity, Vote: x.VoteAverage, Votes: x.VoteCount, Title: x.Title, Year: year(x.ReleaseDate), Date: x.ReleaseDate, Overview: x.Overview}
		if kind == "tv" {
			it.Title, it.Year, it.Date = x.Name, year(x.FirstAirDate), x.FirstAirDate
		}
		it.Genres = genreNames(kind, x.GenreIDs)
		it.GIDs, it.Lang = x.GenreIDs, x.OrigLang // taste and the touch rows read these
		out = append(out, it)
		if len(out) >= n {
			break
		}
	}
	return out, nil
}

// SearchItem finds the best match for a title with its images.
func (c *Client) SearchItem(title string) (Item, error) {
	l, err := c.Find(title)
	if err != nil {
		return Item{}, err
	}
	for _, it := range l {
		if it.Backdrop != "" {
			return it, nil
		}
	}
	return Item{}, errors.New("tmdb: no match")
}

// Find lists movies and series matching a name (people and the rest are skipped), best match first.
func (c *Client) Find(query string) ([]Item, error) {
	var r struct {
		Results []struct {
			ID           int     `json:"id"`
			MediaType    string  `json:"media_type"`
			Title        string  `json:"title"`
			Name         string  `json:"name"`
			BackdropPath string  `json:"backdrop_path"`
			PosterPath   string  `json:"poster_path"`
			GenreIDs     []int   `json:"genre_ids"`
			OrigLang     string  `json:"original_language"`
			Overview     string  `json:"overview"`
			VoteAverage  float64 `json:"vote_average"`
			VoteCount    int     `json:"vote_count"`
			ReleaseDate  string  `json:"release_date"`
			FirstAirDate string  `json:"first_air_date"`
			Popularity   float64 `json:"popularity"`
		} `json:"results"`
	}
	if err := c.get("/search/multi", url.Values{"query": {query}, "language": {"en-US"}, "include_adult": {"false"}}, &r); err != nil {
		return nil, err
	}
	var out []Item
	for _, x := range r.Results {
		if x.MediaType != "movie" && x.MediaType != "tv" {
			continue
		}
		it := Item{ID: x.ID, Kind: x.MediaType, Title: x.Title, Backdrop: x.BackdropPath, Poster: x.PosterPath, GIDs: x.GenreIDs, Lang: x.OrigLang,
			Overview: x.Overview, Vote: x.VoteAverage, Votes: x.VoteCount, Date: x.ReleaseDate, Pop: x.Popularity}
		if x.MediaType == "tv" {
			it.Title, it.Date = x.Name, x.FirstAirDate
		}
		it.Year = year(it.Date)
		it.Genres = genreNames(it.Kind, x.GenreIDs)
		out = append(out, it)
	}
	return out, nil
}

// Details is what the launcher shows for one focused title.
type Details struct {
	ID       int      `json:"id"`
	Type     string   `json:"type"`
	Title    string   `json:"title"`
	Tagline  string   `json:"tagline"`
	Overview string   `json:"overview"`
	Rating   float64  `json:"rating"` // vote_average, one decimal
	Votes    int      `json:"votes"`  // vote_count
	Genres   []string `json:"genres"`
	Runtime  int      `json:"runtime,omitempty"` // minutes (movie, or a typical episode)
	Seasons  int      `json:"seasons,omitempty"` // tv
	Cert     string   `json:"cert"`              // India certification, else US
	Episodes int      `json:"episodes,omitempty"`
	LastAir  string   `json:"lastAir,omitempty"` // tv: date of the latest episode
	NextAir  string   `json:"nextAir,omitempty"` // tv: date of the next announced episode
	InProd   bool     `json:"inProd,omitempty"`
	Cast     []string `json:"cast"`     // top 3
	Trailer  string   `json:"trailer"`  // YouTube key
	Services []string `json:"services"` // Dev's services that stream it in India (netflix, prime, jiohotstar)
	Fetched  int64    `json:"fetched"`
}

// providerSvc maps TMDB watch-provider ids to the launcher's services.
var providerSvc = map[int]string{8: "netflix", 1796: "netflix", 119: "prime", 122: "jiohotstar", 2336: "jiohotstar"}

// Details fetches everything in one request (credits, videos, certification appended).
func (c *Client) Details(kind string, id int) (Details, error) {
	if kind != "movie" && kind != "tv" {
		return Details{}, errors.New("tmdb: bad type")
	}
	extra := "credits,videos,release_dates,watch/providers"
	if kind == "tv" {
		extra = "credits,videos,content_ratings,watch/providers"
	}
	var r struct {
		Title       string  `json:"title"`
		Name        string  `json:"name"`
		Tagline     string  `json:"tagline"`
		Overview    string  `json:"overview"`
		VoteAverage float64 `json:"vote_average"`
		VoteCount   int     `json:"vote_count"`
		Runtime     int     `json:"runtime"`
		EpisodeRun  []int   `json:"episode_run_time"`
		Seasons     int     `json:"number_of_seasons"`
		EpisodesN   int     `json:"number_of_episodes"`
		LastAirDate string  `json:"last_air_date"`
		InProd      bool    `json:"in_production"`
		NextEp      *struct {
			AirDate string `json:"air_date"`
		} `json:"next_episode_to_air"`
		Genres  []struct{ Name string }                `json:"genres"`
		Credits struct{ Cast []struct{ Name string } } `json:"credits"`
		Videos  struct {
			Results []struct {
				Key, Site, Type string
				Official        bool
			}
		} `json:"videos"`
		ReleaseDates struct {
			Results []struct {
				Country string                           `json:"iso_3166_1"`
				Dates   []struct{ Certification string } `json:"release_dates"`
			}
		} `json:"release_dates"`
		ContentRatings struct {
			Results []struct {
				Country string `json:"iso_3166_1"`
				Rating  string
			}
		} `json:"content_ratings"`
		Providers struct {
			Results map[string]struct {
				Flatrate []struct {
					ID int `json:"provider_id"`
				} `json:"flatrate"`
			} `json:"results"`
		} `json:"watch/providers"`
	}
	q := url.Values{"language": {"en-US"}, "append_to_response": {extra}}
	if err := c.get(fmt.Sprintf("/%s/%d", kind, id), q, &r); err != nil {
		return Details{}, err
	}
	d := Details{ID: id, Type: kind, Title: r.Title, Tagline: r.Tagline, Overview: r.Overview, Votes: r.VoteCount, Runtime: r.Runtime, Seasons: r.Seasons, Cast: []string{}, Genres: []string{}, Fetched: time.Now().Unix()}
	if kind == "tv" {
		d.Title = r.Name
		if len(r.EpisodeRun) > 0 {
			d.Runtime = r.EpisodeRun[0]
		}
	}
	d.Episodes, d.LastAir, d.InProd = r.EpisodesN, r.LastAirDate, r.InProd
	if r.NextEp != nil {
		d.NextAir = r.NextEp.AirDate
	}
	d.Rating = float64(int(r.VoteAverage*10+0.5)) / 10
	d.Services = []string{}
	for _, p := range r.Providers.Results["IN"].Flatrate {
		if s, ok := providerSvc[p.ID]; ok && !slices.Contains(d.Services, s) {
			d.Services = append(d.Services, s)
		}
	}
	for _, g := range r.Genres {
		d.Genres = append(d.Genres, g.Name)
	}
	for _, p := range r.Credits.Cast {
		d.Cast = append(d.Cast, p.Name)
		if len(d.Cast) == 3 {
			break
		}
	}
	best := ""
	for _, v := range r.Videos.Results {
		if v.Site == "YouTube" && v.Type == "Trailer" {
			if v.Official {
				best = v.Key
				break
			}
			if best == "" {
				best = v.Key
			}
		}
	}
	d.Trailer = best
	certs := map[string]string{}
	for _, x := range r.ReleaseDates.Results {
		for _, dd := range x.Dates {
			if dd.Certification != "" {
				certs[x.Country] = dd.Certification
				break
			}
		}
	}
	for _, x := range r.ContentRatings.Results {
		if x.Rating != "" {
			certs[x.Country] = x.Rating
		}
	}
	d.Cert = certs["IN"]
	if d.Cert == "" {
		d.Cert = certs["US"]
	}
	return d, nil
}

// Score is a Bayesian vote average: a title with few votes is pulled toward the
// average, so 9.0 from 12 votes does not outrank 8.2 from 40,000.
func Score(it Item) float64 {
	const m, c = 300.0, 6.4
	v := float64(it.Votes)
	return v/(v+m)*it.Vote + m/(v+m)*c
}

// SetKeywordCache chooses the file that keeps resolved keyword ids ("" keeps them in memory only).
func (c *Client) SetKeywordCache(path string) {
	c.kwMu.Lock()
	defer c.kwMu.Unlock()
	c.kwPath, c.kw = path, nil
}

func (c *Client) kwLoad() {
	if c.kw != nil {
		return
	}
	c.kw = map[string]int{}
	if c.kwPath != "" {
		if b, err := os.ReadFile(c.kwPath); err == nil {
			_ = json.Unmarshal(b, &c.kw)
		}
	}
}

// KeywordCached says whether Keyword(name) would answer without a request.
func (c *Client) KeywordCached(name string) bool {
	c.kwMu.Lock()
	defer c.kwMu.Unlock()
	c.kwLoad()
	_, ok := c.kw[strings.ToLower(strings.TrimSpace(name))]
	return ok
}

// Keyword resolves a TMDB keyword name to its id (0 and no error when TMDB has
// none). The answer, found or not, is cached in the keyword file for good:
// ids do not change and a name TMDB lacks stays lacking.
func (c *Client) Keyword(name string) (int, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return 0, errors.New("tmdb: empty keyword")
	}
	c.kwMu.Lock()
	c.kwLoad()
	if id, ok := c.kw[name]; ok {
		c.kwMu.Unlock()
		return id, nil
	}
	c.kwMu.Unlock()
	var r struct {
		Results []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		} `json:"results"`
	}
	if err := c.get("/search/keyword", url.Values{"query": {name}}, &r); err != nil {
		return 0, err
	}
	id := 0
	for _, x := range r.Results {
		if strings.EqualFold(x.Name, name) { // the exact name only: "diwali" must not become "diwali party"
			id = x.ID
			break
		}
	}
	c.kwMu.Lock()
	c.kw[name] = id
	var b []byte
	if c.kwPath != "" {
		b, _ = json.Marshal(c.kw)
	}
	p := c.kwPath
	c.kwMu.Unlock()
	if b != nil {
		_ = os.MkdirAll(filepath.Dir(p), 0o700)
		if os.WriteFile(p+".tmp", b, 0o600) == nil {
			_ = os.Rename(p+".tmp", p)
		}
	}
	return id, nil
}
