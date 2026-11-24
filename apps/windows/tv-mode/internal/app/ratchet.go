package app

import (
	"math"
	"time"
)

// ratchet turns Point's gyro angles into d-pad steps on the launcher, where
// there is no pointer to draw. It reads two kinds of movement:
//
//   - a slow turn steps one card per detent, so aiming is exact; the anchor
//     moves by exactly one detent per step, so turning back the same amount
//     returns to the same card and a hand resting on a boundary cannot
//     flicker between two cards;
//   - a flick (a quick wrist snap left or right) travels as far as its speed:
//     when it settles, extra cards are added for every 80 deg/s over the
//     flick threshold, and a second flick the same way soon after travels
//     further. Rows never multiply: a tilt or a flick up/down is always one
//     row, counted afresh from where the hand stops.
//
// Mistakes it absorbs: the wrist's rebound after a flick or a row step (the
// opposite step is swallowed for a moment), drift on the other axis (a step
// forgets it), the jolt of pressing OK (freeze), and repeats (cards at most
// every 90 ms, rows every 350 ms).
type ratchet struct {
	armed  bool
	dh, dv float64 // one card / one row, radians (0 = defaults)
	ax, ay float64 // anchor yaw / pitch, radians
	lastH  time.Time
	lastV  time.Time

	py   float64   // previous yaw, for speed
	pt   time.Time // previous frame time
	pts  float64   // previous phone sensor time, ms (0 = none)
	vel  float64   // smoothed yaw speed, rad/s (+ = right)
	fl   int       // flick in progress: -1 left, +1 right, 0 none
	peak float64   // its top speed, rad/s
	flAx float64   // the anchor when it started
	flN  int       // cards already stepped during it

	lastFlDir int // last flick that settled, and when
	lastFlEnd time.Time
	noH, noV  int // direction whose step is swallowed (rebound), until ...
	noHTill   time.Time
	noVTill   time.Time
	frozen    time.Time // no steps before this (OK was just pressed)
}

const (
	ratchetH    = 5 * math.Pi / 180 // one card, before calibration
	ratchetV    = 9 * math.Pi / 180 // one row, before calibration
	ratchetGapH = 60 * time.Millisecond
	ratchetGapV = 280 * time.Millisecond

	flickOn    = 120 * math.Pi / 180 // rad/s: faster than this is a flick
	flickOff   = 40 * math.Pi / 180  // it settles below this
	flickPer   = 80 * math.Pi / 180  // one more card per this much over flickOn
	flickMax   = 8                   // extra cards from one flick
	flickAgain = 700 * time.Millisecond
	reboundH   = 300 * time.Millisecond
	reboundV   = 450 * time.Millisecond
)

func (r *ratchet) reset() { r.armed, r.fl, r.vel, r.lastFlDir = false, 0, 0, 0 }

// size sets the detents from the calibrated aim gain (px per radian at a
// viewport w px wide), so one card is the angle that would sweep one card
// stride (408 design px) and one row one row stride (308). Calibrate thus
// tunes the home screen too. Clamped so a bad calibration stays usable.
func (r *ratchet) size(gain float64, w int) {
	if gain <= 0 || w <= 0 {
		r.dh, r.dv = 0, 0
		return
	}
	px := float64(w) / 1920
	deg := math.Pi / 180
	// a card is about half the turn that sweeps it on screen (a full sweep, ~9 deg
	// for Dev, felt sticky); a row keeps its sweep so tilts stay deliberate
	r.dh = max(3*deg, min(6*deg, 0.55*408*px/gain))
	r.dv = max(5*deg, min(8*deg, 308*px/gain))
}

func (r *ratchet) det() (h, v float64) {
	h, v = r.dh, r.dv
	if h == 0 {
		h = ratchetH
	}
	if v == 0 {
		v = ratchetV
	}
	return h, v
}

// freeze ignores movement until t (pressing OK jolts the phone), then counts
// from wherever the hand ends up.
func (r *ratchet) freeze(t time.Time) {
	r.frozen = t
	r.armed = false
}

// lean is how far the phone has turned toward the next step, -1..1 on each
// axis (+ = right / up), with a small dead zone so a resting hand is still.
// The launcher leans the focused card by it, so focus follows the hand
// continuously and the step itself is only the last bit of a motion.
func (r *ratchet) lean(yaw, pitch float64) (x, y float64) {
	if !r.armed {
		return 0, 0
	}
	f := func(e float64) float64 {
		e = max(-1, min(1, e))
		if math.Abs(e) < 0.15 {
			return 0
		}
		return math.Round(e*20) / 20
	}
	dh, dv := r.det()
	return f((yaw - r.ax) / dh), f((pitch - r.ay) / dv)
}

func sgn(x float64) int {
	if x < 0 {
		return -1
	}
	return 1
}

func hdir(d int) string {
	if d > 0 {
		return "right"
	}
	return "left"
}

// step takes absolute yaw (+ = right) and pitch (+ = up) since Point was
// pressed and returns a direction ("left", "right", "up", "down" or "") and
// how many steps to take that way. ts is the phone's sensor time in ms (0 if
// it sends none): over the relay frames arrive in bunches, so speed measured
// on arrival would see false flicks.
func (r *ratchet) step(yaw, pitch float64, now time.Time, ts float64) (string, int) {
	if now.Before(r.frozen) {
		return "", 0
	}
	if !r.armed {
		r.armed, r.ax, r.ay, r.py, r.pt, r.pts, r.vel, r.fl = true, yaw, pitch, yaw, now, ts, 0, 0
		return "", 0
	}
	dt := now.Sub(r.pt).Seconds()
	if ts > 0 && r.pts > 0 {
		dt = (ts - r.pts) / 1000
	}
	if dt > 0.004 {
		r.pts = ts
		if dt < 0.2 {
			r.vel = 0.5*r.vel + 0.5*(yaw-r.py)/dt
		} else {
			r.vel = 0 // a gap in frames: no speed to trust
		}
		r.py, r.pt = yaw, now
	}

	// a flick starts, grows, and when it settles adds cards for its force
	extra, exDir := 0, 0
	switch {
	case r.fl == 0 && math.Abs(r.vel) > flickOn:
		r.fl, r.peak, r.flAx, r.flN = sgn(r.vel), math.Abs(r.vel), r.ax, 0
	case r.fl != 0 && sgn(r.vel) == r.fl && math.Abs(r.vel) > r.peak:
		r.peak = math.Abs(r.vel)
	case r.fl != 0 && (math.Abs(r.vel) < flickOff || sgn(r.vel) != r.fl):
		dh, _ := r.det()
		bonus := int((r.peak - flickOn) / flickPer)
		if r.lastFlDir == r.fl && now.Sub(r.lastFlEnd) < flickAgain {
			bonus = bonus*2 + 2 // the second flick the same way: faster
		}
		covered := int(math.Abs(yaw-r.flAx) / dh) // a flick never travels less than its angle
		extra, exDir = max(0, covered-r.flN)+min(bonus, flickMax), r.fl
		r.lastFlDir, r.lastFlEnd = r.fl, now
		r.noH, r.noHTill = -r.fl, now.Add(reboundH)
		r.ax = yaw // the hand comes to rest here: count from it
		r.fl = 0
	}

	dh, dv := r.det()
	ex, ey := (yaw-r.ax)/dh, (pitch-r.ay)/dv
	if math.Abs(ex) >= 1 && math.Abs(ex) >= math.Abs(ey) {
		d := sgn(ex)
		if d == r.noH && now.Before(r.noHTill) { // the wrist bouncing back
			r.ax = yaw
			return "", 0
		}
		if now.Sub(r.lastH) < ratchetGapH {
			return "", 0
		}
		r.lastH, r.ay = now, pitch
		r.ax += float64(d) * dh
		n := 1
		if exDir == d {
			n += extra
		}
		if r.fl == d {
			r.flN++
		}
		return hdir(d), n
	}
	if extra > 0 {
		r.lastH = now
		return hdir(exDir), extra
	}
	if math.Abs(ey) >= 1 && math.Abs(ey) > math.Abs(ex) {
		d := sgn(ey)
		if d == r.noV && now.Before(r.noVTill) {
			r.ay = pitch
			return "", 0
		}
		if now.Sub(r.lastV) < ratchetGapV {
			return "", 0
		}
		r.lastV, r.ax, r.ay = now, yaw, pitch // one row per tilt, however far: count from here
		r.noV, r.noVTill = -d, now.Add(reboundV)
		r.fl = 0
		if d > 0 {
			return "up", 1
		}
		return "down", 1
	}
	return "", 0
}
