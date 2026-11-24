package app

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"tvmode/internal/certs"
)

func testBook() (*inviteBook, *time.Time) {
	now := time.Unix(1000, 0)
	b := &inviteBook{exp: map[string]invite{}, now: func() time.Time { return now }}
	return b, &now
}

func TestInviteSingleUse(t *testing.T) {
	b, _ := testBook()
	code := b.create("")
	if len(code) != 32 {
		t.Fatalf("want 128 bits of hex, got %q", code)
	}
	if b.take("n1", certs.AuthProof("wrong", "n1")) {
		t.Fatal("a wrong code was accepted")
	}
	if !b.take("n1", certs.AuthProof(code, "n1")) {
		t.Fatal("a fresh invite was refused")
	}
	if b.take("n2", certs.AuthProof(code, "n2")) {
		t.Fatal("an invite worked twice")
	}
}

func TestInviteExpires(t *testing.T) {
	b, now := testBook()
	code := b.create("")
	*now = now.Add(inviteTTL - time.Second)
	if !b.live(code) {
		t.Fatal("invite should still be live just before 10 minutes")
	}
	*now = now.Add(2 * time.Second)
	if b.live(code) || b.take("n", certs.AuthProof(code, "n")) {
		t.Fatal("an expired invite was accepted")
	}
}

func TestInviteForReusesLiveCode(t *testing.T) {
	b, now := testBook()
	c1 := b.create("phone1")
	if c2 := b.create("phone1"); c2 != c1 {
		t.Fatal("same phone asking again got a new code")
	}
	if b.create("phone2") == c1 {
		t.Fatal("another phone got the first phone's code")
	}
	*now = now.Add(inviteTTL + time.Second)
	if b.create("phone1") == c1 {
		t.Fatal("an expired code was handed back")
	}
}

func TestInviteRevoke(t *testing.T) {
	b, _ := testBook()
	code := b.create("p")
	b.revoke("nope")
	b.revoke(code)
	if b.live(code) || b.take("n", certs.AuthProof(code, "n")) {
		t.Fatal("a revoked invite still works")
	}
}

func TestInviteTakeUpperCaseProof(t *testing.T) {
	b, _ := testBook()
	code := b.create("")
	if !b.take("n", strings.ToUpper(certs.AuthProof(code, "n"))) {
		t.Fatal("an upper-case proof was refused")
	}
}

func TestInviteCap(t *testing.T) {
	b, now := testBook()
	var first string
	for i := 0; i < 8; i++ {
		c := b.create(fmt.Sprintf("p%d", i))
		if i == 0 {
			first = c
		}
		*now = now.Add(time.Second)
	}
	if len(b.exp) != inviteCap {
		t.Fatalf("want %d live invites, got %d", inviteCap, len(b.exp))
	}
	if b.live(first) {
		t.Fatal("the oldest invite should have been dropped")
	}
}
