package occasion

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// The January refresh: Google's public "Holidays in India" calendar, no key and
// no account. It is observed data, not instructions: only DTSTART and SUMMARY
// are read, and only for names on the map below.
const IndiaICS = "https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics"

// names maps node ids to lower-case names the ICS may use. A summary matches
// when it equals a name or starts with it followed by a space or bracket.
var names = map[string][]string{
	"diwali":        {"diwali", "deepavali", "diwali/deepavali"},
	"dhanteras":     {"dhanteras"},
	"bhai-dooj":     {"bhai dooj", "bhai duj", "bhaiya dooj"},
	"holi":          {"holi"},
	"navratri":      {"navratri", "navaratri"},
	"durga-puja":    {"durga puja", "maha saptami"},
	"dussehra":      {"dussehra", "vijayadashami", "dasara", "dussehra (maha navami)"},
	"ganesh":        {"ganesh chaturthi", "vinayaka chaturthi"},
	"eid-fitr":      {"eid al-fitr", "eid-ul-fitr", "eid ul-fitr", "ramzan id", "ramadan end"},
	"eid-adha":      {"eid al-adha", "eid-ul-adha", "eid ul-adha", "bakrid", "bakr id"},
	"rakhi":         {"raksha bandhan", "rakhi"},
	"janmashtami":   {"janmashtami", "krishna janmashtami"},
	"onam":          {"onam", "thiruvonam"},
	"pongal":        {"makar sankranti", "pongal", "thai pongal"},
	"lohri":         {"lohri"},
	"guru-nanak":    {"guru nanak", "guru nanak jayanti", "guru nanak's birthday"},
	"mahashivratri": {"maha shivaratri", "mahashivratri", "maha shivratri"},
	"ugadi":         {"ugadi", "gudi padwa"},
	"baisakhi":      {"baisakhi", "vaisakhi"},
	"karva-chauth":  {"karva chauth"},
	"chhath":        {"chhath", "chhath puja"},
}

// MapName returns the node id a holiday summary stands for, or "".
func MapName(summary string) string {
	s := strings.ToLower(strings.TrimSpace(summary))
	for id, list := range names {
		for _, n := range list {
			if s == n || strings.HasPrefix(s, n+" ") || strings.HasPrefix(s, n+"(") || strings.HasPrefix(s, n+"/") {
				return id
			}
		}
	}
	return ""
}

// ICSEvent is one line pair read from the calendar.
type ICSEvent struct {
	Date    time.Time
	Summary string
}

// ParseICS reads DTSTART and SUMMARY of every VEVENT, nothing else.
func ParseICS(r io.Reader) []ICSEvent {
	var out []ICSEvent
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 1<<20)
	var lines []string
	for sc.Scan() { // unfold continuation lines
		l := strings.TrimRight(sc.Text(), "\r")
		if (strings.HasPrefix(l, " ") || strings.HasPrefix(l, "\t")) && len(lines) > 0 {
			lines[len(lines)-1] += l[1:]
			continue
		}
		lines = append(lines, l)
	}
	var d time.Time
	var sum string
	in := false
	for _, l := range lines {
		switch {
		case l == "BEGIN:VEVENT":
			in, d, sum = true, time.Time{}, ""
		case l == "END:VEVENT":
			if in && !d.IsZero() && sum != "" {
				out = append(out, ICSEvent{Date: d, Summary: sum})
			}
			in = false
		case in && strings.HasPrefix(l, "DTSTART"):
			if i := strings.LastIndex(l, ":"); i >= 0 && len(l) >= i+9 {
				if t, err := time.ParseInLocation("20060102", l[i+1:i+9], time.Local); err == nil {
					d = t
				}
			}
		case in && strings.HasPrefix(l, "SUMMARY"):
			if i := strings.Index(l, ":"); i >= 0 {
				sum = strings.NewReplacer(`\,`, ",", `\;`, ";", `\\`, `\`).Replace(l[i+1:])
			}
		}
	}
	return out
}

type icsCache struct {
	Year    int               `json:"year"`
	Fetched int64             `json:"fetched"`
	Dates   map[string]string `json:"dates"`
}

func (c *Calendar) loadICSCache() {
	files, _ := filepath.Glob(filepath.Join(c.cache, "occasions-*.json"))
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var ic icsCache
		if json.Unmarshal(b, &ic) != nil || ic.Year == 0 {
			continue
		}
		m := map[string]entry{}
		for id, v := range ic.Dates {
			if e, ok := parseEntry(v); ok {
				m[id] = e
			}
		}
		c.mu.Lock()
		c.ics[ic.Year] = m
		c.mu.Unlock()
	}
}

// Apply feeds parsed events for a year into the calendar and the cache file,
// and logs where the ICS disagrees with the table (the table wins).
func (c *Calendar) Apply(year int, evs []ICSEvent) int {
	first := map[string]time.Time{}
	for _, e := range evs {
		if e.Date.Year() != year {
			continue
		}
		id := MapName(e.Summary)
		if id == "" {
			continue
		}
		if old, ok := first[id]; !ok || e.Date.Before(old) {
			first[id] = e.Date
		}
	}
	m := map[string]entry{}
	save := icsCache{Year: year, Fetched: time.Now().Unix(), Dates: map[string]string{}}
	for id, d := range first {
		m[id] = entry{start: d, span: 1}
		save.Dates[id] = d.Format("2006-01-02")
		c.mu.Lock()
		t, ok := c.table[id][year]
		c.mu.Unlock()
		if ok && daysBetween(t.start, d) != 0 {
			log.Printf("occasion: ics says %s %s, table says %s", id, d.Format("2006-01-02"), t.start.Format("2006-01-02"))
		}
	}
	c.mu.Lock()
	c.ics[year] = m
	c.mu.Unlock()
	if c.cache != "" && len(m) > 0 {
		_ = os.MkdirAll(c.cache, 0o700)
		if b, err := json.Marshal(save); err == nil {
			p := c.cachePath(year)
			if os.WriteFile(p+".tmp", b, 0o600) == nil {
				_ = os.Rename(p+".tmp", p)
			}
		}
	}
	return len(m)
}

// NeedsRefresh: it is January and this year has no cache yet, or a dated node
// of this year has no date at all.
func (c *Calendar) NeedsRefresh(now time.Time) bool {
	y := now.Year()
	c.mu.Lock()
	_, have := c.ics[y]
	c.mu.Unlock()
	if !have && now.Month() == time.January {
		return true
	}
	for id := range lunar {
		if _, _, ok := c.Date(id, y); !ok {
			return !have
		}
	}
	return false
}

// Refresh fetches the ICS (keyless, 15 s, 2 MB cap) and applies it. Offline or a
// changed feed is not an error the app needs to act on: the table still answers.
func (c *Calendar) Refresh(ctx context.Context, url string, now time.Time) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("occasion: ics fetch failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("occasion: ics status %d", resp.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return err
	}
	evs := ParseICS(bytes.NewReader(b))
	n := 0
	for _, y := range []int{now.Year(), now.Year() + 1} {
		n += c.Apply(y, evs)
	}
	log.Printf("occasion: ics refresh: %d dates", n)
	return nil
}
