package edge

import "testing"

func TestOnProfile(t *testing.T) {
	dir := `C:\Users\x\AppData\Local\TVMode\edge-profile`
	ps := []proc{
		{1, `"C:\Edge\msedge.exe" --user-data-dir=C:\Users\x\AppData\Local\TVMode\edge-profile https://netflix.com`},
		{2, `"C:\Edge\msedge.exe" --remote-debugging-port=9333 --user-data-dir=C:\Users\x\AppData\Local\TVMode\edge-profile --app=http://127.0.0.1:8770/`},
		{3, `"C:\Edge\msedge.exe" --user-data-dir="C:\Users\x\AppData\Local\TVMode\edge-profile" --no-first-run`},
		{4, `"C:\Edge\msedge.exe"`},
		{5, `"C:\Edge\msedge.exe" --user-data-dir=C:\other`},
	}
	got := onProfile(ps, dir)
	if len(got) != 2 || got[0].PID != 1 || got[1].PID != 3 {
		t.Fatalf("got %v, want pids 1 and 3", got)
	}
}
