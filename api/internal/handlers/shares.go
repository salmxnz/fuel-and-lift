package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// maxShareFriends caps one share (a meal split 11 ways is already a party).
const maxShareFriends = 10

// friendIDs reads and de-duplicates {"friend_ids": [...]}, writing a 400 when
// it's empty, too long or holds a bad id.
func friendIDs(w http.ResponseWriter, ids []string, self string) ([]string, bool) {
	seen := map[string]bool{}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if !isUUID(id) || id == self {
			badRequest(w, "friend_ids must be ids of your friends")
			return nil, false
		}
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	if len(out) == 0 || len(out) > maxShareFriends {
		badRequest(w, fmt.Sprintf("pick 1 to %d friends", maxShareFriends))
		return nil, false
	}
	return out, true
}

func (h *Handler) shareError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, store.ErrNotFriends):
		httpx.ErrorCode(w, http.StatusForbidden, "not_friends", err.Error())
	case errors.Is(err, store.ErrAlreadySplit):
		httpx.ErrorCode(w, http.StatusConflict, "already_split", err.Error())
	default:
		h.storeError(w, r, err)
	}
}

// ShareEntry handles POST /v1/entries/{id}/share {friend_ids, split}.
func (h *Handler) ShareEntry(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		FriendIDs []string `json:"friend_ids"`
		Split     bool     `json:"split"`
	}
	if !decode(w, r, &in) {
		return
	}
	userID := auth.UserID(r)
	ids, ok := friendIDs(w, in.FriendIDs, userID)
	if !ok {
		return
	}
	ctx := r.Context()
	e, err := h.Store.ShareMeal(ctx, userID, id, ids, in.Split)
	if err != nil {
		h.shareError(w, r, err)
		return
	}
	h.withExtras(ctx, userID, &e)
	day, err := h.day(ctx, userID, e.Date)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if me, err := h.Store.GetProfile(ctx, userID); err == nil {
		title := me.DisplayName + " shared " + e.Name + " with you"
		if in.Split {
			title = me.DisplayName + " split " + e.Name + " with you"
		}
		h.Notifier.Notify(ids, push.Message{
			Kind:  "meal_shared",
			Title: title,
			Body:  fmt.Sprintf("%.0f kcal. Add it to your day?", e.Kcal),
			URL:   "/today", Tag: "share-" + id,
		})
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"entry": e, "day": day, "shared_with": len(ids)})
}

// ShareTemplate handles POST /v1/templates/{id}/share {friend_ids}.
func (h *Handler) ShareTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		FriendIDs []string `json:"friend_ids"`
	}
	if !decode(w, r, &in) {
		return
	}
	userID := auth.UserID(r)
	ids, ok := friendIDs(w, in.FriendIDs, userID)
	if !ok {
		return
	}
	t, err := h.Store.ShareTemplate(r.Context(), userID, id, ids)
	if err != nil {
		h.shareError(w, r, err)
		return
	}
	if me, err := h.Store.GetProfile(r.Context(), userID); err == nil {
		n := len(t.Blocks)
		h.Notifier.Notify(ids, push.Message{
			Kind:  "template_shared",
			Title: me.DisplayName + " shared a workout with you",
			Body:  fmt.Sprintf("%s · %d exercise%s", t.Name, n, plural(n)),
			URL:   "/gym", Tag: "share-" + id,
		})
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"shared_with": len(ids)})
}

// ListShares handles GET /v1/shares?kind=meal|template|routine: what friends
// sent that's still waiting for an answer.
func (h *Handler) ListShares(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	if kind != "" && kind != "meal" && kind != "template" && kind != "routine" {
		badRequest(w, "kind must be meal, template or routine")
		return
	}
	list, err := h.Store.IncomingShares(r.Context(), auth.UserID(r), kind)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"shares": list})
}

// shareHistoryPage is how many items one page of share history holds.
const shareHistoryPage = 30

// ListShareHistory handles GET /v1/shares/history?direction=received|sent&before=<RFC 3339 time>.
func (h *Handler) ListShareHistory(w http.ResponseWriter, r *http.Request) {
	direction := r.URL.Query().Get("direction")
	if direction == "" {
		direction = "received"
	}
	if direction != "received" && direction != "sent" {
		badRequest(w, "direction must be received or sent")
		return
	}
	var before *time.Time
	if v := r.URL.Query().Get("before"); v != "" {
		t, err := time.Parse(time.RFC3339Nano, v)
		if err != nil {
			badRequest(w, "before must be an RFC 3339 time")
			return
		}
		before = &t
	}
	items, err := h.Store.ShareHistory(r.Context(), auth.UserID(r), direction, before, shareHistoryPage)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items})
}

// AcceptShare handles POST /v1/shares/{id}/accept. A meal takes
// {meal_slot_id | meal_name, date?} (date defaults to the day it was eaten,
// never later than the user's today); a template or routine takes {}.
func (h *Handler) AcceptShare(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		MealSlotID *string     `json:"meal_slot_id"`
		MealName   *string     `json:"meal_name"`
		Date       *store.Date `json:"date"`
	}
	if !decode(w, r, &in) {
		return
	}
	userID := auth.UserID(r)
	ctx := r.Context()
	kind, eaten, err := h.Store.ShareKind(ctx, userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if kind == "template" {
		t, err := h.Store.AcceptTemplateShare(ctx, userID, id)
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, map[string]any{"template": t})
		return
	}
	if kind == "routine" {
		rt, err := h.Store.AcceptRoutineShare(ctx, userID, id)
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, map[string]any{"routine": rt})
		return
	}

	if in.MealSlotID != nil && !isUUID(*in.MealSlotID) {
		badRequest(w, "meal_slot_id is not valid")
		return
	}
	if in.MealName != nil {
		mn, ok := cleanName(*in.MealName, 30)
		if !ok {
			badRequest(w, "meal_name must be 1 to 30 characters")
			return
		}
		in.MealName = &mn
	}
	today := h.today(ctx, userID)
	d := eaten
	if in.Date != nil && !in.Date.IsZero() {
		d = *in.Date
	}
	if d.IsZero() || d.After(today.Time) {
		d = today
	}
	e, err := h.Store.AcceptMealShare(ctx, userID, id, d, in.MealSlotID, in.MealName)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.withExtras(ctx, userID, &e)
	day, err := h.day(ctx, userID, d)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if d == today {
		h.celebrateStreak(context.WithoutCancel(ctx), userID)
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"entry": e, "day": day})
}

// DeclineShare handles DELETE /v1/shares/{id}.
func (h *Handler) DeclineShare(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.DeclineShare(r.Context(), auth.UserID(r), id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}
