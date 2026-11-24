package certs

import (
	"os"
	"path/filepath"
	"testing"
)

// A lost or broken config.json must come back from the backup with the same pairing,
// or every paired phone is left at "PC off or asleep".
func TestLoadConfigRestoresBackup(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	_ = os.Remove(backupPath())
	first, err := LoadConfig() // fresh start: new pairing, backup written
	if err != nil {
		t.Fatal(err)
	}
	for _, broken := range []string{"", "{not json", "\xef\xbb\xbf{}"} {
		p := filepath.Join(Dir(), "config.json")
		if broken == "" {
			_ = os.Remove(p)
		} else if err := os.WriteFile(p, []byte(broken), 0o600); err != nil {
			t.Fatal(err)
		}
		c, err := LoadConfig()
		if err != nil {
			t.Fatal(err)
		}
		if c.Token != first.Token || c.RelayKey != first.RelayKey {
			t.Errorf("config %q: pairing changed instead of restoring the backup", broken)
		}
	}
}
