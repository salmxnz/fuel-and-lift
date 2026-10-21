package push

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// decrypt is the browser side of RFC 8291, to check Encrypt round-trips.
func decrypt(t *testing.T, ua *ecdh.PrivateKey, authSecret, body []byte) []byte {
	t.Helper()
	salt := body[:16]
	rs := binary.BigEndian.Uint32(body[16:20])
	if rs != recordSize {
		t.Fatalf("rs = %d", rs)
	}
	idlen := int(body[20])
	asPub := body[21 : 21+idlen]
	ct := body[21+idlen:]
	asKey, err := ecdh.P256().NewPublicKey(asPub)
	if err != nil {
		t.Fatal(err)
	}
	shared, _ := ua.ECDH(asKey)
	info := append(append([]byte("WebPush: info\x00"), ua.PublicKey().Bytes()...), asPub...)
	ikm, _ := hkdf.Key(sha256.New, shared, authSecret, string(info), 32)
	cek, _ := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: aes128gcm\x00", 16)
	nonce, _ := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: nonce\x00", 12)
	block, _ := aes.NewCipher(cek)
	gcm, _ := cipher.NewGCM(block)
	pt, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if pt[len(pt)-1] != 0x02 {
		t.Fatal("missing padding delimiter")
	}
	return pt[:len(pt)-1]
}

func TestEncryptRoundTrip(t *testing.T) {
	ua, _ := ecdh.P256().GenerateKey(rand.Reader)
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	sub := Subscription{Endpoint: "https://push.example.com/x", P256dh: b64(ua.PublicKey().Bytes()), Auth: b64(auth)}
	msg := []byte(`{"title":"Kibon worked out today","url":"/friends"}`)
	body, err := Encrypt(sub, msg)
	if err != nil {
		t.Fatal(err)
	}
	if got := decrypt(t, ua, auth, body); !bytes.Equal(got, msg) {
		t.Fatalf("got %q", got)
	}
}

func TestVAPIDAndSend(t *testing.T) {
	pub, priv, err := GenerateVAPID()
	if err != nil {
		t.Fatal(err)
	}
	v, err := NewVAPID("mailto:test@example.com", pub, priv)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewVAPID("mailto:x", "wrong", priv); err == nil {
		t.Fatal("mismatched public key accepted")
	}

	ua, _ := ecdh.P256().GenerateKey(rand.Reader)
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	var gotBody []byte
	var gotAuth string
	status := http.StatusCreated
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotBody, _ = io.ReadAll(r.Body)
		if r.Header.Get("Content-Encoding") != "aes128gcm" || r.Header.Get("TTL") == "" {
			http.Error(w, "headers", 400)
			return
		}
		w.WriteHeader(status)
	}))
	defer srv.Close()

	s := &Sender{VAPID: v}
	sub := Subscription{Endpoint: srv.URL + "/push/abc", P256dh: b64(ua.PublicKey().Bytes()), Auth: b64(auth)}
	if err := s.Send(context.Background(), sub, []byte("hi"), time.Hour, ""); err != nil {
		t.Fatal(err)
	}
	if string(decrypt(t, ua, auth, gotBody)) != "hi" {
		t.Fatal("payload mismatch")
	}
	// The VAPID JWT must verify with the public key and carry the endpoint origin.
	parts := strings.SplitN(strings.TrimPrefix(gotAuth, "vapid t="), ", k=", 2)
	if len(parts) != 2 || parts[1] != pub {
		t.Fatalf("authorization header = %q", gotAuth)
	}
	tok, err := jwt.Parse(parts[0], func(*jwt.Token) (any, error) { return &v.privateKey.PublicKey, nil },
		jwt.WithValidMethods([]string{"ES256"}))
	if err != nil {
		t.Fatalf("vapid jwt: %v", err)
	}
	if aud, _ := tok.Claims.(jwt.MapClaims)["aud"].(string); aud != srv.URL {
		t.Fatalf("aud = %q, want %q", aud, srv.URL)
	}

	status = http.StatusGone
	if err := s.Send(context.Background(), sub, []byte("hi"), time.Hour, ""); err != ErrGone {
		t.Fatalf("want ErrGone, got %v", err)
	}
}
