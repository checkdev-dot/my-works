package app

import (
	"log"

	"tvmode/internal/winsys"
)

// Screen on/off for the TV monitor (-display). Phone sends {t:"screen",on:bool};
// state carries screenOn. See PROTOCOL.md.

// setScreen turns the desk monitors (every monitor except the TV, -display) off (DDC/CI power, else a black window) or on.
func (a *App) setScreen(on bool) {
	a.screenMu.Lock()
	defer a.screenMu.Unlock()
	a.mu.Lock()
	cur := a.st.ScreenOn
	a.mu.Unlock()
	if on == cur {
		return
	}
	if on {
		if err := winsys.ScreenOn(a.o.Display); err != nil {
			log.Printf("screen: on failed: %v", err)
			a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Press the monitor's power button"})
		} else {
			log.Printf("screen: on")
		}
		// state says on either way: the phone's button must not stay stuck
		a.mu.Lock()
		a.st.ScreenOn = true
		a.mu.Unlock()
		a.broadcast()
		return
	}
	method, err := winsys.ScreenOff(a.o.Display)
	if err != nil {
		log.Printf("screen: off failed: %v", err)
		a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Could not turn the screen off"})
		return
	}
	log.Printf("screen: off via %s", method)
	a.mu.Lock()
	a.st.ScreenOn = false
	a.mu.Unlock()
	a.broadcast()
}
