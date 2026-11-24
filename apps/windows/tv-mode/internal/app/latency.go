package app

import (
	"log"
	"sort"
	"sync"
	"time"
)

// The phone times its own ping -> pong round trips and reports them in its
// next ping ({"t":"ping","ts":..,"rtt":ms,"path":"direct|relay"}); the PC logs
// the median and 95th percentile per path once a minute.

type latency struct {
	mu sync.Mutex
	by map[string][]float64
}

func (l *latency) add(path string, ms float64) {
	if path != "direct" && path != "relay" {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.by == nil {
		l.by = map[string][]float64{}
	}
	if len(l.by[path]) < 600 {
		l.by[path] = append(l.by[path], ms)
	}
}

// pct returns the p-th percentile (0..1) of xs (sorted in place).
func pct(xs []float64, p float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	sort.Float64s(xs)
	i := int(p * float64(len(xs)-1))
	return xs[i]
}

func (l *latency) flush() {
	l.mu.Lock()
	by := l.by
	l.by = nil
	l.mu.Unlock()
	for path, xs := range by {
		log.Printf("latency %s: n=%d p50=%.0f ms p95=%.0f ms", path, len(xs), pct(xs, 0.5), pct(xs, 0.95))
	}
}

func (l *latency) run(done <-chan struct{}) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-done:
			return
		case <-t.C:
			l.flush()
		}
	}
}
