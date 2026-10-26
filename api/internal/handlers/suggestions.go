package handlers

import (
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// Gap is what's most worth eating next: a nutrient you're short on today.
type Gap struct {
	Nutrient string        `json:"nutrient"` // protein | kcal
	Left     float64       `json:"left"`     // grams, or kcal
	Picks    []store.Entry `json:"picks"`    // your own past meals that would help and fit
}

// Suggestions handles GET /v1/suggestions?date=&meal_slot_id=: ideas for the
// meal being added.
func (h *Handler) Suggestions(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	qs := r.URL.Query()
	d := h.today(r.Context(), userID)
	if v := qs.Get("date"); v != "" {
		var err error
		if d, err = store.ParseDate(v); err != nil {
			badRequest(w, "date must be YYYY-MM-DD")
			return
		}
	}
	slot := qs.Get("meal_slot_id")
	if slot != "" && !isUUID(slot) {
		badRequest(w, "meal_slot_id is not valid")
		return
	}

	out := map[string]any{"again": []store.Entry{}, "again_date": nil, "usual": []store.Entry{}, "gap": nil}
	if slot != "" {
		again, on, err := h.Store.LastTimeInSlot(r.Context(), userID, slot, d)
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		out["again"] = again
		if len(again) > 0 {
			out["again_date"] = on
		}
		usual, err := h.Store.UsualInSlot(r.Context(), userID, slot, d, 6)
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		// Skip what's already in "again".
		seen := map[string]bool{}
		for _, e := range again {
			seen[strings.ToLower(e.Name)] = true
		}
		keep := []store.Entry{}
		for _, e := range usual {
			if !seen[strings.ToLower(e.Name)] && len(keep) < 4 {
				keep = append(keep, e)
			}
		}
		out["usual"] = keep
	}

	day, err := h.day(r.Context(), userID, d)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	kcalLeft := day.Target.Kcal - day.Totals.Kcal
	proteinLeft := day.Target.ProteinG - day.Totals.ProteinG
	switch {
	case kcalLeft < 120:
		// Close to target or over: no nudges to eat more.
	case proteinLeft >= math.Max(15, day.Target.ProteinG*0.2):
		picks, err := h.Store.RichIn(r.Context(), userID, "protein", kcalLeft+80, d, 3)
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		out["gap"] = Gap{Nutrient: "protein", Left: math.Round(proteinLeft), Picks: picks}
	case kcalLeft >= 350:
		out["gap"] = Gap{Nutrient: "kcal", Left: math.Round(kcalLeft), Picks: []store.Entry{}}
	}

	friends, err := h.Store.FriendMealsOn(r.Context(), userID, "", d, 6)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	out["friends"] = friends
	httpx.JSON(w, http.StatusOK, out)
}

// LogAgain handles POST /v1/entries/{id}/again {date, meal_slot_id?, meal_name?}:
// log one of your past meals again (same meal as before when neither is given).
// An id that is already the user's entry (an offline replay) returns it with 200.
func (h *Handler) LogAgain(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Date       *store.Date `json:"date"`
		MealSlotID *string     `json:"meal_slot_id"`
		MealName   *string     `json:"meal_name"`
		ID         *string     `json:"id"`        // the new entry's, offline
		LoggedAt   *time.Time  `json:"logged_at"` // offline
	}
	if !decode(w, r, &in) {
		return
	}
	userID := auth.UserID(r)
	d := h.today(r.Context(), userID)
	if in.Date != nil {
		d = *in.Date
	}
	if in.MealSlotID != nil && !isUUID(*in.MealSlotID) {
		badRequest(w, "meal_slot_id is not valid")
		return
	}
	if !clientIDs(w, in.ID) {
		return
	}
	if h.replayedEntry(w, r, userID, in.ID, nil) {
		return
	}
	now := h.now()
	e, err := h.Store.LogAgain(r.Context(), userID, id, d, in.MealSlotID, in.MealName,
		in.ID, clampTime(in.LoggedAt, now.Add(-entryLogWindow), now))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.withExtras(r.Context(), userID, &e)
	day, err := h.day(r.Context(), userID, d)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"entry": e, "day": day})
}
