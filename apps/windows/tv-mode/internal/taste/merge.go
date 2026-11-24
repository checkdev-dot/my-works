package taste

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// MergeFile folds the taste profile at src into the one at dst. A feature's weight is a
// decayed sum, so two copies cannot be added: per feature the one learned from more
// recently (At) wins. The signal count is the larger of the two. It returns how many
// features came from src.
func MergeFile(dst, src string) (int, error) {
	if _, err := os.Stat(src); err != nil {
		return 0, err
	}
	d, s := Open(dst), Open(src)
	n := 0
	for f, w := range s.W {
		if dw, ok := d.W[f]; !ok || w.At > dw.At {
			d.W[f] = w
			n++
		}
	}
	for id, at := range s.Done { // one watch teaches once: keep every id either copy has seen
		if _, ok := d.Done[id]; !ok {
			if d.Done == nil {
				d.Done = map[string]int64{}
			}
			d.Done[id] = at
			n++
		}
	}
	if s.N > d.N {
		d.N = s.N
		n++
	}
	if n == 0 {
		return 0, nil
	}
	b, err := json.Marshal(d)
	if err != nil {
		return 0, err
	}
	_ = os.MkdirAll(filepath.Dir(dst), 0o700)
	tmp := dst + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return 0, err
	}
	return n, os.Rename(tmp, dst)
}
