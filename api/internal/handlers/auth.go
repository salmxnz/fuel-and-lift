package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/google"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

func (h *Handler) issueTokens(w http.ResponseWriter, r *http.Request, u store.User) (access, csrf string, err error) {
	access, err = auth.SignAccess(u.ID, u.Role, h.Cfg.JWTSecret, h.Cfg.AccessTTL)
	if err != nil {
		return "", "", err
	}
	raw, err := auth.RandomToken(32)
	if err != nil {
		return "", "", err
	}
	csrf, err = auth.RandomToken(32)
	if err != nil {
		return "", "", err
	}
	expires := h.now().Add(time.Duration(h.Cfg.RefreshTTLDays) * 24 * time.Hour)
	if err := h.Store.CreateRefreshToken(r.Context(), u.ID, auth.HashToken(raw), userAgent(r), clientIP(r), expires); err != nil {
		return "", "", err
	}
	secure := h.Cfg.SecureCookies()
	http.SetCookie(w, &http.Cookie{Name: auth.RefreshCookie, Value: raw, Path: "/", Expires: expires,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode})
	http.SetCookie(w, &http.Cookie{Name: auth.CSRFCookie, Value: csrf, Path: "/", Expires: expires,
		Secure: secure, SameSite: http.SameSiteStrictMode})
	return access, csrf, nil
}

func (h *Handler) onboarded(r *http.Request, userID string) (bool, *store.Profile, error) {
	p, err := h.Store.GetProfile(r.Context(), userID)
	if errors.Is(err, store.ErrNotFound) {
		return false, nil, nil
	}
	if err != nil {
		return false, nil, err
	}
	return true, &p, nil
}

// GoogleSignIn handles POST /v1/auth/google.
func (h *Handler) GoogleSignIn(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code         string `json:"code"`
		CodeVerifier string `json:"code_verifier"`
		RedirectURI  string `json:"redirect_uri"`
		IDToken      string `json:"id_token"`
		InviteToken  string `json:"invite_token"`
	}
	if !decode(w, r, &in) {
		return
	}
	var id google.Identity
	var err error
	switch {
	case in.Code != "":
		if !h.redirectAllowed(in.RedirectURI) {
			badRequest(w, "redirect_uri is not allowed")
			return
		}
		id, err = h.Google.ExchangeCode(r.Context(), in.Code, in.CodeVerifier, in.RedirectURI)
	case in.IDToken != "":
		id, err = h.Google.VerifyIDToken(r.Context(), in.IDToken)
	default:
		badRequest(w, "send code (+ code_verifier, redirect_uri) or id_token")
		return
	}
	if errors.Is(err, google.ErrNotConfigured) {
		httpx.Error(w, http.StatusServiceUnavailable, "Google sign-in is not configured on the server")
		return
	}
	if err != nil {
		h.Log.Warn("google sign-in failed", "err", err)
		httpx.Error(w, http.StatusUnauthorized, "Google sign-in failed, please try again")
		return
	}
	if !id.EmailVerified {
		httpx.ErrorCode(w, http.StatusForbidden, "email_unverified", "your Google email address isn't verified")
		return
	}
	var inviteHash string
	if t := strings.TrimSpace(in.InviteToken); t != "" {
		inviteHash = auth.HashToken(t)
	}
	u, _, err := h.Store.SignInWithGoogle(r.Context(), store.GoogleSignIn{
		Subject: id.Subject, Email: id.Email, Name: id.Name, AvatarURL: id.Picture,
		MakeAdmin: h.Cfg.IsAdminEmail(id.Email), InviteTokenHash: inviteHash,
	})
	if errors.Is(err, store.ErrSuspended) {
		httpx.ErrorCode(w, http.StatusForbidden, "suspended", "this account is suspended")
		return
	}
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	access, csrf, err := h.issueTokens(w, r, u)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	ok, _, err := h.onboarded(r, u.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"access_token": access, "csrf_token": csrf, "user": u, "onboarded": ok})
}

// redirectAllowed accepts only the app's own Google callback.
func (h *Handler) redirectAllowed(uri string) bool {
	if uri == h.Cfg.AppURL+"/api/auth/google/callback" {
		return true
	}
	for _, o := range h.Cfg.AllowedOrigins {
		if uri == o+"/api/auth/google/callback" {
			return true
		}
	}
	return false
}

// Refresh handles POST /v1/auth/refresh (cookie + CSRF).
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(auth.RefreshCookie)
	if err != nil || c.Value == "" {
		httpx.Error(w, http.StatusUnauthorized, "missing refresh token")
		return
	}
	userID, err := h.Store.ConsumeRefreshToken(r.Context(), auth.HashToken(c.Value))
	if errors.Is(err, store.ErrNotFound) {
		httpx.Error(w, http.StatusUnauthorized, "session expired, please sign in again")
		return
	}
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	u, err := h.Store.GetUser(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "session expired, please sign in again")
		return
	}
	if u.SuspendedAt != nil {
		httpx.ErrorCode(w, http.StatusUnauthorized, "suspended", "this account is suspended")
		return
	}
	access, csrf, err := h.issueTokens(w, r, u)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"access_token": access, "csrf_token": csrf})
}

// Logout handles POST /v1/auth/logout (cookie + CSRF).
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.RefreshCookie); err == nil && c.Value != "" {
		_ = h.Store.RevokeRefreshToken(r.Context(), auth.HashToken(c.Value))
	}
	http.SetCookie(w, &http.Cookie{Name: auth.RefreshCookie, Value: "", Path: "/", MaxAge: -1})
	http.SetCookie(w, &http.Cookie{Name: auth.CSRFCookie, Value: "", Path: "/", MaxAge: -1})
	httpx.NoContent(w)
}

// Me handles GET /v1/auth/me.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	u, err := h.Store.GetUser(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	ok, p, err := h.onboarded(r, u.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": u, "onboarded": ok, "profile": p})
}
