package app

// Phase 5, weather (HUB-DIRECTION nodes 52-54: rain, heat, cold). Off until Dev gives
// the desk a city. The city and its coordinates live in
// %LOCALAPPDATA%\TVMode\cache\weather.json (never config.json; the path goes through
// recCachePath, which is guarded by testing.Testing()). The forecast comes from
// Open-Meteo (no key), at most hourly, from a cache, and an outage or an old reading
// just turns the three nodes off.

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode"

	"tvmode/internal/occasion"
)

const (
	wxEvery    = time.Hour        // a fresh reading is kept this long
	wxRetry    = 30 * time.Minute // after a failed try
	wxStaleAge = 3 * time.Hour    // older than this and the weather is unknown
)

type d5Loc struct {
	Query string  `json:"query"` // what Dev typed
	Name  string  `json:"name"`  // what the geocoder found: "Mumbai, Maharashtra, India"
	Lat   float64 `json:"lat"`
	Lon   float64 `json:"lon"`
}

type d5Wx struct {
	Code  int     `json:"code"`
	TempC float64 `json:"temp"`
	Precp float64 `json:"precip"`
	At    int64   `json:"at"` // unix seconds of the reading
}

type d5WxFile struct {
	Loc *d5Loc `json:"loc,omitempty"`
	Now *d5Wx  `json:"now,omitempty"`
}

// d5State is the phase-5 memory of the process: weather and mood. One App per process.
var d5 struct {
	mu       sync.Mutex
	app      *App // the App the state was loaded for
	loc      *d5Loc
	wx       *d5Wx
	nextTry  time.Time
	fetching bool
	mood     string
	moodAt   time.Time
}

// d5Get fetches an address (a variable so tests never touch the network).
var d5Get = func(u string) ([]byte, error) {
	if testing.Testing() {
		return nil, errors.New("no network in tests")
	}
	hc := &http.Client{Timeout: 8 * time.Second}
	resp, err := hc.Get(u)
	if err != nil {
		return nil, errors.New("could not reach the weather service")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("the weather service answered %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

// d5Reset forgets everything (tests).
func d5Reset() {
	d5.mu.Lock()
	d5.app, d5.loc, d5.wx, d5.mood = nil, nil, nil, ""
	d5.nextTry, d5.fetching, d5.moodAt = time.Time{}, false, time.Time{}
	d5.mu.Unlock()
}

// d5WeatherPath is the cache file ("" in smoke mode: memory only).
func (a *App) d5WeatherPath() string {
	if a.testRows() {
		return ""
	}
	return filepath.Join(filepath.Dir(a.recCachePath()), "weather.json")
}

// d5Init loads the saved city once and hands the engine its weather reader. rowsFrame
// calls it first; it is cheap after the first time.
func (a *App) d5Init() {
	d5.mu.Lock()
	if d5.app == a {
		d5.mu.Unlock()
		return
	}
	d5.app, d5.loc, d5.wx, d5.mood = a, nil, nil, "" // a new App starts clean (only tests make a second one)
	if p := a.d5WeatherPath(); p != "" {
		if b, err := os.ReadFile(p); err == nil {
			var f d5WxFile
			if json.Unmarshal(b, &f) == nil && f.Loc != nil && validLatLon(f.Loc.Lat, f.Loc.Lon) {
				d5.loc, d5.wx = f.Loc, f.Now
			}
		}
	}
	d5.mu.Unlock()
	occasion.SetWeather(a.d5WeatherRead)
}

func validLatLon(lat, lon float64) bool {
	return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && (lat != 0 || lon != 0)
}

func (a *App) d5WeatherSave() {
	p := a.d5WeatherPath()
	if p == "" {
		return
	}
	d5.mu.Lock()
	b, err := json.Marshal(d5WxFile{Loc: d5.loc, Now: d5.wx})
	d5.mu.Unlock()
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0o700)
	if os.WriteFile(p+".tmp", b, 0o600) == nil {
		_ = os.Rename(p+".tmp", p)
	}
}

// d5WeatherRead is what the occasion engine asks. It answers from the cache and, when
// the reading is an hour old, starts one fetch in the background.
func (a *App) d5WeatherRead() occasion.Reading {
	d5.mu.Lock()
	defer d5.mu.Unlock()
	if d5.loc == nil {
		return occasion.Reading{}
	}
	age := time.Duration(1 << 62)
	if d5.wx != nil {
		age = time.Since(time.Unix(d5.wx.At, 0))
	}
	if age >= wxEvery && !d5.fetching && !time.Now().Before(d5.nextTry) && !testing.Testing() && !a.testRows() {
		d5.fetching = true
		go a.d5WeatherFetch()
	}
	if d5.wx == nil || age > wxStaleAge || age < -time.Minute {
		return occasion.Reading{}
	}
	return occasion.Reading{Code: d5.wx.Code, TempC: d5.wx.TempC, Precp: d5.wx.Precp, OK: true}
}

// wxClass is which weather node a reading would switch on ("" none).
func wxClass(r occasion.Reading) string {
	switch {
	case !r.OK:
		return ""
	case (r.Code >= 51 && r.Code <= 99) || r.Precp > 0:
		return "rain"
	case r.TempC >= 35:
		return "heat"
	case r.TempC <= 12:
		return "cold"
	}
	return ""
}

// d5WeatherFetch asks Open-Meteo for the current weather of the saved city.
func (a *App) d5WeatherFetch() {
	d5.mu.Lock()
	loc := d5.loc
	d5.mu.Unlock()
	done := func(ok bool) {
		d5.mu.Lock()
		d5.fetching = false
		if ok {
			d5.nextTry = time.Now().Add(wxEvery)
		} else {
			d5.nextTry = time.Now().Add(wxRetry)
		}
		d5.mu.Unlock()
	}
	if loc == nil {
		done(true)
		return
	}
	before := a.d5Class()
	wx, err := d5ForecastNow(loc.Lat, loc.Lon)
	if err != nil {
		log.Printf("weather: %v (kept the old reading)", err)
		done(false)
		return
	}
	d5.mu.Lock()
	if d5.loc == loc { // the city was not changed meanwhile
		d5.wx = &wx
	}
	d5.mu.Unlock()
	a.d5WeatherSave()
	done(true)
	if after := a.d5Class(); after != before {
		log.Printf("weather: now %q (was %q)", after, before)
		if a.hub != nil && a.ld != nil {
			a.pushRows()
		}
	}
}

func (a *App) d5Class() string {
	d5.mu.Lock()
	defer d5.mu.Unlock()
	if d5.loc == nil || d5.wx == nil || time.Since(time.Unix(d5.wx.At, 0)) > wxStaleAge {
		return ""
	}
	return wxClass(occasion.Reading{Code: d5.wx.Code, TempC: d5.wx.TempC, Precp: d5.wx.Precp, OK: true})
}

func d5ForecastNow(lat, lon float64) (d5Wx, error) {
	u := fmt.Sprintf("https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=temperature_2m,precipitation,weather_code&timezone=auto", lat, lon)
	b, err := d5Get(u)
	if err != nil {
		return d5Wx{}, err
	}
	var r struct {
		Current *struct {
			Temp   *float64 `json:"temperature_2m"`
			Precip float64  `json:"precipitation"`
			Code   int      `json:"weather_code"`
		} `json:"current"`
	}
	if json.Unmarshal(b, &r) != nil || r.Current == nil || r.Current.Temp == nil {
		return d5Wx{}, errors.New("the weather service sent something unexpected")
	}
	return d5Wx{Code: r.Current.Code, TempC: *r.Current.Temp, Precp: r.Current.Precip, At: time.Now().Unix()}, nil
}

// d5Geocode finds a place by name (Open-Meteo's free geocoding API, no key).
func d5Geocode(q string) (d5Loc, error) {
	u := "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" + url.QueryEscape(q)
	b, err := d5Get(u)
	if err != nil {
		return d5Loc{}, err
	}
	var r struct {
		Results []struct {
			Name    string  `json:"name"`
			Admin1  string  `json:"admin1"`
			Country string  `json:"country"`
			Lat     float64 `json:"latitude"`
			Lon     float64 `json:"longitude"`
		} `json:"results"`
	}
	if json.Unmarshal(b, &r) != nil {
		return d5Loc{}, errors.New("the place finder sent something unexpected")
	}
	if len(r.Results) == 0 || !validLatLon(r.Results[0].Lat, r.Results[0].Lon) {
		return d5Loc{}, errors.New("I could not find that place. Try the city name alone.")
	}
	g := r.Results[0]
	var parts []string
	for _, p := range []string{g.Name, g.Admin1, g.Country} {
		if p != "" && (len(parts) == 0 || parts[len(parts)-1] != p) {
			parts = append(parts, p)
		}
	}
	return d5Loc{Query: q, Name: strings.Join(parts, ", "), Lat: g.Lat, Lon: g.Lon}, nil
}

// cleanCity keeps a city name to letters, digits, spaces and a few marks.
func cleanCity(s string) (string, bool) {
	s = strings.Join(strings.Fields(s), " ")
	if len([]rune(s)) < 2 || len([]rune(s)) > 60 {
		return "", false
	}
	for _, r := range s {
		if !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' || r == '-' || r == '\'' || r == '.' || r == ',') {
			return "", false
		}
	}
	return s, true
}

var wxWords = []struct {
	to   int
	word string
}{{0, "Clear"}, {3, "Cloudy"}, {48, "Fog"}, {57, "Drizzle"}, {67, "Rain"}, {77, "Snow"}, {82, "Showers"}, {86, "Snow showers"}, {99, "Thunderstorm"}}

func wxWord(code int) string {
	for _, w := range wxWords {
		if code <= w.to {
			return w.word
		}
	}
	return ""
}

// GET /api/desk/city: where the weather is read, and what it is now.
// POST /api/desk/city {city}: look the city up and keep it; an empty city switches weather off.
func (a *App) deskCity(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if !deskGate(w, r, http.MethodPost) || !a.deskData(w) {
			return
		}
		var q struct {
			City string `json:"city"`
		}
		if !deskDecode(w, r, &q) {
			return
		}
		a.d5Init()
		if strings.TrimSpace(q.City) == "" {
			d5.mu.Lock()
			d5.loc, d5.wx, d5.nextTry = nil, nil, time.Time{}
			d5.mu.Unlock()
			a.d5WeatherSave()
			if a.ld != nil {
				go a.pushRows()
			}
			log.Printf("weather: city removed, weather nodes off")
			deskJSON(w, a.d5CityStatus())
			return
		}
		city, ok := cleanCity(q.City)
		if !ok {
			deskErr(w, http.StatusBadRequest, "Use just the city name, letters only.")
			return
		}
		loc, err := d5Geocode(city)
		if err != nil {
			deskErr(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		wx, werr := d5ForecastNow(loc.Lat, loc.Lon)
		d5.mu.Lock()
		d5.loc, d5.wx, d5.nextTry = &loc, nil, time.Time{}
		if werr == nil {
			d5.wx, d5.nextTry = &wx, time.Now().Add(wxEvery)
		}
		d5.mu.Unlock()
		a.d5WeatherSave()
		if a.ld != nil {
			go a.pushRows()
		}
		log.Printf("weather: city set to %s, weather nodes on", loc.Name) // a place name, not a secret; no coordinates logged
		deskJSON(w, a.d5CityStatus())
		return
	}
	if !deskGate(w, r, http.MethodGet) || !a.deskData(w) {
		return
	}
	a.d5Init()
	deskJSON(w, a.d5CityStatus())
}

// d5CityStatus is what the desk shows under "Your city". The coordinates stay in the file.
func (a *App) d5CityStatus() map[string]any {
	d5.mu.Lock()
	defer d5.mu.Unlock()
	out := map[string]any{"ok": true, "set": d5.loc != nil}
	if d5.loc == nil {
		return out
	}
	out["name"] = d5.loc.Name
	if d5.wx != nil && time.Since(time.Unix(d5.wx.At, 0)) <= wxStaleAge {
		r := occasion.Reading{Code: d5.wx.Code, TempC: d5.wx.TempC, Precp: d5.wx.Precp, OK: true}
		out["now"] = map[string]any{"temp": int(d5.wx.TempC + 0.5*sign(d5.wx.TempC)), "word": wxWord(d5.wx.Code), "class": wxClass(r)}
	}
	return out
}

func sign(f float64) float64 {
	if f < 0 {
		return -1
	}
	return 1
}
