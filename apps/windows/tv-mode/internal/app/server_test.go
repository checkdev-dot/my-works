package app

import "testing"

func TestLoopbackHostOK(t *testing.T) {
	for _, h := range []string{"127.0.0.1:8770", "127.0.0.1", "localhost", "localhost:8770", "[::1]:8770", "[::1]"} {
		if !loopbackHostOK(h) {
			t.Errorf("%q should be allowed", h)
		}
	}
	for _, h := range []string{"evil.com", "evil.com:8770", "127.0.0.1.evil.com", "127.0.0.1.evil.com:8770", "", "192.168.1.5:8770"} {
		if loopbackHostOK(h) {
			t.Errorf("%q should be rejected", h)
		}
	}
}
