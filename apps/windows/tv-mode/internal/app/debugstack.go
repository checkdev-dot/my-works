package app

import "net/http"

// debugStack writes every goroutine's stack to stack.log beside the log, so a hang
// (the phone going dead with TV Mode still up, 2026-11-04) can be read without
// restarting. Loopback only; it returns nothing but the file's path.
func (a *App) debugStack(w http.ResponseWriter, r *http.Request) {
	if !deskLoopback(r) {
		http.Error(w, "loopback only", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost || r.Header.Get("X-TVMode") != "stack" {
		http.Error(w, "POST with X-TVMode: stack", http.StatusMethodNotAllowed)
		return
	}
	p := dumpStacks("asked for")
	w.Write([]byte(p + "\n"))
}
