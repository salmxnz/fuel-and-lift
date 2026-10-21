// Package push sends Web Push notifications: RFC 8291 message encryption
// (aes128gcm) with RFC 8292 VAPID authentication, using only the standard
// library and golang-jwt.
package push

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// recordSize is the rs field of the aes128gcm header.
const recordSize = 4096

// VAPID is the server's application-server key pair.
type VAPID struct {
	Subject    string // "mailto:you@example.com"
	PublicKey  string // base64url, uncompressed P-256 point (65 bytes)
	privateKey *ecdsa.PrivateKey
}

// GenerateVAPID makes a new key pair, both base64url encoded.
func GenerateVAPID() (publicKey, privateKey string, err error) {
	k, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return "", "", err
	}
	return b64(k.PublicKey().Bytes()), b64(k.Bytes()), nil
}

// NewVAPID loads a key pair produced by GenerateVAPID.
func NewVAPID(subject, publicKey, privateKey string) (*VAPID, error) {
	d, err := unb64(privateKey)
	if err != nil {
		return nil, fmt.Errorf("vapid private key: %w", err)
	}
	k, err := ecdh.P256().NewPrivateKey(d)
	if err != nil {
		return nil, fmt.Errorf("vapid private key: %w", err)
	}
	pub := k.PublicKey().Bytes()
	if publicKey != "" && publicKey != b64(pub) {
		return nil, errors.New("VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY")
	}
	return &VAPID{
		Subject:   subject,
		PublicKey: b64(pub),
		privateKey: &ecdsa.PrivateKey{
			PublicKey: ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(pub[1:33]), Y: new(big.Int).SetBytes(pub[33:65])},
			D:         new(big.Int).SetBytes(d),
		},
	}, nil
}

// authorization builds the VAPID Authorization header for an endpoint.
func (v *VAPID) authorization(endpoint string, now time.Time) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	claims := jwt.MapClaims{
		"aud": u.Scheme + "://" + u.Host,
		"exp": now.Add(12 * time.Hour).Unix(),
		"sub": v.Subject,
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodES256, claims).SignedString(v.privateKey)
	if err != nil {
		return "", err
	}
	return "vapid t=" + tok + ", k=" + v.PublicKey, nil
}

// Subscription is what the browser's PushManager returned.
type Subscription struct {
	Endpoint string
	P256dh   string // base64url
	Auth     string // base64url
}

// Encrypt produces an aes128gcm body for one subscription (RFC 8291).
func Encrypt(sub Subscription, plaintext []byte) ([]byte, error) {
	uaPub, err := unb64(sub.P256dh)
	if err != nil {
		return nil, fmt.Errorf("p256dh: %w", err)
	}
	authSecret, err := unb64(sub.Auth)
	if err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}
	if len(plaintext) > recordSize-16-1-86 {
		return nil, errors.New("push payload too large")
	}
	curve := ecdh.P256()
	uaKey, err := curve.NewPublicKey(uaPub)
	if err != nil {
		return nil, fmt.Errorf("p256dh: %w", err)
	}
	asKey, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	return encryptWith(asKey, uaKey, authSecret, salt, plaintext)
}

func encryptWith(asKey *ecdh.PrivateKey, uaKey *ecdh.PublicKey, authSecret, salt, plaintext []byte) ([]byte, error) {
	shared, err := asKey.ECDH(uaKey)
	if err != nil {
		return nil, err
	}
	asPub := asKey.PublicKey().Bytes()
	keyInfo := append(append([]byte("WebPush: info\x00"), uaKey.Bytes()...), asPub...)
	ikm, err := hkdf.Key(sha256.New, shared, authSecret, string(keyInfo), 32)
	if err != nil {
		return nil, err
	}
	cek, err := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: aes128gcm\x00", 16)
	if err != nil {
		return nil, err
	}
	nonce, err := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: nonce\x00", 12)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(cek)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	padded := append(append([]byte{}, plaintext...), 0x02) // last-record delimiter
	ct := gcm.Seal(nil, nonce, padded, nil)

	var buf bytes.Buffer
	buf.Write(salt)
	_ = binary.Write(&buf, binary.BigEndian, uint32(recordSize))
	buf.WriteByte(byte(len(asPub)))
	buf.Write(asPub)
	buf.Write(ct)
	return buf.Bytes(), nil
}

// ErrGone means the subscription no longer exists and should be deleted.
var ErrGone = errors.New("subscription gone")

// Sender delivers encrypted messages.
type Sender struct {
	VAPID *VAPID
	HTTP  *http.Client
}

// Send posts one message. TTL is how long the push service may hold it.
func (s *Sender) Send(ctx context.Context, sub Subscription, payload []byte, ttl time.Duration, urgency string) error {
	body, err := Encrypt(sub, payload)
	if err != nil {
		return err
	}
	auth, err := s.VAPID.authorization(sub.Endpoint, time.Now())
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, sub.Endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("TTL", fmt.Sprint(int(ttl.Seconds())))
	if urgency == "" {
		urgency = "normal"
	}
	req.Header.Set("Urgency", urgency)
	req.Header.Set("Authorization", auth)
	client := s.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	msg, _ := io.ReadAll(io.LimitReader(res.Body, 512))
	switch {
	case res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone:
		return ErrGone
	case res.StatusCode/100 != 2:
		return fmt.Errorf("push service: %s %s", res.Status, strings.TrimSpace(string(msg)))
	}
	return nil
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func unb64(s string) ([]byte, error) {
	s = strings.TrimRight(strings.TrimSpace(s), "=")
	s = strings.NewReplacer("+", "-", "/", "_").Replace(s)
	return base64.RawURLEncoding.DecodeString(s)
}
