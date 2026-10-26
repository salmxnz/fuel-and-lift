package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// The admin app's users screens. These routes are wrapped in auth.RequireAdmin.
// Reads reuse the store functions the app itself uses, with the user id taken
// from the path instead of the session.

// ListAdminUsers handles GET /v1/admin/users?q=&plan=&role=&status=&limit=&offset=.
func (h *Handler) ListAdminUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := store.AdminUserFilter{Q: q.Get("q"), Plan: q.Get("plan"), Role: q.Get("role"), Status: q.Get("status"), Limit: 50}
	if !oneOf(f.Plan, "", "free", "pro") || !oneOf(f.Role, "", auth.RoleAdmin, auth.RoleMember) ||
		!oneOf(f.Status, "", "active", "suspended") {
		badRequest(w, "plan is free|pro, role is admin|member, status is active|suspended")
		return
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100 {
			badRequest(w, "limit must be 1-100")
			return
		}
		f.Limit = n
	}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			badRequest(w, "offset must be 0 or more")
			return
		}
		f.Offset = n
	}
	list, total, err := h.Store.ListUsers(r.Context(), f)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	for i := range list {
		list[i].AdminEmail = h.Cfg.IsAdminEmail(list[i].Email)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"users": list, "total": total})
}

func oneOf(v string, options ...string) bool {
	for _, o := range options {
		if v == o {
			return true
		}
	}
	return false
}

// adminUser loads the path's user, writing a 404 when there is none.
func (h *Handler) adminUser(w http.ResponseWriter, r *http.Request) (store.AdminUser, bool) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return store.AdminUser{}, false
	}
	u, err := h.Store.GetAdminUser(r.Context(), id)
	if err != nil {
		h.storeError(w, r, err)
		return u, false
	}
	u.AdminEmail = h.Cfg.IsAdminEmail(u.Email)
	return u, true
}

// GetAdminUser handles GET /v1/admin/users/{id}.
func (h *Handler) GetAdminUser(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	b, err := h.billing(r.Context(), u.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	out := map[string]any{"user": u, "billing": b, "profile": nil, "goal": nil}
	if p, err := h.Store.GetProfile(r.Context(), u.ID); err == nil {
		out["profile"] = p
	} else if !errors.Is(err, store.ErrNotFound) {
		h.storeError(w, r, err)
		return
	}
	if g, err := h.Store.ActiveGoal(r.Context(), u.ID); err == nil {
		out["goal"] = g
	} else if !errors.Is(err, store.ErrNotFound) {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

// respondAdminUser writes the user as it is after a change.
func (h *Handler) respondAdminUser(w http.ResponseWriter, r *http.Request, id string) {
	u, err := h.Store.GetAdminUser(r.Context(), id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	u.AdminEmail = h.Cfg.IsAdminEmail(u.Email)
	httpx.JSON(w, http.StatusOK, map[string]any{"user": u})
}

// GrantPro handles PUT /v1/admin/users/{id}/pro {until: RFC 3339 | null}.
// Pro from an admin is the only Pro an admin can hand out; it isn't a gift
// between users.
func (h *Handler) GrantPro(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Until *time.Time `json:"until"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Until != nil && !in.Until.After(h.now()) {
		badRequest(w, "until must be in the future")
		return
	}
	if u.IsPro && u.ProUntil == nil && u.ProSource != nil && *u.ProSource == "referrals" && in.Until != nil {
		badRequest(w, "they already have Pro forever from referrals")
		return
	}
	if err := h.Store.SetAdminPro(r.Context(), u.ID, in.Until); err != nil {
		h.storeError(w, r, err)
		return
	}
	h.respondAdminUser(w, r, u.ID)
}

// RevokePro handles DELETE /v1/admin/users/{id}/pro.
func (h *Handler) RevokePro(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	if u.AdminEmail {
		badRequest(w, "people in ADMIN_EMAILS always have Pro")
		return
	}
	if u.IsPro && u.ProSource != nil && *u.ProSource == "subscription" {
		// It would come back at the next renewal.
		badRequest(w, "they pay for Pro: cancel their subscription in Stripe instead")
		return
	}
	if err := h.Store.RevokePro(r.Context(), u.ID); err != nil {
		h.storeError(w, r, err)
		return
	}
	h.respondAdminUser(w, r, u.ID)
}

// SetUserRole handles PUT /v1/admin/users/{id}/role {role}. A changed role
// shows up in the person's next access token (within ACCESS_TTL).
func (h *Handler) SetUserRole(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if !decode(w, r, &in) {
		return
	}
	switch {
	case in.Role != auth.RoleAdmin && in.Role != auth.RoleMember:
		badRequest(w, "role must be admin or member")
		return
	case in.Role == auth.RoleMember && u.ID == auth.UserID(r):
		badRequest(w, "you can't remove your own admin role")
		return
	case in.Role == auth.RoleMember && u.AdminEmail:
		badRequest(w, "people in ADMIN_EMAILS are always admins")
		return
	}
	if err := h.Store.SetRole(r.Context(), u.ID, in.Role); err != nil {
		h.storeError(w, r, err)
		return
	}
	h.respondAdminUser(w, r, u.ID)
}

// SuspendUser handles POST (suspend, {reason?}) and DELETE (lift)
// /v1/admin/users/{id}/suspend. Suspending signs the person out everywhere
// once their access token expires (within ACCESS_TTL) and blocks sign-in.
func (h *Handler) SuspendUser(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	suspend := r.Method == http.MethodPost
	var reason *string
	if suspend {
		if u.ID == auth.UserID(r) {
			badRequest(w, "you can't suspend yourself")
			return
		}
		var in struct {
			Reason *string `json:"reason"`
		}
		if r.ContentLength != 0 && !decode(w, r, &in) {
			return
		}
		if in.Reason != nil {
			s := strings.TrimSpace(*in.Reason)
			if utf8.RuneCountInString(s) > 300 {
				badRequest(w, "reason is limited to 300 characters")
				return
			}
			if s != "" {
				reason = &s
			}
		}
	}
	if err := h.Store.SetSuspended(r.Context(), u.ID, suspend, reason); err != nil {
		h.storeError(w, r, err)
		return
	}
	h.respondAdminUser(w, r, u.ID)
}

// AdminUserSavedMeals handles GET /v1/admin/users/{id}/saved-meals.
func (h *Handler) AdminUserSavedMeals(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	list, err := h.Store.ListSavedMeals(r.Context(), u.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"saved_meals": list})
}

// AdminUserEntries handles GET /v1/admin/users/{id}/entries?from=&to=: the
// food log, the last 14 days by default and at most 92 days at once.
func (h *Handler) AdminUserEntries(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	today := h.today(r.Context(), u.ID)
	from, to, ok := queryRange(w, r, store.Date{Time: today.AddDate(0, 0, -13)}, today)
	if !ok {
		return
	}
	if to.Sub(from.Time) > 91*24*time.Hour {
		badRequest(w, "range is limited to 92 days")
		return
	}
	list, err := h.Store.ListEntries(r.Context(), u.ID, from, to)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"entries": list, "from": from, "to": to})
}

// AdminUserTemplates handles GET /v1/admin/users/{id}/templates.
func (h *Handler) AdminUserTemplates(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	list, err := h.Store.ListTemplates(r.Context(), u.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"templates": list})
}

// AdminUserRoutines handles GET /v1/admin/users/{id}/routines.
func (h *Handler) AdminUserRoutines(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	list, err := h.Store.ListRoutines(r.Context(), u.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"routines": list})
}

// AdminUserSessions handles GET /v1/admin/users/{id}/sessions?from=&to= (the
// last 90 days by default).
func (h *Handler) AdminUserSessions(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	today := h.today(r.Context(), u.ID)
	from, to, ok := queryRange(w, r, store.Date{Time: today.AddDate(0, 0, -89)}, store.Date{Time: today.AddDate(0, 0, 14)})
	if !ok {
		return
	}
	list, err := h.Store.ListSessions(r.Context(), u.ID, from, to)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"sessions": list, "from": from, "to": to})
}

// AdminUserSession handles GET /v1/admin/users/{id}/sessions/{session_id}.
func (h *Handler) AdminUserSession(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	sid, ok := pathID(w, r, "session_id")
	if !ok {
		return
	}
	s, err := h.Store.GetSession(r.Context(), u.ID, sid)
	h.sessionResponse(w, r, http.StatusOK, s, err)
}

// AdminUserFriends handles GET /v1/admin/users/{id}/friends.
func (h *Handler) AdminUserFriends(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	list, err := h.Store.ListFriends(r.Context(), u.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if list == nil {
		list = []store.Friend{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"friends": list})
}
