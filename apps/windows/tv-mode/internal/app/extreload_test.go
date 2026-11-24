package app

import "testing"

func TestVerLess(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want bool
	}{{"2.1.0", "2.2.0", true}, {"2.2.0", "2.2.0", false}, {"2.10.0", "2.9.0", false}, {"2.1", "2.1.1", true}} {
		if got := verLess(c.a, c.b); got != c.want {
			t.Errorf("verLess(%s,%s)=%v", c.a, c.b, got)
		}
	}
}
