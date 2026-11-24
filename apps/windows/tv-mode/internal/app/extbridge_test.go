package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExtBridge(t *testing.T) {
	a := &App{o: Options{Test: true}} // Test: never writes the helper marker
	do := func(method, path, origin, body string) int {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		w := httptest.NewRecorder()
		a.extBridge(w, r)
		return w.Code
	}
	extHelloAt.Store(0)
	if do("POST", "/api/ext/hello", "https://evil.example", "") != http.StatusForbidden || ExtensionPresent() {
		t.Fatal("web origin must be refused")
	}
	if do("GET", "/api/ext/hello", "", "") != http.StatusMethodNotAllowed {
		t.Fatal("GET must be refused")
	}
	if do("POST", "/api/ext/hello", "chrome-extension://abc", "{}") != http.StatusNoContent || !ExtensionPresent() {
		t.Fatal("hello from the extension must register")
	}
	if do("POST", "/api/ext/watch", "chrome-extension://abc", "{bad") != http.StatusBadRequest {
		t.Fatal("bad json")
	}
	if do("POST", "/api/ext/watch", "", `{"title":"X","dur":3000,"pos":5,"url":"https://www.netflix.com/watch/1"}`) != http.StatusOK {
		t.Fatal("watch with no ld must answer with an empty command list")
	}
	extHelloAt.Store(0)
}
