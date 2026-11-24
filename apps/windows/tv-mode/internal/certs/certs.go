// Package certs owns the TV Mode config file and the pairing identities
// derived from the token. (The name is historical: it used to make a local
// certificate authority. The remote now reaches the PC through a relay and
// WebRTC, so no certificate is needed on the phone.)
package certs

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"log"
	"net"
	"os"
	"path/filepath"
	"testing"
)

// Config is %APPDATA%\TVMode\config.json.
type Config struct {
	Token      string  `json:"token"`
	RelayKey   string  `json:"relayKey"`  // secret that claims the relay room; the room name (pcid) is derived from it
	Remote     string  `json:"remote"`    // public origin that serves web/remote/ and /relay/; empty = this PC over LAN (dev)
	AimGain    float64 `json:"aimGain"`   // pixels per radian
	PadGain    float64 `json:"padGain"`   // desktop px per phone CSS px
	InvertYaw  bool    `json:"invertYaw"` // flip if the pointer moves the wrong way
	InvertPit  bool    `json:"invertPitch"`
	YouTubeUA  string  `json:"youtubeUA"`
	EverPaired bool    `json:"everPaired"` // a phone has connected once; stop showing the QR
}

// Dir returns %APPDATA%\TVMode, creating it.
func Dir() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		h, _ := os.UserHomeDir()
		base = filepath.Join(h, "AppData", "Roaming")
	}
	d := filepath.Join(base, "TVMode")
	_ = os.MkdirAll(d, 0o700)
	return d
}

func newToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// LoadConfig reads config.json, filling defaults and writing it back.
func LoadConfig() (*Config, error) {
	p := filepath.Join(Dir(), "config.json")
	c := &Config{}
	if b, err := os.ReadFile(p); err == nil {
		_ = json.Unmarshal(bytes.TrimPrefix(b, []byte("\xef\xbb\xbf")), c) // tolerate a BOM from hand edits
	}
	// settings gone or broken: take the copy kept under %LOCALAPPDATA%, so phones already
	// paired still match. A fresh token and relay key leave every paired phone at
	// "PC off or asleep" (2026-11-11).
	if c.Token == "" || c.RelayKey == "" {
		if b, err := os.ReadFile(backupPath()); err == nil {
			bc := &Config{}
			if json.Unmarshal(b, bc) == nil && bc.Token != "" && bc.RelayKey != "" {
				c = bc
				log.Printf("config: config.json was missing or broken; restored the backup (same pairing)")
			}
		}
	}
	if c.Token == "" {
		c.Token = newToken()
	}
	if c.RelayKey == "" {
		c.RelayKey = newToken()
	}
	if c.AimGain == 0 {
		c.AimGain = 2400
	}
	if c.PadGain == 0 {
		c.PadGain = 2.2
	}
	b, _ := json.MarshalIndent(c, "", "  ")
	_ = os.WriteFile(backupPath(), b, 0o600)
	return c, os.WriteFile(p, b, 0o600)
}

// backupPath is a second copy of config.json under %LOCALAPPDATA%\TVMode (never
// OneDrive: it holds the pairing token and relay key). Tests use a temp folder.
func backupPath() string {
	base := os.Getenv("LOCALAPPDATA")
	if testing.Testing() || base == "" {
		base = os.TempDir()
	}
	d := filepath.Join(base, "TVMode")
	_ = os.MkdirAll(d, 0o700)
	return filepath.Join(d, "config.bak.json")
}

// SaveConfig writes config.json.
func SaveConfig(c *Config) error {
	b, _ := json.MarshalIndent(c, "", "  ")
	_ = os.WriteFile(backupPath(), b, 0o600)
	return os.WriteFile(filepath.Join(Dir(), "config.json"), b, 0o600)
}

func sha(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// PCID names the relay room: the first 32 hex chars of sha256(relayKey). It is
// public (it is in the QR) and survives token rotation; only the PC knows the
// key, which the relay checks against the room name.
func PCID(relayKey string) string { return sha(relayKey)[:32] }

// AuthProof is the phone's answer to a hello nonce: sha256(token + ":" + nonce).
func AuthProof(token, nonce string) string { return sha(token + ":" + nonce) }

// PrivateIPv4s lists every private IPv4 on up, non-loopback interfaces.
func PrivateIPv4s() []net.IP {
	var out []net.IP
	ifs, _ := net.Interfaces()
	for _, ifc := range ifs {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			if ipn, ok := a.(*net.IPNet); ok {
				if ip := ipn.IP.To4(); ip != nil && ip.IsPrivate() {
					out = append(out, ip)
				}
			}
		}
	}
	return out
}

// PrimaryIPv4 returns the address on the interface that owns the default route
// (a UDP "connect" sends no packets), else the first private address.
func PrimaryIPv4() net.IP {
	if c, err := net.Dial("udp4", "8.8.8.8:80"); err == nil {
		defer c.Close()
		if a, ok := c.LocalAddr().(*net.UDPAddr); ok && a.IP.IsPrivate() {
			return a.IP.To4()
		}
	}
	if ips := PrivateIPv4s(); len(ips) > 0 {
		return ips[0]
	}
	return net.IPv4(127, 0, 0, 1)
}

// FillEmpty copies into dst every field that is empty (zero) in dst but set in src,
// and returns the NAMES of the fields it filled (never values: Token and RelayKey are
// secrets, and dst's are always kept). Used by the 2026-11-12 package-data migration.
func FillEmpty(dst *Config, src Config) []string {
	var got []string
	if dst.Remote == "" && src.Remote != "" {
		dst.Remote, got = src.Remote, append(got, "remote")
	}
	if dst.AimGain == 0 && src.AimGain != 0 {
		dst.AimGain, got = src.AimGain, append(got, "aimGain")
	}
	if dst.PadGain == 0 && src.PadGain != 0 {
		dst.PadGain, got = src.PadGain, append(got, "padGain")
	}
	if !dst.InvertYaw && src.InvertYaw {
		dst.InvertYaw, got = true, append(got, "invertYaw")
	}
	if !dst.InvertPit && src.InvertPit {
		dst.InvertPit, got = true, append(got, "invertPitch")
	}
	if dst.YouTubeUA == "" && src.YouTubeUA != "" {
		dst.YouTubeUA, got = src.YouTubeUA, append(got, "youtubeUA")
	}
	if !dst.EverPaired && src.EverPaired {
		dst.EverPaired, got = true, append(got, "everPaired")
	}
	return got
}
