package app

import (
	"encoding/json"
	"sync"
)

// Every press from the phone carries an id; the PC acks it on the path it
// arrived on, before doing any work, and drops repeats of an id it has already
// seen (the phone resends over the relay when a data-channel press is not
// acked). See PROTOCOL.md "Acks".

const seenKeep = 64

// seenRing remembers the last seenKeep ids of one session.
type seenRing struct {
	mu    sync.Mutex
	set   map[string]struct{}
	order []string
}

// dup records id and reports whether it was already there. Empty ids are never duplicates.
func (r *seenRing) dup(id string) bool {
	if id == "" {
		return false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.set == nil {
		r.set = map[string]struct{}{}
	}
	if _, ok := r.set[id]; ok {
		return true
	}
	r.set[id] = struct{}{}
	r.order = append(r.order, id)
	if len(r.order) > seenKeep {
		delete(r.set, r.order[0])
		r.order = r.order[1:]
	}
	return false
}

func ackFrame(id string) []byte {
	b, _ := json.Marshal(map[string]string{"t": "ack", "id": id})
	return b
}
