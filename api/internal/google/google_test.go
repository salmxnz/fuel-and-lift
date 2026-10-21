package google

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type fakeGoogle struct {
	key    *rsa.PrivateKey
	srv    *httptest.Server
	lastCV string
}

func newFakeGoogle(t *testing.T) *fakeGoogle {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeGoogle{key: k}
	mux := http.NewServeMux()
	mux.HandleFunc("/certs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=600")
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kid": "k1", "kty": "RSA", "alg": "RS256",
			"n": base64.RawURLEncoding.EncodeToString(k.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(k.E)).Bytes()),
		}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.lastCV = r.Form.Get("code_verifier")
		if r.Form.Get("code") != "good-code" || r.Form.Get("client_secret") != "secret" {
			http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"id_token": f.sign(t, "client-1", "https://accounts.google.com", time.Hour)})
	})
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeGoogle) sign(t *testing.T, aud, iss string, ttl time.Duration) string {
	t.Helper()
	claims := jwt.MapClaims{
		"iss": iss, "aud": aud, "sub": "1234567890", "email": "Kibon@Example.com",
		"email_verified": true, "name": "Kibon", "picture": "https://example.com/p.png",
		"iat": time.Now().Unix(), "exp": time.Now().Add(ttl).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = "k1"
	s, err := tok.SignedString(f.key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func (f *fakeGoogle) client() *Client {
	c := New("client-1", "secret")
	c.TokenURL = f.srv.URL + "/token"
	c.CertsURL = f.srv.URL + "/certs"
	return c
}

func TestVerifyIDToken(t *testing.T) {
	f := newFakeGoogle(t)
	c := f.client()
	ctx := context.Background()

	id, err := c.VerifyIDToken(ctx, f.sign(t, "client-1", "accounts.google.com", time.Hour))
	if err != nil {
		t.Fatalf("valid token rejected: %v", err)
	}
	if id.Subject != "1234567890" || id.Email != "kibon@example.com" || !id.EmailVerified {
		t.Fatalf("unexpected identity %+v", id)
	}

	cases := map[string]string{
		"wrong audience": f.sign(t, "someone-else", "https://accounts.google.com", time.Hour),
		"wrong issuer":   f.sign(t, "client-1", "https://evil.example.com", time.Hour),
		"expired":        f.sign(t, "client-1", "https://accounts.google.com", -time.Hour),
		"garbage":        "not.a.token",
	}
	for name, tok := range cases {
		if _, err := c.VerifyIDToken(ctx, tok); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}

	// A token signed by a different key must fail even with a known kid.
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	forged := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": "https://accounts.google.com", "aud": "client-1", "sub": "x", "email": "x@y.z",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	forged.Header["kid"] = "k1"
	s, _ := forged.SignedString(other)
	if _, err := c.VerifyIDToken(ctx, s); err == nil {
		t.Error("forged token accepted")
	}
}

func TestExchangeCode(t *testing.T) {
	f := newFakeGoogle(t)
	c := f.client()
	id, err := c.ExchangeCode(context.Background(), "good-code", "verifier-123", "http://localhost:3000/cb")
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if id.Email != "kibon@example.com" {
		t.Fatalf("email = %q", id.Email)
	}
	if f.lastCV != "verifier-123" {
		t.Fatalf("PKCE verifier not forwarded, got %q", f.lastCV)
	}
	if _, err := c.ExchangeCode(context.Background(), "bad-code", "v", "http://localhost:3000/cb"); err == nil {
		t.Fatal("bad code accepted")
	}
}

func TestNotConfigured(t *testing.T) {
	c := New("", "")
	if _, err := c.VerifyIDToken(context.Background(), "x"); err != ErrNotConfigured {
		t.Fatalf("got %v", err)
	}
}
