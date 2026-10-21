// Package google signs people in with Google: it exchanges an OAuth
// authorization code (with PKCE) for tokens and verifies Google ID tokens
// against Google's published signing keys. It is small enough not to need an
// OIDC library.
package google

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Default endpoints.
const (
	TokenURL = "https://oauth2.googleapis.com/token"
	CertsURL = "https://www.googleapis.com/oauth2/v3/certs"
)

// Identity is what the API needs from a verified ID token.
type Identity struct {
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
	Picture       string
}

// Client verifies ID tokens and exchanges codes.
type Client struct {
	ClientID     string
	ClientSecret string
	TokenURL     string
	CertsURL     string
	HTTP         *http.Client
	Now          func() time.Time

	mu      sync.Mutex
	keys    map[string]*rsa.PublicKey
	expires time.Time
}

// New returns a Client for the given OAuth client.
func New(clientID, clientSecret string) *Client {
	return &Client{
		ClientID: clientID, ClientSecret: clientSecret,
		TokenURL: TokenURL, CertsURL: CertsURL,
		HTTP: &http.Client{Timeout: 10 * time.Second},
		Now:  time.Now,
	}
}

// ErrNotConfigured is returned when GOOGLE_CLIENT_ID is missing.
var ErrNotConfigured = errors.New("google sign-in is not configured")

// ExchangeCode trades an authorization code (+ PKCE verifier) for tokens and
// returns the verified identity from the ID token.
func (c *Client) ExchangeCode(ctx context.Context, code, verifier, redirectURI string) (Identity, error) {
	if c.ClientID == "" || c.ClientSecret == "" {
		return Identity{}, ErrNotConfigured
	}
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"client_id":     {c.ClientID},
		"client_secret": {c.ClientSecret},
		"redirect_uri":  {redirectURI},
	}
	if verifier != "" {
		form.Set("code_verifier", verifier)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return Identity{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return Identity{}, fmt.Errorf("google token exchange: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return Identity{}, fmt.Errorf("google token exchange: %s: %s", res.Status, strings.TrimSpace(string(body)))
	}
	var tok struct {
		IDToken string `json:"id_token"`
	}
	if err := json.Unmarshal(body, &tok); err != nil || tok.IDToken == "" {
		return Identity{}, errors.New("google token exchange: no id_token in response")
	}
	return c.VerifyIDToken(ctx, tok.IDToken)
}

type idClaims struct {
	Email         string `json:"email"`
	EmailVerified any    `json:"email_verified"` // bool, sometimes the string "true"
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	jwt.RegisteredClaims
}

// VerifyIDToken checks signature, issuer, audience and expiry.
func (c *Client) VerifyIDToken(ctx context.Context, raw string) (Identity, error) {
	if c.ClientID == "" {
		return Identity{}, ErrNotConfigured
	}
	claims := &idClaims{}
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithAudience(c.ClientID),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30*time.Second),
		jwt.WithTimeFunc(c.Now),
	)
	_, err := parser.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		return c.key(ctx, kid)
	})
	if err != nil {
		return Identity{}, fmt.Errorf("invalid google id token: %w", err)
	}
	if claims.Issuer != "https://accounts.google.com" && claims.Issuer != "accounts.google.com" {
		return Identity{}, errors.New("invalid google id token: wrong issuer")
	}
	if claims.Subject == "" || claims.Email == "" {
		return Identity{}, errors.New("invalid google id token: missing subject or email")
	}
	verified := false
	switch v := claims.EmailVerified.(type) {
	case bool:
		verified = v
	case string:
		verified = v == "true"
	}
	return Identity{
		Subject: claims.Subject, Email: strings.ToLower(claims.Email), EmailVerified: verified,
		Name: claims.Name, Picture: claims.Picture,
	}, nil
}

// key returns the signing key for kid, refreshing the key set when it is stale
// or the kid is unknown (Google rotates keys).
func (c *Client) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if k, ok := c.keys[kid]; ok && c.Now().Before(c.expires) {
		return k, nil
	}
	if err := c.fetchKeys(ctx); err != nil {
		return nil, err
	}
	if k, ok := c.keys[kid]; ok {
		return k, nil
	}
	return nil, fmt.Errorf("unknown signing key %q", kid)
}

func (c *Client) fetchKeys(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.CertsURL, nil)
	if err != nil {
		return err
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("fetch google keys: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch google keys: %s", res.Status)
	}
	var set struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&set); err != nil {
		return fmt.Errorf("decode google keys: %w", err)
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range set.Keys {
		if k.Kty != "RSA" {
			continue
		}
		n, err1 := base64.RawURLEncoding.DecodeString(k.N)
		e, err2 := base64.RawURLEncoding.DecodeString(k.E)
		if err1 != nil || err2 != nil {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
	}
	if len(keys) == 0 {
		return errors.New("google returned no signing keys")
	}
	c.keys = keys
	c.expires = c.Now().Add(maxAge(res.Header.Get("Cache-Control"), time.Hour))
	return nil
}

// maxAge reads max-age from a Cache-Control header.
func maxAge(cc string, fallback time.Duration) time.Duration {
	for _, part := range strings.Split(cc, ",") {
		part = strings.TrimSpace(part)
		if v, ok := strings.CutPrefix(part, "max-age="); ok {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				return time.Duration(n) * time.Second
			}
		}
	}
	return fallback
}
