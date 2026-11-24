package app

import (
	"fmt"
	"log"
	"sync"
	"time"
)

// openDedupeWindow is how long an identical open request is treated as the same press:
// the launcher and the phone both send openitem, a key repeats, a frame is redelivered.
const openDedupeWindow = 3 * time.Second

var openSeen = struct {
	sync.Mutex
	at map[string]time.Time
}{at: map[string]time.Time{}}

// dupOpen says whether the same open request (keyed by what was asked, not who asked) was
// accepted within openDedupeWindow; if not it records this one. A drop is always logged.
func (a *App) dupOpen(key string) bool {
	k := fmt.Sprintf("%p|%s", a, key)
	now := time.Now()
	openSeen.Lock()
	defer openSeen.Unlock()
	for x, t := range openSeen.at {
		if now.Sub(t) > 30*time.Second {
			delete(openSeen.at, x)
		}
	}
	if t, ok := openSeen.at[k]; ok && now.Sub(t) < openDedupeWindow {
		log.Printf("open: dropped a repeat of %q (%s after the first)", key, now.Sub(t).Round(time.Millisecond))
		return true
	}
	openSeen.at[k] = now
	return false
}
