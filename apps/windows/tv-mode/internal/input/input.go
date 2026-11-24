// Package input turns remote messages into CDP key, mouse and text events.
package input

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/chromedp/cdproto/input"
	"github.com/chromedp/cdproto/runtime"

	"tvmode/internal/services"
)

// Page is what input needs from the browser manager.
type Page interface {
	Do(fn func(ctx context.Context) error) error
	// DoWithin is Do with a short limit, for the 60 Hz pointer pump: a busy
	// page drops that frame instead of stalling the pump.
	DoWithin(d time.Duration, fn func(ctx context.Context) error) error
	Eval(expr string, out any) error
	Viewport() (int, int)
}

// Config tunes pointer motion.
type Config struct {
	AimGain   float64 // px per radian
	PadGain   float64 // px per phone CSS px
	InvertYaw bool
	InvertPit bool
}

// Tunables for the Hold-to-Point extras.
const (
	HoverEvery    = 120 * time.Millisecond // at most one hover tick this often
	FlingDecay    = 0.94                   // velocity kept per 16 ms tick
	FlingStop     = 30.0                   // px/s below which a fling ends
	FlingMax      = 6000.0                 // px/s cap
	pointerPushTO = 400 * time.Millisecond
	MouseEvery    = 66 * time.Millisecond // real mouse-move events go out at ~15 Hz while the pointer is shown
)

// Controller keeps the pointer position in Go and mirrors it to the page.
type Controller struct {
	pg  Page
	cfg Config

	// NoMouse (bisect): never send mouse-move events for the drawn pointer.
	NoMouse bool

	// OnHover is called (from the pump) when the pointer enters a new target.
	OnHover func()

	mu      sync.Mutex
	x, y    float64
	vw, vh  int
	visible bool
	dirty   bool
	lastUse time.Time
	pointOn bool
	hidden  bool     // launcher: the pointer drives tile focus and is not drawn
	hist    []sample // recent positions, for undoing the jolt of a thumb press

	lastHover time.Time // last hover tick sent
	flingV    float64   // momentum scroll, px/s (+ = page down)
	lastTick  time.Time

	// Laser pointer: the phone sends absolute angles since Point was pressed.
	// target = base + gain x angle. base is where the pointer was at press;
	// it is shifted whenever the position is set by something else
	// (re-centre, jolt rewind, touchpad) so the next frame continues from there.
	baseX, baseY float64
	offX, offY   float64 // last gain x angle (px), the part of the position that comes from the angle
	lastSeq      int
	lastMouse    time.Time
	mouseForce   bool // send one mouse move now (Point released)
	mousePend    bool // a mouse move was held back by the 15 Hz limit
}

type sample struct {
	t    time.Time
	x, y float64
}

const (
	histKeep = 300 * time.Millisecond
	jolt     = 100 * time.Millisecond // a thumb press or release twists the phone for about this long
)

// New starts the 60 Hz pointer pump; it stops when ctx ends.
func New(ctx context.Context, pg Page, cfg Config) *Controller {
	c := &Controller{pg: pg, cfg: cfg, vw: 1920, vh: 1080}
	c.x, c.y = 960, 540
	go c.pump(ctx)
	return c
}

// RefreshViewport re-reads the page size (call after navigation).
//
// It does not mark the pointer dirty unless something really changed: a
// redraw every few seconds sent a synthetic mouse move to the page each time,
// which made the sites show their mouse-driven controls ("the mouse appears")
// while nobody was pointing. A tiny reading (a popup, a page still loading) is
// ignored so it cannot squash the pointer into a corner.
func (c *Controller) RefreshViewport() {
	w, h := c.pg.Viewport()
	if w < 320 || h < 240 {
		return
	}
	c.mu.Lock()
	nx, ny := clamp(c.x, 0, float64(w-1)), clamp(c.y, 0, float64(h-1))
	if w != c.vw || h != c.vh || nx != c.x || ny != c.y {
		c.dirty = true
	}
	c.vw, c.vh = w, h
	c.x, c.y = nx, ny
	c.mu.Unlock()
}

// Recenter puts the pointer in the middle of the screen and shows it.
func (c *Controller) Recenter() {
	c.RefreshViewport()
	c.mu.Lock()
	c.x, c.y = float64(c.vw)/2, float64(c.vh)/2
	c.rebase()
	c.visible, c.lastUse, c.dirty, c.mouseForce = true, time.Now(), true, true
	c.hist = c.hist[:0]
	c.mu.Unlock()
}

func clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }

// Pos returns the pointer position.
func (c *Controller) Pos() (float64, float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.x, c.y
}

func (c *Controller) pump(ctx context.Context) {
	t := time.NewTicker(16 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		c.mu.Lock()
		now := time.Now()
		// auto-hide the drawn pointer 4 s after the last movement unless Point is held
		if c.visible && !c.pointOn && !c.lastUse.IsZero() && now.Sub(c.lastUse) > 4*time.Second {
			c.visible, c.dirty = false, true
		}

		// fling momentum
		var wx, wy float64
		if c.flingV != 0 {
			dt := 0.016
			if !c.lastTick.IsZero() {
				dt = math.Min(0.05, now.Sub(c.lastTick).Seconds())
			}
			wy += c.flingV * dt
			c.flingV *= FlingDecay
			if math.Abs(c.flingV) < FlingStop {
				c.flingV = 0
			}
		}
		c.lastTick = now

		if !c.dirty && wx == 0 && wy == 0 && !(c.mousePend && now.Sub(c.lastMouse) >= MouseEvery) {
			c.mu.Unlock()
			continue
		}
		c.dirty = false
		x, y, vis := c.x, c.y, c.visible && !c.hidden
		sendMouse := false
		if vis && !c.NoMouse {
			if c.mouseForce || now.Sub(c.lastMouse) >= MouseEvery {
				sendMouse = true
				c.lastMouse, c.mouseForce, c.mousePend = now, false, false
			} else {
				c.mousePend = true
			}
		}
		c.mu.Unlock()
		if wx != 0 || wy != 0 {
			_ = c.pg.DoWithin(pointerPushTO, func(ctx context.Context) error {
				return input.DispatchMouseEvent(input.MouseWheel, x, y).WithDeltaX(wx).WithDeltaY(wy).Do(ctx)
			})
		}
		c.push(x, y, vis, sendMouse)
	}
}

// push mirrors the pointer to the page in one round trip: a real mouse move
// (only while the pointer is drawn, so an idle pointer never wakes the page's
// mouse UI) and the overlay's drawing call, which answers whether the pointer
// is over a clickable target and whether it just entered a new one.
func (c *Controller) push(x, y float64, vis, mouse bool) {
	expr := fmt.Sprintf("window.__tv&&window.__tv.pointer?window.__tv.pointer(%.1f,%.1f,%t):null", x, y, vis)
	var val []byte
	err := c.pg.DoWithin(pointerPushTO, func(ctx context.Context) error {
		if mouse {
			_ = input.DispatchMouseEvent(input.MouseMoved, x, y).Do(ctx)
		}
		res, _, err := runtime.Evaluate(expr).WithReturnByValue(true).Do(ctx)
		if err == nil && res != nil {
			val = res.Value
		}
		return err
	})
	if err != nil {
		return
	}
	var r struct {
		H int `json:"h"`
		E int `json:"e"`
	}
	_ = json.Unmarshal(val, &r)
	c.mu.Lock()
	tick := false
	if vis && r.E == 1 && time.Since(c.lastHover) >= HoverEvery {
		c.lastHover = time.Now()
		tick = true
	}
	cb := c.OnHover
	c.mu.Unlock()
	if tick && cb != nil {
		cb()
	}
}

// Point sets the clutch state; pressing shows the pointer, releasing leaves
// it frozen in place until it idles out.
func (c *Controller) Point(on bool) {
	c.mu.Lock()
	if !on && c.pointOn {
		c.rewind(jolt)
	}
	c.pointOn = on
	if on {
		c.visible = true
		c.hist = c.hist[:0]
		c.flingV = 0
		c.baseX, c.baseY, c.offX, c.offY, c.lastSeq = c.x, c.y, 0, 0, 0 // angles are measured from here
	} else {
		c.mouseForce = true // one last real mouse move at the final spot
	}
	c.lastUse = time.Now()
	c.dirty = true
	c.mu.Unlock()
}

// Fling starts momentum scrolling at v px/s (+ = page down).
func (c *Controller) Fling(v float64) {
	c.mu.Lock()
	c.flingV = clamp(v, -FlingMax, FlingMax)
	c.lastTick = time.Now()
	c.mu.Unlock()
}

// rewind moves the pointer back to where it was d ago. Caller holds mu.
func (c *Controller) rewind(d time.Duration) {
	defer c.rebase()
	cut := time.Now().Add(-d)
	for i := len(c.hist) - 1; i >= 0; i-- {
		if !c.hist[i].t.After(cut) {
			c.x, c.y = c.hist[i].x, c.hist[i].y
			c.hist = c.hist[:i+1]
			return
		}
	}
	if len(c.hist) > 0 { // all samples are newer than d: go to the oldest
		c.x, c.y = c.hist[0].x, c.hist[0].y
		c.hist = c.hist[:1]
	}
}

// rebase makes the next absolute angle continue from the current position. Caller holds mu.
func (c *Controller) rebase() { c.baseX, c.baseY = c.x-c.offX, c.y-c.offY }

// Active says whether OK should click at the pointer: Point is held, or the
// drawn pointer moved recently and is still on screen.
func (c *Controller) Active() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return !c.hidden && c.visible && (c.pointOn || time.Since(c.lastUse) < 4*time.Second)
}

// EndPointer ends pointer mode: a d-pad key or Back means the user is
// navigating by focus now, so OK must not click the stale pointer spot. The
// next aim, pad move, tap or Point brings the pointer back.
func (c *Controller) EndPointer() {
	c.mu.Lock()
	if c.visible {
		c.visible, c.dirty = false, true
	}
	c.flingV = 0
	c.mu.Unlock()
}

// SetHidden stops drawing the pointer (the launcher uses it for tile focus).
func (c *Controller) SetHidden(h bool) {
	c.mu.Lock()
	if c.hidden != h {
		c.hidden, c.dirty = h, true
	}
	c.mu.Unlock()
}

// SetAim changes the aim gain and yaw direction (after calibration).
func (c *Controller) SetAim(gain float64, invertYaw bool) {
	c.mu.Lock()
	c.cfg.AimGain, c.cfg.InvertYaw = gain, invertYaw
	c.mu.Unlock()
}

// Frac returns the pointer x as a fraction of the viewport width.
func (c *Controller) Frac() float64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.x / float64(c.vw)
}

// Aim applies yaw/pitch deltas (radians) as pointer motion.
func (c *Controller) Aim(yaw, pitch float64) {
	c.mu.Lock()
	cfg := c.cfg
	c.mu.Unlock()
	if cfg.InvertYaw {
		yaw = -yaw
	}
	if cfg.InvertPit {
		pitch = -pitch
	}
	c.move(yaw*cfg.AimGain, -pitch*cfg.AimGain) // yaw + = right, pitch + = up
}

// AimAbs is the laser pointer: yaw/pitch are absolute angles (radians) since
// Point was pressed, seq counts frames from 1 for that press. The target is
// base + gain x angle; a frame older than the newest seen is ignored, and so
// is any frame after Point was released.
func (c *Controller) AimAbs(seq int, yaw, pitch float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.pointOn || seq <= c.lastSeq {
		return
	}
	c.lastSeq = seq
	if c.cfg.InvertYaw {
		yaw = -yaw
	}
	if c.cfg.InvertPit {
		pitch = -pitch
	}
	g := c.cfg.AimGain
	c.offX, c.offY = yaw*g, -pitch*g // yaw + = right, pitch + = up
	c.setPos(c.baseX+c.offX, c.baseY+c.offY)
}

// Pad applies a touchpad delta in phone CSS px.
func (c *Controller) Pad(dx, dy float64) {
	c.move(dx*c.cfg.PadGain, dy*c.cfg.PadGain)
}

func (c *Controller) move(dx, dy float64) {
	c.mu.Lock()
	c.setPos(c.x+dx, c.y+dy)
	c.rebase()
	c.mu.Unlock()
}

// setPos moves the pointer (clamped to the screen) and records it. Caller holds mu.
func (c *Controller) setPos(nx, ny float64) {
	c.x = clamp(nx, 0, float64(c.vw-1))
	c.y = clamp(ny, 0, float64(c.vh-1))
	c.visible = true
	now := time.Now()
	c.lastUse = now
	c.dirty = true
	c.flingV = 0
	c.hist = append(c.hist, sample{now, c.x, c.y})
	if n := len(c.hist); n > 64 || (n > 1 && now.Sub(c.hist[0].t) > histKeep) {
		i := 0
		for i < n-1 && (n-i > 64 || now.Sub(c.hist[i].t) > histKeep) {
			i++
		}
		c.hist = append(c.hist[:0], c.hist[i:]...)
	}
}

// Tap clicks at the pointer. While Point is held, it first undoes the jolt
// of the thumb pressing OK.
func (c *Controller) Tap(button string) error {
	c.mu.Lock()
	if c.pointOn {
		c.rewind(jolt)
	}
	x, y := c.x, c.y
	c.visible, c.lastUse, c.dirty = true, time.Now(), true
	c.flingV = 0
	c.mu.Unlock()
	return c.click(button, x, y)
}

// TapAt clicks at a given spot (the spatial-nav ring's target) without
// touching the pointer.
func (c *Controller) TapAt(x, y float64) error { return c.click("left", x, y) }

func (c *Controller) click(button string, x, y float64) error {
	b := input.Left
	if button == "right" {
		b = input.Right
	}
	return c.pg.Do(func(ctx context.Context) error {
		if err := input.DispatchMouseEvent(input.MouseMoved, x, y).Do(ctx); err != nil {
			return err
		}
		if err := input.DispatchMouseEvent(input.MousePressed, x, y).WithButton(b).WithClickCount(1).Do(ctx); err != nil {
			return err
		}
		return input.DispatchMouseEvent(input.MouseReleased, x, y).WithButton(b).WithClickCount(1).Do(ctx)
	})
}

// Scroll sends a wheel event at the pointer.
func (c *Controller) Scroll(dy float64) error {
	x, y := c.Pos()
	c.mu.Lock()
	c.flingV = 0
	c.mu.Unlock()
	return c.pg.Do(func(ctx context.Context) error {
		return input.DispatchMouseEvent(input.MouseWheel, x, y).WithDeltaX(0).WithDeltaY(dy).Do(ctx)
	})
}

// Keys presses a sequence of keys.
func (c *Controller) Keys(ks []services.Key) error {
	return c.pg.Do(func(ctx context.Context) error {
		for _, k := range ks {
			if err := pressKey(ctx, k); err != nil {
				return err
			}
		}
		return nil
	})
}

func pressKey(ctx context.Context, k services.Key) error {
	down := input.DispatchKeyEvent(input.KeyRawDown).WithKey(k.Key).WithCode(k.Code).
		WithWindowsVirtualKeyCode(k.VK).WithNativeVirtualKeyCode(k.VK).WithModifiers(input.Modifier(k.Mods))
	if k.Text != "" {
		down = input.DispatchKeyEvent(input.KeyDown).WithKey(k.Key).WithCode(k.Code).
			WithWindowsVirtualKeyCode(k.VK).WithNativeVirtualKeyCode(k.VK).WithModifiers(input.Modifier(k.Mods)).WithText(k.Text)
	}
	if err := down.Do(ctx); err != nil {
		return err
	}
	return input.DispatchKeyEvent(input.KeyUp).WithKey(k.Key).WithCode(k.Code).
		WithWindowsVirtualKeyCode(k.VK).WithNativeVirtualKeyCode(k.VK).WithModifiers(input.Modifier(k.Mods)).Do(ctx)
}

// Text inserts typed text into the focused field.
func (c *Controller) Text(s string) error {
	return c.pg.Do(func(ctx context.Context) error { return input.InsertText(s).Do(ctx) })
}
