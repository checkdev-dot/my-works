package edge

import (
	"os"
	"strings"
	"testing"
)

func TestPrimeSourceWritesOut(t *testing.T) {
	_ = os.Chdir("../..")
	s := primeSkipSource()
	if s == "" {
		t.Skip("no prime-skip folder")
	}
	if !strings.Contains(s, "playready") {
		t.Fatal("PlayReady guard missing")
	}
	if p := os.Getenv("PRIME_SRC_OUT"); p != "" {
		_ = os.WriteFile(p, []byte(s), 0o644)
	}
}
