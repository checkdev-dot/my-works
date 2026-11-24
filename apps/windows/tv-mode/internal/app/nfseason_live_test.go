package app

import (
	"os"
	"testing"
)

// Black Mirror's page lists seasons newest first; Rick and Morty's oldest first.
func TestNFSeasonsLive(t *testing.T) {
	if os.Getenv("TVMODE_SCOUT_LIVE") == "" {
		t.Skip()
	}
	bm, err := nfEpisodes("70264888", 1, 3)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("black mirror S1E1=%s S1E2=%s S7E1=%s", bm[1][1], bm[1][2], bm[7][1])
	if bm[1][1] != "70264857" {
		t.Errorf("S1E1 should be The National Anthem (70264857), got %s", bm[1][1])
	}
	if bm[7][1] != "81716301" {
		t.Errorf("S7E1 should be Common People (81716301), got %s", bm[7][1])
	}
}
