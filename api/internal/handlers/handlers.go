// Package handlers holds the HTTP handlers, one file per area. Each handler
// reads the signed-in user from the request context (auth.UserID), validates
// input, calls the store and writes JSON.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/salmxnz/fuel-and-lift/api/internal/ai"
	"github.com/salmxnz/fuel-and-lift/api/internal/config"
	"github.com/salmxnz/fuel-and-lift/api/internal/google"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// Handler bundles what the endpoints need.
type Handler struct {
	Store    *store.Store
	Cfg      config.Config
	Google   *google.Client
	AI       *ai.Gateway
	Notifier *push.Notifier
	Log      *slog.Logger
	Now      func() time.Time
	// FoodLookup fetches a barcode from Open Food Facts (replaceable in tests).
	FoodLookup func(ctx context.Context, code string) (store.Food, error)
}

func (h *Handler) now() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now()
}

// Health reports liveness and database connectivity.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	if err := h.Store.Pool.Ping(r.Context()); err != nil {
		httpx.Error(w, http.StatusServiceUnavailable, "database unreachable")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// storeError maps store errors to responses; anything unexpected is a 500
// whose detail goes to the log, not the client.
func (h *Handler) storeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not found")
	case errors.Is(err, store.ErrConflict):
		httpx.Error(w, http.StatusConflict, "that conflicts with what's already there")
	case errors.Is(err, store.ErrNoMeal):
		httpx.Error(w, http.StatusBadRequest, store.ErrNoMeal.Error())
	case errors.Is(err, store.ErrUnknownExercise):
		httpx.Error(w, http.StatusBadRequest, "one of the exercises doesn't exist")
	case errors.Is(err, store.ErrInviteInvalid):
		httpx.Error(w, http.StatusGone, store.ErrInviteInvalid.Error())
	case errors.Is(err, context.Canceled):
		// client went away
	default:
		h.Log.Error("request failed", "path", r.URL.Path, "err", err)
		httpx.Error(w, http.StatusInternalServerError, "something went wrong")
	}
}

func badRequest(w http.ResponseWriter, msg string) { httpx.Error(w, http.StatusBadRequest, msg) }

// decode reads a JSON body, writing a 400 on failure.
func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := httpx.Decode(w, r, dst); err != nil {
		badRequest(w, "invalid body: "+err.Error())
		return false
	}
	return true
}

// today is the user's local date.
func (h *Handler) today(ctx context.Context, userID string) store.Date {
	return store.LocalToday(h.now(), h.Store.Timezone(ctx, userID))
}

// pathDate parses a {date} path value.
func pathDate(w http.ResponseWriter, r *http.Request) (store.Date, bool) {
	d, err := store.ParseDate(r.PathValue("date"))
	if err != nil {
		badRequest(w, "date must be YYYY-MM-DD")
		return d, false
	}
	return d, true
}

// queryRange reads ?from=&to= with defaults, capped at two years.
func queryRange(w http.ResponseWriter, r *http.Request, defFrom, defTo store.Date) (store.Date, store.Date, bool) {
	from, to := defFrom, defTo
	var err error
	if v := r.URL.Query().Get("from"); v != "" {
		if from, err = store.ParseDate(v); err != nil {
			badRequest(w, "from must be YYYY-MM-DD")
			return from, to, false
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if to, err = store.ParseDate(v); err != nil {
			badRequest(w, "to must be YYYY-MM-DD")
			return from, to, false
		}
	}
	if to.Before(from.Time) {
		badRequest(w, "to must not be before from")
		return from, to, false
	}
	if to.Sub(from.Time) > 2*366*24*time.Hour {
		badRequest(w, "range is limited to two years")
		return from, to, false
	}
	return from, to, true
}

// cleanName trims a user-supplied name and checks its length.
func cleanName(s string, max int) (string, bool) {
	s = strings.TrimSpace(s)
	return s, s != "" && utf8.RuneCountInString(s) <= max
}

// isUUID is a cheap shape check so bad ids are 404s, not database errors.
func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			if !strings.ContainsRune("0123456789abcdefABCDEF", c) {
				return false
			}
		}
	}
	return true
}

// pathID reads a UUID path value, writing a 404 when malformed.
func pathID(w http.ResponseWriter, r *http.Request, name string) (string, bool) {
	id := r.PathValue(name)
	if !isUUID(id) {
		httpx.Error(w, http.StatusNotFound, "not found")
		return "", false
	}
	return id, true
}

// clientIP prefers the address the BFF forwarded.
func clientIP(r *http.Request) string {
	for _, h := range []string{"X-Client-IP", "X-Forwarded-For", "X-Real-IP"} {
		if v := strings.TrimSpace(strings.Split(r.Header.Get(h), ",")[0]); v != "" && net.ParseIP(v) != nil {
			return v
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && net.ParseIP(host) != nil {
		return host
	}
	return ""
}

func userAgent(r *http.Request) string {
	if ua := r.Header.Get("X-Client-UA"); ua != "" {
		return ua
	}
	return r.UserAgent()
}

func utf8Len(s string) int { return utf8.RuneCountInString(s) }

// optional tells a JSON field that was absent apart from one sent as null.
type optional[T any] struct {
	Set   bool
	Value *T
}

func (o *optional[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		o.Value = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	o.Value = &v
	return nil
}
