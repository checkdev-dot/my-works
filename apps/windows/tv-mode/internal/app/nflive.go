package app

import (
	"log"
	"sync"
	"time"
)

// Live Netflix playback from the helper extension (extensions/netflix-dpad). TV Mode
// cannot see into Dev's Chrome, so while a Netflix video is up the helper reports its
// time about twice a second, and takes back any player commands queued for it in the
// reply (seek, scrub, play/pause, subtitles, skip). Without the helper none of this
// runs and Netflix falls back to key presses.

const (
	nfLiveFresh = 3 * time.Second // a report older than this means the player is gone
	nfCmdTTL    = 2 * time.Second // a command not collected by then is dropped, never run late
)

// nfCmd is one player command for the helper. Ms is the absolute target for "seekto".
type nfCmd struct {
	A    string `json:"a"` // seekto, seekby, playpause, subs, skip
	Ms   int64  `json:"ms,omitempty"`
	Kind string `json:"kind,omitempty"` // settrack: audio or subs
	ID   string `json:"id,omitempty"`   // settrack: the track
	at   time.Time
}

type nfLive struct {
	mu      sync.Mutex
	m       Media
	at      time.Time
	cmds    []nfCmd
	lastErr string
	hist    time.Time // last history note, so the history file is not written twice a second
	ad      bool      // the helper says an ad shows on the player (Prime, JioHotstar)
	cov     float64   // the share of the window the main video covers, as last reported (0: not known)
	covAt   time.Time
	toggle  time.Time // the last playpause sent to a helper, so a repeat a moment later is dropped
	playAt  time.Time // the last play / playpause sent to a Prime or JioHotstar helper
	fbDone  bool      // the real-key fallback for that press has been used
}

// set stores a Netflix report; it says whether what the remote shows changed.
func (l *nfLive) set(m Media, now time.Time) bool { return l.setAs("netflix", m, now) }

// setAs is set for the service svc (the log line names it).
func (l *nfLive) setAs(svc string, m Media, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	stale := now.Sub(l.at) > nfLiveFresh
	if stale {
		log.Printf("%s helper: live (pos %d of %d)", svc, m.Pos, m.Dur)
	}
	ch := stale || l.m.Playing != m.Playing || l.m.Dur != m.Dur || abs(l.m.Pos-m.Pos) >= 1 || l.m.Ad != m.Ad || l.m.Rate != m.Rate
	l.m, l.at = m, now
	return ch
}

// get returns the live media when it is fresh.
func (l *nfLive) get(now time.Time) (Media, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.at.IsZero() || now.Sub(l.at) > nfLiveFresh {
		return Media{}, false
	}
	return l.m, true
}

// push queues a command; it fails (so the caller uses keys) when the helper isn't live.
func (l *nfLive) push(c nfCmd, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.at.IsZero() || now.Sub(l.at) > nfLiveFresh {
		return false
	}
	c.at = now
	if c.A == "tracks" { // a read already waiting for the helper answers this one too
		for _, o := range l.cmds {
			if o.A == "tracks" {
				return true
			}
		}
	}
	if c.A == "tracks" || c.A == "settrack" || c.A == "speed" {
		l.lastErr = "" // a failure of this request is news even when it says the same as last time
	}
	// a newer seek replaces one not yet collected: only where he let go matters
	if c.A == "seekto" || c.A == "seekby" {
		keep := l.cmds[:0]
		for _, o := range l.cmds {
			if o.A != "seekto" && o.A != "seekby" {
				keep = append(keep, o)
			} else if c.A == "seekby" && o.A == "seekby" {
				c.Ms += o.Ms
			}
		}
		l.cmds = keep
	}
	l.cmds = append(l.cmds, c)
	return true
}

// take hands the helper every command still in date.
func (l *nfLive) take(now time.Time) []nfCmd {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := []nfCmd{}
	for _, c := range l.cmds {
		if now.Sub(c.at) <= nfCmdTTL {
			out = append(out, c)
		}
	}
	l.cmds = nil
	return out
}

// noteDue says whether the history should be written for this report (every 5 s).
func (l *nfLive) noteDue(now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.Sub(l.hist) < 5*time.Second {
		return false
	}
	l.hist = now
	return true
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// errChanged says whether this helper error is new (so the log gets it once).
func (l *nfLive) errChanged(e string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if e == l.lastErr {
		return false
	}
	l.lastErr = e
	return true
}

// touch keeps the helper live without changing what it last reported (an ad is on:
// its time is not the episode's, but commands such as Skip must still get through).
func (l *nfLive) touch(now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.at = now // also during a pre-roll, before any show report: the helper is live
}

// setAdMedia keeps the show's last position and length, marks the media as an ad and
// takes Playing from the ad's own video. It keeps the helper live like touch, and says
// whether what the remote shows changed. A pre-roll (no show report yet) marks it live too, with Dur 0.
func (l *nfLive) setAdMedia(playing bool, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	ch := !l.m.Ad || l.m.Playing != playing
	l.m.Ad, l.m.Playing, l.m.Rate, l.at = true, playing, 0, now
	return ch
}

// reset forgets the last live report and queued commands (a different Chrome window
// is opening, whose reports start afresh).
func (l *nfLive) reset() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.m, l.at, l.cmds, l.lastErr = Media{}, time.Time{}, nil, ""
	l.ad, l.cov, l.covAt = false, 0, time.Time{}
}

// setAd stores the helper's ad flag and says whether it changed (the caller logs it).
func (l *nfLive) setAd(ad bool) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	ch := l.ad != ad
	l.ad = ad
	return ch
}

// adNow says whether an ad shows on the player as of the last fresh report.
func (l *nfLive) adNow(now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.ad && !l.at.IsZero() && now.Sub(l.at) <= nfLiveFresh
}

func (l *nfLive) setCov(c float64, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if c > 0 {
		l.cov, l.covAt = c, now
	}
}

// coverage is the last reported share of the window the video covers; ok is false when
// the helper has not said (an older helper) or the report is stale.
func (l *nfLive) coverage(now time.Time) (float64, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.covAt.IsZero() || now.Sub(l.covAt) > nfLiveFresh {
		return 0, false
	}
	return l.cov, true
}

// notePlay records that a play (or playpause) went to the helper now, so one failure of it may fall back to a real key.
func (l *nfLive) notePlay(now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.playAt, l.fbDone = now, false
}

// playFallbackDue says whether a play failure reported by the helper may be answered with a real key now:
// once per press, and only within 8 s of it.
func (l *nfLive) playFallbackDue(now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.fbDone || l.playAt.IsZero() || now.Sub(l.playAt) > 8*time.Second {
		return false
	}
	l.fbDone = true
	return true
}

// repeatToggle says whether a playpause already went out within gap (the phone's presses came
// in pairs a second apart on Prime, 2026-11-13, and the second one undid the first). It notes now.
func (l *nfLive) repeatToggle(now time.Time, gap time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	rep := !l.toggle.IsZero() && now.Sub(l.toggle) < gap
	if !rep {
		l.toggle = now
	}
	return rep
}
