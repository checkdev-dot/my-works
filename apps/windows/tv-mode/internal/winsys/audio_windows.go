//go:build windows

// Package winsys wraps the Windows bits: master volume, keep-awake, monitors
// and shutdown.
package winsys

import (
	"fmt"
	"runtime"
	"unsafe"

	"github.com/go-ole/go-ole"
	"github.com/moutend/go-wca/pkg/wca"
)

// withEndpoint runs fn against the default render endpoint volume. COM is
// thread-bound, so each call pins an OS thread; volume changes are rare.
func withEndpoint(fn func(aev *wca.IAudioEndpointVolume) error) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if err := ole.CoInitializeEx(0, ole.COINIT_APARTMENTTHREADED); err != nil {
		// S_FALSE (already initialised) is fine
		if oe, ok := err.(*ole.OleError); !ok || oe.Code() != 1 {
			return fmt.Errorf("CoInitializeEx: %w", err)
		}
	}
	defer ole.CoUninitialize()

	var mmde *wca.IMMDeviceEnumerator
	if err := wca.CoCreateInstance(wca.CLSID_MMDeviceEnumerator, 0, wca.CLSCTX_ALL, wca.IID_IMMDeviceEnumerator, &mmde); err != nil {
		return err
	}
	defer mmde.Release()
	var mmd *wca.IMMDevice
	if err := mmde.GetDefaultAudioEndpoint(wca.ERender, wca.EConsole, &mmd); err != nil {
		return err
	}
	defer mmd.Release()
	var aev *wca.IAudioEndpointVolume
	if err := mmd.Activate(wca.IID_IAudioEndpointVolume, wca.CLSCTX_ALL, nil, &aev); err != nil {
		return err
	}
	defer aev.Release()
	return fn(aev)
}

// GetVolume returns master volume 0..100 and mute.
func GetVolume() (vol int, muted bool, err error) {
	err = withEndpoint(func(aev *wca.IAudioEndpointVolume) error {
		var f float32
		if e := aev.GetMasterVolumeLevelScalar(&f); e != nil {
			return e
		}
		var m32 int32 // COM BOOL is 4 bytes; a Go bool would be overrun
		if e := aev.GetMute((*bool)(unsafe.Pointer(&m32))); e != nil {
			return e
		}
		vol, muted = int(f*100+0.5), m32 != 0
		return nil
	})
	return
}

// okHR treats S_FALSE (1) as success.
func okHR(err error) error {
	if oe, ok := err.(*ole.OleError); ok && oe.Code() == 1 {
		return nil
	}
	return err
}

// SetVolume sets master volume 0..100 (clamped). go-wca's
// SetMasterVolumeLevelScalar passes the float in an integer register, which
// is wrong on amd64 and silently does nothing (or garbage), so this walks
// VolumeStepUp/Down (no float arguments) until the read-back matches.
func SetVolume(v int) error {
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	return withEndpoint(func(aev *wca.IAudioEndpointVolume) error {
		var step, count uint32
		if e := aev.GetVolumeStepInfo(&step, &count); e != nil || count < 2 {
			return fmt.Errorf("volume steps unavailable: %v", e)
		}
		// exact number of steps from the current step index; no read-back
		// loop (reads lag the engine and caused overshoot).
		want := int(float64(v)/100*float64(count-1) + 0.5)
		for d := want - int(step); d != 0; {
			var e error
			if d > 0 {
				e, d = aev.VolumeStepUp(nil), d-1
			} else {
				e, d = aev.VolumeStepDown(nil), d+1
			}
			if e = okHR(e); e != nil {
				return e
			}
		}
		if v > 0 {
			var m32 int32 // COM BOOL is 4 bytes; a Go bool would be overrun
			if aev.GetMute((*bool)(unsafe.Pointer(&m32))) == nil && m32 != 0 {
				return okHR(aev.SetMute(false, nil))
			}
		}
		return nil
	})
}

// SetMute sets the mute flag.
func SetMute(m bool) error {
	return withEndpoint(func(aev *wca.IAudioEndpointVolume) error { return okHR(aev.SetMute(m, nil)) })
}
