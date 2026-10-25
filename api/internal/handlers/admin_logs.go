package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/email"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// The admin app's notifications log and request audit log. The list routes
// are wrapped in auth.RequireAdmin.

// RecordEmail stores the outcome of an email (email.Mailer.Record).
func (h *Handler) RecordEmail(ctx context.Context, r email.Result) {
	userID, err := h.Store.UserIDByEmail(ctx, r.To)
	if err != nil {
		h.Log.Warn("email log: find user", "err", err)
	}
	rec := store.NotificationRecord{
		Channel: "email", UserID: userID, Recipient: &r.To, Kind: r.Template, Title: r.Subject, Status: r.Status,
	}
	if r.Err != nil {
		e := r.Err.Error()
		rec.Error = &e
	}
	if err := h.Store.LogNotifications(ctx, []store.NotificationRecord{rec}); err != nil {
		h.Log.Warn("email log: write", "err", err)
	}
}

// RunCleanup deletes audit and notification records past their retention,
// at start and then daily, until ctx ends.
func (h *Handler) RunCleanup(ctx context.Context) {
	t := time.NewTicker(24 * time.Hour)
	defer t.Stop()
	for {
		h.CleanupOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// CleanupOnce is one pass of RunCleanup.
func (h *Handler) CleanupOnce(ctx context.Context) {
	now := h.now()
	if days := h.Cfg.AuditRetentionDays; days > 0 {
		if n, err := h.Store.PruneAudit(ctx, now.AddDate(0, 0, -days)); err != nil {
			h.Log.Warn("cleanup: audit log", "err", err)
		} else if n > 0 {
			h.Log.Info("cleanup: audit log", "deleted", n)
		}
	}
	if days := h.Cfg.NotificationRetentionDays; days > 0 {
		if n, err := h.Store.PruneNotifications(ctx, now.AddDate(0, 0, -days)); err != nil {
			h.Log.Warn("cleanup: notifications", "err", err)
		} else if n > 0 {
			h.Log.Info("cleanup: notifications", "deleted", n)
		}
	}
}

// pageParams reads ?before= (an id cursor) and ?limit= (1-200).
func pageParams(w http.ResponseWriter, r *http.Request, defLimit int) (before int64, limit int, ok bool) {
	q := r.URL.Query()
	limit = defLimit
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 200 {
			badRequest(w, "limit must be 1-200")
			return 0, 0, false
		}
		limit = n
	}
	if v := q.Get("before"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 1 {
			badRequest(w, "before must be a positive id")
			return 0, 0, false
		}
		before = n
	}
	return before, limit, true
}

// queryUserID reads an optional ?user_id=.
func queryUserID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := r.URL.Query().Get("user_id")
	if id != "" && !isUUID(id) {
		badRequest(w, "user_id must be a user id")
		return "", false
	}
	return id, true
}

// nextBefore is the cursor for the page after list, or nil at the end.
func nextBefore(n int, limit int, lastID int64) *int64 {
	if n < limit {
		return nil
	}
	return &lastID
}

// ListSentNotifications handles
// GET /v1/admin/notifications?channel=&status=&kind=&user_id=&q=&before=&limit=.
func (h *Handler) ListSentNotifications(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := store.NotificationFilter{Channel: q.Get("channel"), Status: q.Get("status"), Kind: strings.TrimSpace(q.Get("kind")), Q: q.Get("q")}
	if !oneOf(f.Channel, "", "push", "email") {
		badRequest(w, "channel is push or email")
		return
	}
	if !oneOf(f.Status, "", "sent", "partial", "failed", "no_devices", "quiet_hours", "disabled") {
		badRequest(w, "status is sent, partial, failed, no_devices, quiet_hours or disabled")
		return
	}
	var ok bool
	if f.UserID, ok = queryUserID(w, r); !ok {
		return
	}
	if f.Before, f.Limit, ok = pageParams(w, r, 50); !ok {
		return
	}
	list, err := h.Store.ListNotifications(r.Context(), f)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	var last int64
	if len(list) > 0 {
		last = list[len(list)-1].ID
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"notifications": list, "next_before": nextBefore(len(list), f.Limit, last)})
}

// SentNotificationStats handles GET /v1/admin/notifications/stats: counts by
// channel and status over the last 24 hours.
func (h *Handler) SentNotificationStats(w http.ResponseWriter, r *http.Request) {
	since := h.now().Add(-24 * time.Hour)
	counts, err := h.Store.NotificationStats(r.Context(), since)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"since": since, "counts": counts})
}

// ListAudit handles GET /v1/admin/audit?user_id=&method=&status=&q=&before=&limit=.
// status is a class (2xx, 3xx, 4xx, 5xx) or an exact code.
func (h *Handler) ListAudit(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := store.AuditFilter{Method: strings.ToUpper(q.Get("method")), Q: q.Get("q")}
	if !oneOf(f.Method, "", "GET", "POST", "PUT", "PATCH", "DELETE") {
		badRequest(w, "method is GET, POST, PUT, PATCH or DELETE")
		return
	}
	switch s := q.Get("status"); {
	case s == "":
	case len(s) == 3 && s[1:] == "xx" && s[0] >= '1' && s[0] <= '5':
		f.StatusMin = int(s[0]-'0') * 100
		f.StatusMax = f.StatusMin + 99
	default:
		code, err := strconv.Atoi(s)
		if err != nil || code < 100 || code > 599 {
			badRequest(w, "status is a class like 4xx or a code like 404")
			return
		}
		f.StatusMin, f.StatusMax = code, code
	}
	var ok bool
	if f.UserID, ok = queryUserID(w, r); !ok {
		return
	}
	if f.Before, f.Limit, ok = pageParams(w, r, 100); !ok {
		return
	}
	list, err := h.Store.ListAudit(r.Context(), f)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	var last int64
	if len(list) > 0 {
		last = list[len(list)-1].ID
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"entries": list, "next_before": nextBefore(len(list), f.Limit, last)})
}
