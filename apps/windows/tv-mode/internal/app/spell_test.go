package app

import "testing"

func TestSpellingsLikeFindsMadgaon(t *testing.T) {
	l := spellingsLike("Mudgaon Express")
	for i, s := range l {
		if s == "madgaon express" {
			if i >= 4 {
				t.Errorf("madgaon is choice %d, past the four tried", i+1)
			}
			return
		}
	}
	t.Errorf("no madgaon in %v", l)
}
