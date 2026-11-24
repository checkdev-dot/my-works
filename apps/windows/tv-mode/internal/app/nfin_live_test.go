package app

import (
	"os"
	"testing"
)

func TestNFInIndiaLive(t *testing.T) {
	if os.Getenv("TVMODE_SCOUT_LIVE") == "" {
		t.Skip()
	}
	for _, id := range []string{"70136120", "80098735", "99999991"} {
		ok, sure := nfInIndia(id)
		t.Logf("%s ok=%v sure=%v", id, ok, sure)
	}
}
