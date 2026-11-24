package app

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"tvmode/internal/certs"
)

// The probe: the helper's Prime code was written without the signed-in player's markup, so
// the helper posts snapshots of the player area (buttons, ad and subtitle classes, videos) to
// /api/ext/probe, and TV Mode adds its own lines about what it opened. One JSON line each,
// appended to %APPDATA%\TVMode\prime-probe.jsonl; past ~2 MB the file starts afresh.
// Nothing here holds cookies, storage or account names (the helper sends none).

const probeMax = 2 << 20

var probeMu sync.Mutex

// probePath is the probe file; tests point it at a temp folder.
var probePath = func() string { return filepath.Join(certs.Dir(), "prime-probe.jsonl") }

// probeWrite appends one line (a JSON object) to the probe file.
func probeWrite(m map[string]any) {
	m["at"] = time.Now().Format(time.RFC3339Nano)
	b, err := json.Marshal(m)
	if err != nil {
		return
	}
	probeMu.Lock()
	defer probeMu.Unlock()
	p := probePath()
	flag := os.O_APPEND | os.O_CREATE | os.O_WRONLY
	if st, err := os.Stat(p); err == nil && st.Size()+int64(len(b)) > probeMax {
		flag = os.O_TRUNC | os.O_CREATE | os.O_WRONLY // too big: start fresh
	}
	f, err := os.OpenFile(p, flag, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(b, '\n'))
}

// probeFromHelper reads one helper snapshot (a JSON object) and appends it.
func (a *App) probeFromHelper(body io.Reader) error {
	raw, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	var m map[string]any
	if err := json.NewDecoder(bytes.NewReader(raw)).Decode(&m); err != nil || m == nil {
		return io.ErrUnexpectedEOF
	}
	m["src"] = "helper"
	probeWrite(m)
	return nil
}

// probeNote is TV Mode's own line (what it opened, what the phone asked for).
func probeNote(ev string, kv map[string]any) {
	if kv == nil {
		kv = map[string]any{}
	}
	kv["src"], kv["ev"] = "pc", ev
	probeWrite(kv)
}
