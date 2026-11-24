package app

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"tvmode/internal/certs"
	"tvmode/internal/history"
	"tvmode/internal/library"
	"tvmode/internal/taste"
)

// MigratePackageData folds the data of a TV Mode that ran inside the Claude desktop
// app's MSIX package into the real folders. (2026-11-12: a process started from Claude
// has its %APPDATA%\TVMode writes redirected to
// %LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\TVMode, so it grew its own pairing,
// history and library.) Run once at startup by the real, unpackaged process; it never
// deletes: both Roaming folders are copied to backup-<time> first, and the package
// folder is only renamed at the end. Failures are logged and never stop the start.
func MigratePackageData() {
	local := os.Getenv("LOCALAPPDATA")
	if local == "" {
		return
	}
	srcs, _ := filepath.Glob(filepath.Join(local, "Packages", "Claude_*", "LocalCache", "Roaming", "TVMode"))
	for _, src := range srcs {
		pkgLocal := filepath.Join(filepath.Dir(filepath.Dir(src)), "Local", "TVMode")
		if line, err := migrateFrom(src, pkgLocal, certs.Dir(), filepath.Join(local, "TVMode"), time.Now()); err != nil {
			log.Printf("migrate: %s: %v", src, err)
		} else if line != "" {
			log.Print(line)
		}
	}
}

// migrateFrom does the work for one package: srcRoam/srcLocal are the package TVMode
// folders, dstRoam/dstLocal the real ones. It returns the one-line summary ("" when the
// source folder is not there). Config is written through certs.SaveConfig, so dstRoam
// must be the folder certs.Dir() names.
func migrateFrom(srcRoam, srcLocal, dstRoam, dstLocal string, now time.Time) (string, error) {
	if st, err := os.Stat(srcRoam); err != nil || !st.IsDir() {
		return "", nil
	}
	stamp := now.Format("20060102-150405")
	bk := filepath.Join(dstRoam, "backup-"+stamp)
	if err := copyTree(dstRoam, filepath.Join(bk, "real"), "backup-"); err != nil {
		return "", fmt.Errorf("backup of the real folder failed, nothing merged: %w", err)
	}
	if err := copyTree(srcRoam, filepath.Join(bk, "pkg"), ""); err != nil {
		return "", fmt.Errorf("backup of the package folder failed, nothing merged: %w", err)
	}
	var parts []string
	add := func(f string, a ...any) { parts = append(parts, fmt.Sprintf(f, a...)) }
	note := func(name string, err error) {
		if err != nil {
			log.Printf("migrate: %s: %v", name, err)
		}
	}
	missing := func(err error) bool { return err != nil && os.IsNotExist(err) }
	pair := func(name string) (string, string) { return filepath.Join(dstRoam, name), filepath.Join(srcRoam, name) }

	d, s := pair("history.json")
	if n, err := history.MergeFile(d, s); !missing(err) {
		note("history.json", err)
		add("history %d", n)
	}
	d, s = pair("library.json")
	if it, ev, err := library.MergeFile(d, s); !missing(err) {
		note("library.json", err)
		add("library %d items %d events", it, ev)
	}
	// the Local\cache files that hold what Dev did (taste, marks, learned links); the rest of the cache is rebuilt
	srcCache, dstCache := filepath.Join(srcLocal, "cache"), filepath.Join(dstLocal, "cache")
	for _, n := range []string{"taste.json", "rated.json", "links.json"} {
		_ = copyTree(filepath.Join(srcCache, n), filepath.Join(bk, "pkg-local-cache", n), "")
	}
	if n, err := taste.MergeFile(filepath.Join(dstCache, "taste.json"), filepath.Join(srcCache, "taste.json")); !missing(err) {
		note("taste.json", err)
		add("taste %d", n)
	}
	if n, err := mergeRatedFile(filepath.Join(dstCache, "rated.json"), filepath.Join(srcCache, "rated.json")); !missing(err) {
		note("rated.json", err)
		add("rated %d", n)
	}
	if n, err := mergeLinksFile(filepath.Join(dstCache, "links.json"), filepath.Join(srcCache, "links.json")); !missing(err) {
		note("links.json", err)
		add("links %d", n)
	}
	// files only worth copying when the real folder has none (tmdb.json holds the TMDB key)
	for _, n := range []string{"tmdb.json", "occasions.json"} {
		d, s := pair(n)
		if _, err := os.Stat(d); err != nil {
			if b, err := os.ReadFile(s); err == nil && os.WriteFile(d, b, 0o600) == nil {
				add("%s copied", n)
			}
		}
	}
	// config.json: the real token and relayKey stay
	var filled []string
	cfgPath := filepath.Join(dstRoam, "config.json")
	if sb, err := os.ReadFile(filepath.Join(srcRoam, "config.json")); err == nil {
		var sc certs.Config
		if json.Unmarshal(sb, &sc) == nil {
			var dc certs.Config
			if db, err := os.ReadFile(cfgPath); err != nil || json.Unmarshal(db, &dc) != nil || (dc.Token == "" && dc.RelayKey == "") {
				dc = sc // no usable real config: take the package copy as it is
				filled = []string{"(whole config)"}
			} else {
				filled = certs.FillEmpty(&dc, sc)
			}
			if len(filled) > 0 {
				note("config.json", certs.SaveConfig(&dc))
			}
		}
	}
	add("config fields filled %v", filled)

	if _, err := os.Stat(srcLocal); err == nil {
		log.Printf("migrate: package Local folder %s exists (Edge profile and caches); not merged", srcLocal)
	}
	dest := srcRoam + ".merged-" + now.Format("20060102")
	if _, err := os.Stat(dest); err == nil {
		dest += "-" + now.Format("150405")
	}
	if err := os.Rename(srcRoam, dest); err != nil {
		return "", fmt.Errorf("merged, but could not rename the package folder (it will merge again next start): %w", err)
	}
	return fmt.Sprintf("migrate: package data from %s merged (%s); backup %s; source renamed to %s", srcRoam, strings.Join(parts, ", "), bk, filepath.Base(dest)), nil
}

// mergeRatedFile: watched marks, one per title; the later mark (At) wins.
func mergeRatedFile(dst, src string) (int, error) {
	b, err := os.ReadFile(src)
	if err != nil {
		return 0, err
	}
	s := map[string]rating{}
	if err := json.Unmarshal(b, &s); err != nil {
		return 0, err
	}
	d := openRated(dst)
	n := 0
	for k, r := range s {
		if cur, ok := d.m[k]; !ok || r.At > cur.At {
			d.m[k] = r
			n++
		}
	}
	if n == 0 {
		return 0, nil
	}
	out, _ := json.MarshalIndent(d.m, "", " ")
	return n, writeAtomic(dst, out)
}

// mergeLinksFile: the learned link book has no times, so what the real folder knows stays.
func mergeLinksFile(dst, src string) (int, error) {
	b, err := os.ReadFile(src)
	if err != nil {
		return 0, err
	}
	s, d := map[string]string{}, map[string]string{}
	if err := json.Unmarshal(b, &s); err != nil {
		return 0, err
	}
	if db, err := os.ReadFile(dst); err == nil {
		_ = json.Unmarshal(db, &d)
	}
	n := 0
	for k, v := range s {
		if _, ok := d[k]; !ok && v != "" {
			d[k] = v
			n++
		}
	}
	if n == 0 {
		return 0, nil
	}
	out, _ := json.Marshal(d)
	return n, writeAtomic(dst, out)
}

func writeAtomic(path string, b []byte) error {
	_ = os.MkdirAll(filepath.Dir(path), 0o700)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// copyTree copies src (a folder or one file) to dst. Top-level entries of src whose
// name starts with skipPrefix are left out (so the backup folder is not copied into
// itself). Files that cannot be read (locked) are skipped; a failure to create dst fails.
func copyTree(src, dst, skipPrefix string) error {
	st, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !st.IsDir() {
		return copyFile(src, dst)
	}
	if err := os.MkdirAll(dst, 0o700); err != nil {
		return err
	}
	return filepath.WalkDir(src, func(p string, de fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(src, p)
		if rel == "." {
			return nil
		}
		if skipPrefix != "" && !strings.ContainsRune(rel, filepath.Separator) && strings.HasPrefix(de.Name(), skipPrefix) {
			if de.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if de.IsDir() {
			return os.MkdirAll(filepath.Join(dst, rel), 0o700)
		}
		if de.Type().IsRegular() {
			_ = copyFile(p, filepath.Join(dst, rel))
		}
		return nil
	})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	_ = os.MkdirAll(filepath.Dir(dst), 0o700)
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	return err
}
