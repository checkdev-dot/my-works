package app

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// Every frame the phone remote can send must have a handler on the phone path
// (handleRemote), and every media action must be handled both for Edge players
// (media / handleRemote) and for Netflix in Chrome (handleExternal). A handler that
// lands in the launcher's own path (handleScreen) is dropped for the phone: this
// catches that.
func TestPhoneFramesAreHandled(t *testing.T) {
	js, err := os.ReadFile("../../web/remote/remote.js")
	if err != nil {
		t.Skip("remote.js not found")
	}
	app, _ := os.ReadFile("app.go")
	ext, _ := os.ReadFile("ext.go")
	body := func(src, name string) string {
		s := string(src)
		i := strings.Index(s, "\nfunc (a *App) "+name+"(")
		if i < 0 {
			t.Fatalf("no func %s", name)
		}
		j := strings.Index(s[i+1:], "\nfunc ")
		if j < 0 {
			return s[i:]
		}
		return s[i : i+1+j]
	}
	remote := body(string(app), "handleRemote")
	mediaFn := body(string(app), "media")
	external := body(string(ext), "handleExternal")

	transport := map[string]bool{"ping": true, "start": true, "auth": true, "ice": true, "offer": true}
	for _, m := range regexp.MustCompile(`send\(\{ t: "([a-z]+)"`).FindAllStringSubmatch(string(js), -1) {
		k := m[1]
		if transport[k] {
			continue
		}
		if !strings.Contains(remote, `case "`+k+`"`) {
			t.Errorf("phone frame %q has no case in handleRemote", k)
		}
	}
	// media actions: from send({t:"media", a:"x"}) and data-act="media:x"
	acts := map[string]bool{}
	for _, m := range regexp.MustCompile(`t: "media", a: "([a-z]+)"`).FindAllStringSubmatch(string(js), -1) {
		acts[m[1]] = true
	}
	html, _ := os.ReadFile("../../web/remote/index.html")
	for _, m := range regexp.MustCompile(`data-act="media:([a-z]+)`).FindAllStringSubmatch(string(html), -1) {
		acts[m[1]] = true
	}
	if len(acts) < 5 {
		t.Fatalf("found only %v media actions", acts)
	}
	for k := range acts {
		if !strings.Contains(mediaFn, `case "`+k+`"`) && !strings.Contains(remote, `m.A == "`+k+`"`) {
			t.Errorf("media action %q is not handled for Edge players", k)
		}
		if !strings.Contains(external, `case "`+k+`"`) {
			t.Errorf("media action %q is not handled for Netflix in Chrome", k)
		}
	}
}
