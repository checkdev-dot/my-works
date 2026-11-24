package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

// Chrome refuses to load an unpacked extension whose files are not clean UTF-8, and a
// failed reload drops TV Mode Helper from chrome://extensions without a word. Seen
// 2026-11-12: a literal U+FFFF in a regex in core.js. Keep every helper file clean.
func TestHelperFilesAreCleanUTF8(t *testing.T) {
	dir := filepath.Join("..", "..", "extensions", "netflix-dpad")
	n := 0
	err := filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		ext := strings.ToLower(filepath.Ext(p))
		if ext != ".js" && ext != ".json" && ext != ".html" && ext != ".css" {
			return nil
		}
		n++
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		if !utf8.Valid(b) {
			t.Errorf("%s is not valid UTF-8", p)
			return nil
		}
		for i, r := range string(b) {
			if r == 0xFEFF || r == 0xFFFD || r == 0 || (r >= 0xFDD0 && r <= 0xFDEF) || r&0xFFFE == 0xFFFE {
				t.Errorf("%s: character U+%04X at byte %d; Chrome will not load it (write it as an escape)", p, r, i)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if n == 0 {
		t.Fatal("no helper files found")
	}
}
