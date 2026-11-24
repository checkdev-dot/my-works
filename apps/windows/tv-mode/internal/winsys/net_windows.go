//go:build windows

package winsys

import (
	"net"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// GatewayIPv4s returns the private IPv4 addresses of adapters that have an
// IPv4 default gateway, Wi-Fi and Ethernet first. Tunnels and virtual adapters
// are skipped: a VPN (vgate0, 2026-11-04) can carry the default route, and the
// phone cannot reach its address.
func GatewayIPv4s() []net.IP {
	size := uint32(15000)
	var buf []byte
	for i := 0; i < 3; i++ {
		buf = make([]byte, size)
		err := windows.GetAdaptersAddresses(windows.AF_INET, windows.GAA_FLAG_INCLUDE_GATEWAYS|windows.GAA_FLAG_SKIP_ANYCAST|windows.GAA_FLAG_SKIP_MULTICAST|windows.GAA_FLAG_SKIP_DNS_SERVER,
			0, (*windows.IpAdapterAddresses)(unsafe.Pointer(&buf[0])), &size)
		if err == nil {
			break
		}
		if err != windows.ERROR_BUFFER_OVERFLOW {
			return nil
		}
	}
	var out []net.IP
	for aa := (*windows.IpAdapterAddresses)(unsafe.Pointer(&buf[0])); aa != nil; aa = aa.Next {
		if aa.OperStatus != windows.IfOperStatusUp || aa.FirstGatewayAddress == nil || virtualAdapter(aa) {
			continue
		}
		real := aa.IfType == 71 || aa.IfType == 6 // Wi-Fi, Ethernet
		for ua := aa.FirstUnicastAddress; ua != nil; ua = ua.Next {
			if ip := ua.Address.IP(); ip != nil {
				if v4 := ip.To4(); v4 != nil && v4.IsPrivate() {
					if real {
						out = append([]net.IP{v4}, out...)
					} else {
						out = append(out, v4)
					}
				}
			}
		}
	}
	return out
}

// virtualAdapter is a tunnel, VPN or virtual switch by type or by name.
func virtualAdapter(aa *windows.IpAdapterAddresses) bool {
	if aa.IfType == 131 || aa.IfType == 23 || aa.IfType == 53 { // tunnel, PPP, prop. virtual
		return true
	}
	n := strings.ToLower(windows.UTF16PtrToString(aa.FriendlyName) + " " + windows.UTF16PtrToString(aa.Description))
	for _, w := range []string{"vgate", "utun", "vethernet", "hyper-v", "wsl", "virtual", "vpn", "tap-", "wintun", "wireguard", "tailscale", "cloudflare", "warp", "zerotier", "vmware", "virtualbox"} {
		if strings.Contains(n, w) {
			return true
		}
	}
	return false
}
