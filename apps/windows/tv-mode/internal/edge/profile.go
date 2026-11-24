package edge

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// ErrProfileBusy means another Edge is running on TV Mode's profile without the
// debug port and would not close. Starting Edge now would hand the launch over
// to it (no page target, or the launcher opening as a normal tab).
var ErrProfileBusy = errors.New("edge: another Edge window is using TV Mode's profile")

type proc struct {
	PID  int    `json:"ProcessId"`
	Line string `json:"CommandLine"`
}

func hidden(c *exec.Cmd) *exec.Cmd {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return c
}

// listEdge returns the main msedge processes (no --type=) of any profile.
func listEdge() ([]proc, error) {
	ps := `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`
	out, err := hidden(exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", ps)).Output()
	if err != nil {
		return nil, err
	}
	out = []byte(strings.TrimSpace(string(out)))
	if len(out) == 0 {
		return nil, nil
	}
	var all []proc
	if out[0] == '{' { // one process: PowerShell prints an object, not an array
		var p proc
		if err := json.Unmarshal(out, &p); err != nil {
			return nil, err
		}
		all = []proc{p}
	} else if err := json.Unmarshal(out, &all); err != nil {
		return nil, err
	}
	var mains []proc
	for _, p := range all {
		if !strings.Contains(p.Line, "--type=") {
			mains = append(mains, p)
		}
	}
	return mains, nil
}

// onProfile picks the main processes that use dir as --user-data-dir and have
// no remote debugging port.
func onProfile(ps []proc, dir string) []proc {
	want := strings.ToLower(filepath.Clean(dir))
	var out []proc
	for _, p := range ps {
		l := strings.ToLower(p.Line)
		if strings.Contains(l, "--remote-debugging-port") {
			continue
		}
		i := strings.Index(l, "--user-data-dir=")
		if i < 0 {
			continue
		}
		v := l[i+len("--user-data-dir="):]
		if strings.HasPrefix(v, `"`) {
			v = v[1:]
			if j := strings.Index(v, `"`); j >= 0 {
				v = v[:j]
			}
		} else if j := strings.Index(v, " "); j >= 0 {
			v = v[:j]
		}
		if filepath.Clean(strings.TrimSpace(v)) == want {
			out = append(out, p)
		}
	}
	return out
}

// freeProfile asks a plain Edge on this profile to close normally (taskkill
// without /F posts WM_CLOSE, so cookies are saved), waits up to 10 s, and
// returns ErrProfileBusy when it is still there.
func (m *Manager) freeProfile() error {
	find := func() []proc {
		ps, err := listEdge()
		if err != nil {
			log.Printf("edge: process list: %v", err)
			return nil
		}
		return onProfile(ps, m.o.ProfileDir)
	}
	busy := find()
	if len(busy) == 0 {
		return nil
	}
	for _, p := range busy {
		log.Printf("edge: another Edge (pid %d) is on TV Mode's profile without the debug port; asking it to close", p.PID)
		_ = hidden(exec.Command("taskkill", "/PID", fmt.Sprint(p.PID))).Run()
	}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(500 * time.Millisecond)
		if len(find()) == 0 {
			time.Sleep(700 * time.Millisecond) // let it release the profile lock
			return nil
		}
	}
	return ErrProfileBusy
}
