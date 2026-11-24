package extapp

import (
	"math"
	"sync"
	"time"

	"tvmode/internal/winsys"
)

// Pointer is the laser pointer for a window with no overlay: it moves the real
// Windows cursor. Same maths as internal/input: target = base + gain x absolute
// angle since Point was pressed, newest sequence wins, the cursor eases to the
// target (exponential, tau 50 ms) and a click first undoes the thumb jolt.
type Pointer struct {
	mon winsys.Monitor

	mu       sync.Mutex
	on       bool
	tx, ty   float64 // target
	cx, cy   float64 // drawn cursor
	baseX    float64
	baseY    float64
	offX     float64
	offY     float64
	lastSeq  int
	lastMove time.Time
	hist     []sample
	quit     chan struct{}
	running  bool
}

type sample struct {
	t    time.Time
	x, y float64
}

const (
	tau  = 50 * time.Millisecond
	jolt = 100 * time.Millisecond
)

func newPointer(mon winsys.Monitor) *Pointer {
	x, y := winsys.CursorPos()
	p := &Pointer{mon: mon, quit: make(chan struct{})}
	p.tx, p.ty, p.cx, p.cy = float64(x), float64(y), float64(x), float64(y)
	return p
}

func (p *Pointer) stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.quit != nil {
		close(p.quit)
		p.quit = nil
	}
}

func (p *Pointer) clamp(x, y float64) (float64, float64) {
	return math.Max(float64(p.mon.X), math.Min(float64(p.mon.X+p.mon.W-1), x)),
		math.Max(float64(p.mon.Y), math.Min(float64(p.mon.Y+p.mon.H-1), y))
}

func (p *Pointer) rebase() { p.baseX, p.baseY = p.tx-p.offX, p.ty-p.offY }

// Point is the clutch: pressed starts from where the cursor is.
func (p *Pointer) Point(on bool) {
	p.mu.Lock()
	if on {
		x, y := winsys.CursorPos()
		p.tx, p.ty, p.cx, p.cy = float64(x), float64(y), float64(x), float64(y)
		p.baseX, p.baseY, p.offX, p.offY, p.lastSeq = p.tx, p.ty, 0, 0, 0
		p.hist = p.hist[:0]
	} else if p.on {
		p.rewind()
	}
	p.on = on
	p.lastMove = time.Now()
	p.mu.Unlock()
	p.ensure()
}

// AimAbs sets the target from absolute angles (radians) with gain px/rad.
func (p *Pointer) AimAbs(seq int, yaw, pitch, gain float64, invYaw, invPitch bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.on || seq <= p.lastSeq {
		return
	}
	p.lastSeq = seq
	if invYaw {
		yaw = -yaw
	}
	if invPitch {
		pitch = -pitch
	}
	p.offX, p.offY = yaw*gain, -pitch*gain
	p.set(p.baseX+p.offX, p.baseY+p.offY)
}

func (p *Pointer) set(x, y float64) {
	p.tx, p.ty = p.clamp(x, y)
	now := time.Now()
	p.lastMove = now
	p.hist = append(p.hist, sample{now, p.tx, p.ty})
	for len(p.hist) > 1 && now.Sub(p.hist[0].t) > 300*time.Millisecond {
		p.hist = p.hist[1:]
	}
}

// Pad moves by a touchpad delta (px).
func (p *Pointer) Pad(dx, dy float64) {
	p.mu.Lock()
	p.set(p.tx+dx, p.ty+dy)
	p.rebase()
	p.mu.Unlock()
	p.ensure()
}

// Recenter puts the cursor in the middle of the monitor.
func (p *Pointer) Recenter() {
	p.mu.Lock()
	p.set(float64(p.mon.X+p.mon.W/2), float64(p.mon.Y+p.mon.H/2))
	p.cx, p.cy = p.tx, p.ty
	p.rebase()
	p.hist = p.hist[:0]
	x, y := int(p.tx), int(p.ty)
	p.mu.Unlock()
	_ = winsys.MouseMoveAbs(x, y)
}

// rewind returns to where the pointer was `jolt` ago. Caller holds mu.
func (p *Pointer) rewind() {
	cut := time.Now().Add(-jolt)
	for i := len(p.hist) - 1; i >= 0; i-- {
		if !p.hist[i].t.After(cut) {
			p.tx, p.ty = p.hist[i].x, p.hist[i].y
			p.cx, p.cy = p.tx, p.ty
			p.hist = p.hist[:i+1]
			p.rebase()
			return
		}
	}
}

func (p *Pointer) beforeClick() {
	p.mu.Lock()
	if p.on {
		p.rewind()
	}
	x, y := int(p.cx), int(p.cy)
	p.mu.Unlock()
	_ = winsys.MouseMoveAbs(x, y)
	time.Sleep(15 * time.Millisecond)
}

func (p *Pointer) ensure() {
	p.mu.Lock()
	start := !p.running && p.quit != nil
	if start {
		p.running = true
	}
	p.mu.Unlock()
	if start {
		go p.loop()
	}
}

// loop eases the cursor toward the target at ~60 Hz while it has somewhere to go.
func (p *Pointer) loop() {
	t := time.NewTicker(16 * time.Millisecond)
	defer t.Stop()
	last := time.Now()
	for {
		p.mu.Lock()
		q := p.quit
		p.mu.Unlock()
		if q == nil {
			return
		}
		select {
		case <-q:
			return
		case now := <-t.C:
			dt := now.Sub(last)
			last = now
			p.mu.Lock()
			a := 1 - math.Exp(-float64(dt)/float64(tau))
			p.cx += (p.tx - p.cx) * a
			p.cy += (p.ty - p.cy) * a
			moving := math.Abs(p.tx-p.cx) > 0.5 || math.Abs(p.ty-p.cy) > 0.5
			if !moving {
				p.cx, p.cy = p.tx, p.ty
			}
			x, y := int(math.Round(p.cx)), int(math.Round(p.cy))
			idle := !p.on && !moving && now.Sub(p.lastMove) > time.Second
			if idle {
				p.running = false
			}
			p.mu.Unlock()
			if moving || p.on {
				_ = winsys.MouseMoveAbs(x, y)
			}
			if idle {
				return
			}
		}
	}
}

// Active says whether OK should click: Point is held or the cursor moved in the last 4 s.
func (p *Pointer) Active() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.on || time.Since(p.lastMove) < 4*time.Second
}

// End leaves pointer mode (a d-pad key means focus navigation now).
// Wake shows the player's buttons: Prime (2026-11-13 probe) only draws its controls,
// subtitles included, after a REAL mouse move, and ignores the page's synthetic ones. The
// cursor makes small moves low in the picture for d, then parks off the picture again
// (unless Point is held). A cursor borrowed from the desk screen is put back where it was.
func (p *Pointer) Wake(d time.Duration) {
	p.mu.Lock()
	m, held := p.mon, p.on
	p.mu.Unlock()
	if held || m.W == 0 {
		return
	}
	sx, sy := winsys.CursorPos()
	onTV := sx >= m.X && sx < m.X+m.W && sy >= m.Y && sy < m.Y+m.H
	x, y := m.X+m.W/2, m.Y+m.H*3/4
	end := time.Now().Add(d)
	for i := 0; time.Now().Before(end); i++ {
		_ = winsys.MouseMoveAbs(x+(i%2)*8, y)
		time.Sleep(300 * time.Millisecond)
	}
	if !onTV {
		_ = winsys.MouseMoveAbs(sx, sy)
		return
	}
	p.End()
}

// The real cursor also leaves the picture (2026-11-12: it sat on Netflix after he went
// back to swiping): parked on the TV's right edge, half way down, where it covers nothing
// and hovers nothing. Only when it is on the TV, so the desk mouse is never taken.
func (p *Pointer) End() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastMove = time.Time{}
	if p.on {
		return
	}
	m := p.mon
	x, y := winsys.CursorPos()
	px, py := m.X+m.W-1, m.Y+m.H/2
	if m.W == 0 || x < m.X || x >= m.X+m.W || y < m.Y || y >= m.Y+m.H || (x == px && y == py) {
		return
	}
	_ = winsys.MouseMoveAbs(px, py)
	p.tx, p.ty, p.cx, p.cy = float64(px), float64(py), float64(px), float64(py)
	p.hist = p.hist[:0]
}
