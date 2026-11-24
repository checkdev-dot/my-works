package app

import (
	"testing"

	"tvmode/internal/winsys"
)

func TestStrayActions(t *testing.T) {
	tv := winsys.Monitor{X: -1920, Y: 76, W: 1920, H: 1080}
	pri := winsys.Monitor{X: 0, Y: 0, W: 2560, H: 1440, Primary: true}
	// onTV fills in a rectangle on the TV and a title unless the test wants none.
	onTV := func(w winsys.Info) winsys.Info {
		if w.R == 0 {
			w.L, w.T, w.R, w.B = -1500, 200, -700, 800
		}
		if w.Title == "" {
			w.Title = "x"
		}
		return w
	}
	chrome := func(title string) winsys.Info {
		return onTV(winsys.Info{HWND: 5, Class: "Chrome_WidgetWin_1", Exe: "chrome.exe", Title: title})
	}
	cases := []struct {
		name string
		w    winsys.Info
		want strayKind // 0 = kept
	}{
		{"netflix duplicate closed", chrome("Netflix - Google Chrome"), strayClose},
		{"prime video closed", chrome("Prime Video"), strayClose},
		{"other chrome tab moved", chrome("Gmail"), strayMove},
		{"notepad moved", onTV(winsys.Info{HWND: 6, Class: "Notepad", Exe: "notepad.exe"}), strayMove},
		{"our chrome kept", onTV(winsys.Info{HWND: 9, Class: "Chrome_WidgetWin_1", Exe: "chrome.exe", Title: "Netflix"}), 0},
		{"edge kept", onTV(winsys.Info{HWND: 7, Class: "Chrome_WidgetWin_1", Exe: "msedge.exe", Title: "TV"}), 0},
		{"own process kept", onTV(winsys.Info{HWND: 8, PID: 42, Exe: "tvmode.exe"}), 0},
		{"minimized kept", onTV(winsys.Info{HWND: 10, Exe: "a.exe", Minimized: true}), 0},
		{"tool kept", onTV(winsys.Info{HWND: 11, Exe: "a.exe", Tool: true}), 0},
		{"cloaked kept", onTV(winsys.Info{HWND: 12, Exe: "a.exe", Cloaked: true}), 0},
		{"untitled kept", winsys.Info{HWND: 13, Exe: "a.exe", L: -1500, T: 200, R: -700, B: 800}, 0},
		{"zero size kept", onTV(winsys.Info{HWND: 14, Exe: "a.exe", L: -1000, T: 300, R: -1000, B: 300}), 0},
		{"taskbar kept", onTV(winsys.Info{HWND: 15, Class: "Shell_SecondaryTrayWnd", Exe: "explorer.exe"}), 0},
		{"on main monitor kept", winsys.Info{HWND: 16, Exe: "a.exe", Title: "x", L: 100, T: 100, R: 900, B: 700}, 0},
	}
	for _, c := range cases {
		got := strayActions([]winsys.Info{c.w}, tv, pri, 9, 42)
		if c.want == 0 {
			if len(got) != 0 {
				t.Errorf("%s: want kept, got %+v", c.name, got)
			}
			continue
		}
		if len(got) != 1 || got[0].Kind != c.want {
			t.Errorf("%s: got %+v", c.name, got)
		}
	}
	// a window as big as the TV lands inside the main monitor, above its taskbar
	big := winsys.Info{HWND: 20, Exe: "a.exe", Title: "x", L: -1920, T: 76, R: 0, B: 1156}
	g := strayActions([]winsys.Info{big}, tv, pri, 0, 42)
	if len(g) != 1 || g[0].X < 0 || g[0].X+g[0].Wd > 2560 || g[0].Y < 0 || g[0].Y+g[0].H > 1440-48 {
		t.Errorf("clamp: %+v", g)
	}
}
