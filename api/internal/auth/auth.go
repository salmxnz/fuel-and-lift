// Package auth mints and checks tokens and holds the auth middleware.
//
// The model follows nex-dash-forecast: a short-lived HS256 access JWT sent as a
// Bearer token, a long-lived opaque refresh token that rotates on every use and
// is stored only as a SHA-256 hash, and a CSRF double-submit cookie guarding the
// two cookie-driven routes (refresh, logout).
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
)

// Roles.
const (
	RoleAdmin  = "admin"
	RoleMember = "member"
)

// Claims is the access-token payload.
type Claims struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// SignAccess mints a short-lived HS256 access token.
func SignAccess(userID, role, secret string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// VerifyAccess parses an access token, rejecting anything but HMAC.
func VerifyAccess(tok, secret string) (*Claims, error) {
	claims := &Claims{}
	parsed, err := jwt.ParseWithClaims(tok, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil || !parsed.Valid || claims.UserID == "" {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// RandomToken returns n random bytes hex encoded.
func RandomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// HashToken is the SHA-256 hex digest used to store opaque tokens at rest.
// SHA-256 is enough: the tokens are 256 random bits, there is nothing to guess.
func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

type ctxKey int

const (
	ctxUserID ctxKey = iota
	ctxRole
)

// RequireAuth requires a valid Bearer access token and puts the user id and
// role in the request context.
func RequireAuth(secret string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			if !strings.HasPrefix(h, "Bearer ") {
				httpx.Error(w, http.StatusUnauthorized, "missing bearer token")
				return
			}
			claims, err := VerifyAccess(strings.TrimPrefix(h, "Bearer "), secret)
			if err != nil {
				httpx.Error(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}
			ctx := context.WithValue(r.Context(), ctxUserID, claims.UserID)
			ctx = context.WithValue(ctx, ctxRole, claims.Role)
			next(w, r.WithContext(ctx))
		}
	}
}

// RequireAdmin runs inside RequireAuth and refuses non-admins.
func RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if RoleFrom(r) != RoleAdmin {
			httpx.Error(w, http.StatusForbidden, "admins only")
			return
		}
		next(w, r)
	}
}

// UserID returns the signed-in user's id ("" when unauthenticated).
func UserID(r *http.Request) string {
	v, _ := r.Context().Value(ctxUserID).(string)
	return v
}

// RoleFrom returns the signed-in user's role.
func RoleFrom(r *http.Request) string {
	v, _ := r.Context().Value(ctxRole).(string)
	return v
}

// WithUser returns a request carrying a user id and role (tests).
func WithUser(r *http.Request, userID, role string) *http.Request {
	ctx := context.WithValue(r.Context(), ctxUserID, userID)
	ctx = context.WithValue(ctx, ctxRole, role)
	return r.WithContext(ctx)
}

// Cookie names Go sets on the auth responses. The BFF copies them into its own
// fl_* cookies and replays them on refresh/logout.
const (
	RefreshCookie = "refresh_token"
	CSRFCookie    = "csrf_token"
)

// CSRF enforces the double submit: the csrf_token cookie must equal the
// X-CSRF-Token header.
func CSRF(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(CSRFCookie)
		h := r.Header.Get("X-CSRF-Token")
		if err != nil || h == "" || c.Value != h {
			httpx.Error(w, http.StatusForbidden, "invalid csrf token")
			return
		}
		next(w, r)
	}
}

// CORS echoes allowed origins with credentials. Requests normally come from the
// Next.js server (no Origin header), so this mainly serves local tools.
func CORS(origins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(origins))
	for _, o := range origins {
		allowed[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if o := r.Header.Get("Origin"); o != "" && allowed[o] {
				w.Header().Set("Access-Control-Allow-Origin", o)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-CSRF-Token")
			w.Header().Add("Vary", "Origin")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
