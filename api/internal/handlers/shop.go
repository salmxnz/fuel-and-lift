package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// validVisibility checks an optional visibility, writing a 400 when unknown.
func validVisibility(w http.ResponseWriter, v *string) bool {
	if v != nil && !store.Visibilities[*v] {
		badRequest(w, "visibility must be private, friends or public")
		return false
	}
	return true
}

// pathKind reads a {kind} path value, writing a 404 when unknown.
func pathKind(w http.ResponseWriter, r *http.Request) (string, bool) {
	k := r.PathValue("kind")
	if !store.IsKind(k) {
		httpx.Error(w, http.StatusNotFound, "not found")
		return "", false
	}
	return k, true
}

func (h *Handler) communityError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, store.ErrOwnItem) {
		httpx.ErrorCode(w, http.StatusConflict, "own_item", err.Error())
		return
	}
	h.storeError(w, r, err)
}

// SetVisibility handles PUT /v1/templates/{id}/visibility,
// /v1/saved-meals/{id}/visibility and /v1/routines/{id}/visibility.
func (h *Handler) SetVisibility(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var in struct {
			Visibility string `json:"visibility"`
		}
		if !decode(w, r, &in) {
			return
		}
		if !validVisibility(w, &in.Visibility) {
			return
		}
		userID := auth.UserID(r)
		c, ch, err := h.Store.SetVisibilityFirst(r.Context(), userID, kind, id, in.Visibility)
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		if ch.First {
			h.announceItem(context.WithoutCancel(r.Context()), userID, kind, id, ch.Name)
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"visibility": c.Visibility, "published_at": c.PublishedAt, "hidden": c.Hidden})
	}
}

// Shop handles GET /v1/shop?kind=routine|template|meal&sort=new|popular&q=&offset=.
func (h *Handler) Shop(w http.ResponseWriter, r *http.Request) {
	qs := r.URL.Query()
	q := store.ShopQuery{Kind: qs.Get("kind"), Sort: qs.Get("sort"), Q: strings.TrimSpace(qs.Get("q"))}
	if !store.IsKind(q.Kind) {
		badRequest(w, "kind must be routine, template or meal")
		return
	}
	if q.Sort == "" {
		q.Sort = "new"
	}
	if q.Sort != "new" && q.Sort != "popular" {
		badRequest(w, "sort must be new or popular")
		return
	}
	if utf8Len(q.Q) > 60 {
		q.Q = string([]rune(q.Q)[:60])
	}
	if v := qs.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 || n > 300 {
			badRequest(w, "offset must be between 0 and 300")
			return
		}
		q.Offset = n
	}
	items, more, err := h.Store.Shop(r.Context(), auth.UserID(r), q)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	var next *int
	if more && q.Offset+store.ShopPage <= 300 {
		n := q.Offset + store.ShopPage
		next = &n
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items, "next_offset": next})
}

// GetShopItem handles GET /v1/shop/{kind}/{id}.
func (h *Handler) GetShopItem(w http.ResponseWriter, r *http.Request) {
	kind, ok := pathKind(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	d, err := h.Store.GetShopItem(r.Context(), auth.UserID(r), kind, id, auth.RoleFrom(r) == auth.RoleAdmin)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, d)
}

// AddShopItem handles POST /v1/shop/{kind}/{id}/add: copy it into my account.
func (h *Handler) AddShopItem(w http.ResponseWriter, r *http.Request) {
	kind, ok := pathKind(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	ctx := r.Context()
	userID := auth.UserID(r)
	newID, err := h.Store.AddToMine(ctx, userID, kind, id)
	if err != nil {
		h.communityError(w, r, err)
		return
	}
	var out map[string]any
	switch kind {
	case "template":
		t, e := h.Store.GetTemplate(ctx, userID, newID)
		out, err = map[string]any{"template": t}, e
	case "meal":
		m, e := h.Store.GetSavedMeal(ctx, userID, newID)
		out, err = map[string]any{"saved_meal": m}, e
	case "routine":
		rt, e := h.Store.GetRoutine(ctx, userID, newID)
		out, err = map[string]any{"routine": rt}, e
	}
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, out)
}

// ReportShopItem handles POST /v1/shop/{kind}/{id}/report {reason, note?}.
func (h *Handler) ReportShopItem(w http.ResponseWriter, r *http.Request) {
	kind, ok := pathKind(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Reason string  `json:"reason"`
		Note   *string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !store.ReportReasons[in.Reason] {
		badRequest(w, "reason must be spam, offensive, unsafe or other")
		return
	}
	if in.Note != nil {
		n := strings.TrimSpace(*in.Note)
		if utf8Len(n) > 300 {
			badRequest(w, "note is limited to 300 characters")
			return
		}
		in.Note = &n
		if n == "" {
			in.Note = nil
		}
	}
	if err := h.Store.Report(r.Context(), auth.UserID(r), kind, id, in.Reason, in.Note); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{})
}

// GetPerson handles GET /v1/people/{id}: someone's profile and what they
// share with me.
func (h *Handler) GetPerson(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	v, err := h.Store.GetPerson(r.Context(), auth.UserID(r), id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	switch {
	case v.IsMe:
		wk, err := h.weekOf(r.Context(), id, true)
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		v.Summary = &wk
	case v.IsFriend:
		if v.Summary, err = h.sharedWeek(r.Context(), id); err != nil {
			h.storeError(w, r, err)
			return
		}
	}
	if v.IsMe || v.IsFriend {
		if err := h.personLive(r.Context(), auth.UserID(r), &v); err != nil {
			h.storeError(w, r, err)
			return
		}
	}
	httpx.JSON(w, http.StatusOK, v)
}
