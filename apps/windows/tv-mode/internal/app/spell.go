package app

import "strings"

// spellingsLike lists other ways the same sounds are often written in Indian and
// English titles (u/a, oo/u, ee/i, w/v, doubled letters), most likely first. Used only
// when a search finds nothing.
func spellingsLike(q string) []string {
	q = strings.ToLower(strings.TrimSpace(q))
	seen := map[string]bool{q: true}
	var out []string
	add := func(s string) {
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	swaps := [][2]string{{"u", "a"}, {"a", "u"}, {"oo", "u"}, {"u", "oo"}, {"ee", "i"}, {"i", "ee"}, {"w", "v"}, {"v", "w"}, {"aa", "a"}, {"ph", "f"}, {"f", "ph"}}
	for _, sw := range swaps { // one swap at a time, each place separately
		for i := 0; i+len(sw[0]) <= len(q); i++ {
			if q[i:i+len(sw[0])] == sw[0] {
				add(q[:i] + sw[1] + q[i+len(sw[0]):])
			}
		}
	}
	// doubled letters made single ("bhaag" -> "bhag", "mirzapurr" -> "mirzapur")
	var b strings.Builder
	for i := 0; i < len(q); i++ {
		if i > 0 && q[i] == q[i-1] && q[i] != ' ' {
			continue
		}
		b.WriteByte(q[i])
	}
	add(b.String())
	return out
}
