package auth

import "testing"

func TestSealRoundTrip(t *testing.T) {
	sealed, err := Seal("s3cret", "invite", "tok-123")
	if err != nil {
		t.Fatal(err)
	}
	got, err := Open("s3cret", "invite", sealed)
	if err != nil || got != "tok-123" {
		t.Fatalf("Open = %q, %v", got, err)
	}
	if _, err := Open("other", "invite", sealed); err == nil {
		t.Fatal("opened with the wrong secret")
	}
	if _, err := Open("s3cret", "refresh", sealed); err == nil {
		t.Fatal("opened for another purpose")
	}
	sealed[len(sealed)-1] ^= 1
	if _, err := Open("s3cret", "invite", sealed); err == nil {
		t.Fatal("opened tampered data")
	}
}
