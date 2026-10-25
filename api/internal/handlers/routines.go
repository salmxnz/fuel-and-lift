package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

type routineBody struct {
	Name        string             `json:"name"`
	Description *string            `json:"description"`
	Visibility  *string            `json:"visibility"` // creating only
	Days        map[string]*string `json:"days"`
}

// checkRoutine validates a routine body, returning a message when it's bad.
func checkRoutine(in routineBody) (store.RoutineInput, string) {
	name, ok := cleanName(in.Name, 40)
	if !ok {
		return store.RoutineInput{}, "name is required (up to 40 characters)"
	}
	out := store.RoutineInput{Name: name, Visibility: in.Visibility, Days: map[string]*string{}}
	if in.Description != nil {
		d := strings.TrimSpace(*in.Description)
		if utf8Len(d) > 200 {
			return out, "description is limited to 200 characters"
		}
		if d != "" {
			out.Description = &d
		}
	}
	for k, v := range in.Days {
		if _, ok := parseDays([]string{k}); !ok {
			return out, `days are keyed by weekday: "mon" to "sun"`
		}
		if v != nil && *v != "" && !isUUID(*v) {
			return out, "days must be ids of your workouts"
		}
		out.Days[k] = v
	}
	return out, ""
}

func (h *Handler) routineError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, store.ErrEmptyRoutine) {
		badRequest(w, err.Error())
		return
	}
	h.storeError(w, r, err)
}

// ListRoutines handles GET /v1/routines.
func (h *Handler) ListRoutines(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListRoutines(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"routines": list})
}

// GetRoutine handles GET /v1/routines/{id}.
func (h *Handler) GetRoutine(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	rt, err := h.Store.GetRoutine(r.Context(), auth.UserID(r), id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"routine": rt})
}

// SaveRoutine handles POST /v1/routines and PUT /v1/routines/{id}.
func (h *Handler) SaveRoutine(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id != "" && !isUUID(id) {
		httpx.Error(w, http.StatusNotFound, "not found")
		return
	}
	var in routineBody
	if !decode(w, r, &in) {
		return
	}
	if !validVisibility(w, in.Visibility) {
		return
	}
	body, msg := checkRoutine(in)
	if msg != "" {
		badRequest(w, msg)
		return
	}
	userID := auth.UserID(r)
	if id != "" {
		body.Visibility = nil
	} else if body.Visibility == nil {
		d := h.Store.DefaultVisibility(r.Context(), userID) // left out: the user's default
		body.Visibility = &d
	}
	rt, err := h.Store.SaveRoutine(r.Context(), userID, id, body)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	status := http.StatusOK
	if id == "" {
		status = http.StatusCreated
		if *body.Visibility != "private" {
			h.announceItem(context.WithoutCancel(r.Context()), userID, "routine", rt.ID, rt.Name)
		}
	}
	httpx.JSON(w, status, map[string]any{"routine": rt})
}

// DeleteRoutine handles DELETE /v1/routines/{id}.
func (h *Handler) DeleteRoutine(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.ArchiveRoutine(r.Context(), auth.UserID(r), id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}

// ApplyRoutine handles POST /v1/routines/{id}/apply: the routine becomes the
// user's week.
func (h *Handler) ApplyRoutine(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	days, err := h.Store.ApplyRoutine(r.Context(), auth.UserID(r), id)
	if err != nil {
		h.routineError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"days": days})
}

// ShareRoutine handles POST /v1/routines/{id}/share {friend_ids}.
func (h *Handler) ShareRoutine(w http.ResponseWriter, r *http.Request) {
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
	rt, err := h.Store.ShareRoutine(r.Context(), userID, id, ids)
	if err != nil {
		h.shareError(w, r, err)
		return
	}
	if me, err := h.Store.GetProfile(r.Context(), userID); err == nil {
		n := 0
		for _, d := range rt.Days {
			if d != nil {
				n++
			}
		}
		h.Notifier.Notify(ids, push.Message{
			Kind:  "routine_shared",
			Title: me.DisplayName + " shared a routine with you",
			Body:  fmt.Sprintf("%s · %d day%s a week", rt.Name, n, plural(n)),
			URL:   "/gym", Tag: "share-" + id,
		})
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"shared_with": len(ids)})
}
