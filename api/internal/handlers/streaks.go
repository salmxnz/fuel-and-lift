package handlers

import (
	"context"
	"fmt"
	"net/http"
	"slices"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// StreakProgress handles GET /v1/progress/streak.
func (h *Handler) StreakProgress(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	st, err := h.Store.Streak(r.Context(), userID, h.today(r.Context(), userID))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"streak": st})
}

// celebrateStreak runs after a meal is logged or a workout finished today.
// When the streak just reached a milestone (3, 7, 14… days) it posts to the
// friends feed once per streak, and pushes to friends if the user shares
// streaks.
func (h *Handler) celebrateStreak(ctx context.Context, userID string) {
	st, err := h.Store.Streak(ctx, userID, h.today(ctx, userID))
	if err != nil {
		h.Log.Error("streak", "err", err)
		return
	}
	if !st.ActiveToday || st.Since == nil || !slices.Contains(store.StreakMilestones, st.Current) {
		return
	}
	posted, err := h.Store.StreakPosted(ctx, userID, st.Current, *st.Since)
	if err != nil || posted {
		if err != nil {
			h.Log.Error("streak posted", "err", err)
		}
		return
	}
	text := fmt.Sprintf("is on a %d-day streak", st.Current)
	if _, err := h.Store.AddActivity(ctx, userID, "streak", text, map[string]any{"days": st.Current}, nil); err != nil {
		h.Log.Error("add streak activity", "err", err)
		return
	}
	sharing, err := h.Store.GetSharing(ctx, userID)
	if err != nil || !sharing.FoodStreaks {
		return
	}
	p, err := h.Store.GetProfile(ctx, userID)
	if err != nil {
		return
	}
	friends, err := h.Store.FriendsToNotifyOfWorkout(ctx, userID)
	if err != nil {
		h.Log.Error("friends to notify", "err", err)
		return
	}
	h.Notifier.Notify(friends, push.Message{
		Title: fmt.Sprintf("%s is on a %d-day streak 🔥", p.DisplayName, st.Current),
		Body:  "Send them a cheer.",
		URL:   "/friends",
		Tag:   "streak-" + userID,
	})
}
