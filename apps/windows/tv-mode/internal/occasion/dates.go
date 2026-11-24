package occasion

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed dates.json
var bundled []byte

type tableFile struct {
	Sources map[string]string            `json:"sources"`
	Dates   map[string]map[string]string `json:"dates"`
}

type entry struct {
	start time.Time
	span  int // days the date lasts (1 = one day)
}

// Calendar knows every date. Layers, first hit wins: Dev's own file, the
// embedded table, fixed and rule dates, the cached public ICS, then (Eid only)
// the tabular Hijri calendar, which can be a day out. A lunar date nobody knows
// is not guessed: the node stays off.
type Calendar struct {
	mu      sync.Mutex
	over    map[string]map[int]entry
	table   map[string]map[int]entry
	ics     map[int]map[string]entry
	sources map[string]string
	warned  map[string]bool
	cache   string // directory holding occasions-<year>.json
}

// NewCalendar builds a calendar from the embedded table; extra JSON (same shape)
// replaces entries and is how tests and Dev's occasions.json override.
func NewCalendar(extra []byte) *Calendar {
	c := &Calendar{over: map[string]map[int]entry{}, table: map[string]map[int]entry{}, ics: map[int]map[string]entry{}, warned: map[string]bool{}}
	var t tableFile
	if err := json.Unmarshal(bundled, &t); err != nil {
		log.Printf("occasion: bundled dates unreadable: %v", err)
	}
	c.sources = t.Sources
	c.load(c.table, t)
	if len(extra) > 0 {
		var o tableFile
		if json.Unmarshal(extra, &o) == nil {
			c.load(c.over, o)
		}
	}
	return c
}

func (c *Calendar) load(dst map[string]map[int]entry, t tableFile) {
	for id, years := range t.Dates {
		for ys, v := range years {
			y, err := strconv.Atoi(ys)
			if err != nil {
				continue
			}
			e, ok := parseEntry(v)
			if !ok {
				continue
			}
			if dst[id] == nil {
				dst[id] = map[int]entry{}
			}
			dst[id][y] = e
		}
	}
}

func parseEntry(v string) (entry, bool) {
	a, b, two := strings.Cut(v, "/")
	s, err := time.ParseInLocation("2006-01-02", a, time.Local)
	if err != nil {
		return entry{}, false
	}
	e := entry{start: s, span: 1}
	if two {
		end, err := time.ParseInLocation("2006-01-02", b, time.Local)
		if err != nil || end.Before(s) {
			return entry{}, false
		}
		e.span = daysBetween(s, end) + 1
	}
	return e, true
}

// Open loads the calendar with Dev's override file and the ICS cache directory.
func Open(overridePath, cacheDir string) *Calendar {
	var extra []byte
	if overridePath != "" {
		extra, _ = os.ReadFile(overridePath)
	}
	c := NewCalendar(extra)
	c.cache = cacheDir
	if cacheDir != "" {
		c.loadICSCache()
	}
	return c
}

// Source says what a year's dates rest on (for logs and the desk preview).
func (c *Calendar) Source(year int) string { return c.sources[strconv.Itoa(year)] }

// Date returns the first day, the number of days it lasts, and whether it is known.
func (c *Calendar) Date(id string, year int) (time.Time, int, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.over[id][year]; ok {
		return e.start, e.span, true
	}
	if e, ok := c.table[id][year]; ok {
		return e.start, e.span, true
	}
	if t, ok := fixedDate(id, year); ok {
		return t, 1, true
	}
	if e, ok := c.ics[year][id]; ok {
		return e.start, e.span, true
	}
	if id == "eid-fitr" || id == "eid-adha" {
		if t, ok := hijriDate(id, year); ok {
			return t, 1, true
		}
	}
	if lunar[id] {
		k := fmt.Sprintf("%s %d", id, year)
		if !c.warned[k] {
			c.warned[k] = true
			log.Printf("occasion: no date for %s %d (table covers 2026-2028)", id, year)
		}
	}
	return time.Time{}, 0, false
}

var lunar = map[string]bool{"diwali": true, "dhanteras": true, "bhai-dooj": true, "holi": true, "navratri": true, "durga-puja": true,
	"dussehra": true, "ganesh": true, "eid-fitr": true, "eid-adha": true, "rakhi": true, "janmashtami": true, "onam": true,
	"karva-chauth": true, "chhath": true, "guru-nanak": true, "mahashivratri": true, "ugadi": true}

func ymd(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, time.Local) }

func nthSunday(y int, m time.Month, n int) time.Time {
	t := ymd(y, m, 1)
	for t.Weekday() != time.Sunday {
		t = t.AddDate(0, 0, 1)
	}
	return t.AddDate(0, 0, 7*(n-1))
}

// fixedDate: Gregorian dates and "nth Sunday" rules, in code.
func fixedDate(id string, y int) (time.Time, bool) {
	switch id {
	case "christmas":
		return ymd(y, 12, 25), true
	case "newyear":
		return ymd(y, 12, 26), true // New Year's week runs 26-31 Dec (Span 6)
	case "valentines":
		return ymd(y, 2, 14), true
	case "halloween":
		return ymd(y, 10, 31), true
	case "republic":
		return ymd(y, 1, 26), true
	case "independence":
		return ymd(y, 8, 15), true
	case "gandhi":
		return ymd(y, 10, 2), true
	case "childrens":
		return ymd(y, 11, 14), true
	case "teachers":
		return ymd(y, 9, 5), true
	case "womens":
		return ymd(y, 3, 8), true
	case "lohri":
		return ymd(y, 1, 13), true
	case "pongal":
		return ymd(y, 1, 14), true
	case "baisakhi":
		return ymd(y, 4, 14), true
	case "mothers":
		return nthSunday(y, time.May, 2), true
	case "fathers":
		return nthSunday(y, time.June, 3), true
	case "friendship":
		return nthSunday(y, time.August, 1), true
	}
	return time.Time{}, false
}

// hijriDate: tabular (civil) Hijri calendar, up to a day out. Last-resort Eid.
func hijriDate(id string, gy int) (time.Time, bool) {
	month, day := 10, 1 // 1 Shawwal
	if id == "eid-adha" {
		month, day = 12, 10
	}
	for hy := gy - 580; hy <= gy-576; hy++ {
		jd := float64(day) + math.Ceil(29.5*float64(month-1)) + float64(hy-1)*354 + math.Floor(float64(3+11*hy)/30) + 1948439.5 - 1
		days := int64(math.Floor(jd-2440587.5 + 0.5)) // days since 1970-01-01
		t := time.Unix(days*86400, 0).UTC()
		if t.Year() == gy {
			return ymd(t.Year(), t.Month(), t.Day()), true
		}
	}
	return time.Time{}, false
}

// SaveOverride is not needed: Dev edits occasions.json by hand.

// cachePath of the ICS-derived dates of a year.
func (c *Calendar) cachePath(year int) string {
	return filepath.Join(c.cache, fmt.Sprintf("occasions-%d.json", year))
}
