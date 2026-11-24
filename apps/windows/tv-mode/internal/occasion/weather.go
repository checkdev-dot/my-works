package occasion

import "sync/atomic"

// Weather nodes 52-54 (HUB-DIRECTION 3.7). The engine stays pure: the app hands it
// a reader, and the reader answers from a cache (it never makes the engine wait on
// the network). No location, or an old reading, and the answer is "unknown", which
// leaves the three nodes off.

// Reading is one weather observation.
type Reading struct {
	Code  int     // WMO weather code
	TempC float64 // air temperature, Celsius
	Precp float64 // precipitation in the last hour, mm
	OK    bool    // false: no location, no reading, or too old
}

var weatherSrc atomic.Pointer[func() Reading]

// SetWeather installs the reader the engine asks for weather. nil switches weather off.
func SetWeather(f func() Reading) {
	if f == nil {
		weatherSrc.Store(nil)
		return
	}
	weatherSrc.Store(&f)
}

// weatherViewer fills the viewer's weather from the reader, unless it already has some.
func weatherViewer(v Viewer) Viewer {
	if v.HasWeather {
		return v
	}
	p := weatherSrc.Load()
	if p == nil {
		return v
	}
	r := (*p)()
	if !r.OK {
		return v
	}
	v.HasWeather, v.TempC, v.WeatherCode = true, r.TempC, r.Code
	if r.Precp > 0 && v.WeatherCode < 51 { // rain falling now, whatever the code says
		v.WeatherCode = 61
	}
	return v
}

// LiveWeather lists the weather nodes that are on for this viewer (for the fetch: their
// pools are asked for even outside their season).
func liveWeather(v Viewer) []Node {
	var out []Node
	for _, n := range nodes {
		if n.Kind == "weather" && weatherWeight(n.ID, v) > eps {
			out = append(out, n)
		}
	}
	return out
}
