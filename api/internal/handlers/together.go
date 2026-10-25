package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// personLive fills the live parts of a profile: the workout they have going,
// what they've eaten today (when they share meals) and their recent activity.
func (h *Handler) personLive(ctx context.Context, viewer string, v *store.PersonView) error {
	var err error
	if v.Training, err = h.Store.TrainingNow(ctx, viewer, v.Person.ID); err != nil {
		return err
	}
	if v.Activity, err = h.Store.ActivityOf(ctx, viewer, v.Person.ID, 12); err != nil {
		return err
	}
	if v.IsFriend {
		sh, err := h.Store.GetSharing(ctx, v.Person.ID)
		if err != nil {
			return err
		}
		if sh.Meals {
			if v.MealsToday, err = h.Store.FriendMealsOn(ctx, viewer, v.Person.ID, h.today(ctx, v.Person.ID), 20); err != nil {
				return err
			}
		}
		friends, err := h.Store.ListFriends(ctx, viewer)
		if err != nil {
			return err
		}
		for _, f := range friends {
			if f.ID == v.Person.ID {
				n := f.NotifyWorkouts
				v.NotifyWorkouts = &n
			}
		}
	}
	return nil
}

// announceTraining tells friends someone is at the gym: a "training now" feed
// item (gone once they finish) and a push to friends who want it.
func (h *Handler) announceTraining(ctx context.Context, userID string, s store.Session) {
	sharing, err := h.Store.GetSharing(ctx, userID)
	if err != nil || !sharing.TrainingNow {
		return
	}
	p, err := h.Store.GetProfile(ctx, userID)
	if err != nil {
		h.Log.Error("announce training", "err", err)
		return
	}
	what := "a workout"
	data := map[string]any{"session_id": s.ID}
	if s.TemplateName != nil {
		what = *s.TemplateName
		data["template"] = *s.TemplateName
	}
	sid := s.ID
	if _, err := h.Store.AddActivity(ctx, userID, "workout_started", "Training now: "+what, data, &sid); err != nil {
		h.Log.Error("add training activity", "err", err)
	}
	friends, err := h.Store.FriendIDsWanting(ctx, userID, "friend_training")
	if err != nil {
		h.Log.Error("friends to notify of training", "err", err)
		return
	}
	h.Notifier.Notify(friends, push.Message{
		Kind:  "friend_training",
		Title: p.DisplayName + " is at the gym 🏋️",
		Body:  "On " + what + " right now. Tap to train together.",
		URL:   "/people/" + userID,
		Tag:   "training-" + userID,
	})
}

// announceShared puts "shared …" in friends' feeds and pushes the friends who
// want it, at most once per tag.
func (h *Handler) announceShared(ctx context.Context, userID, what, url, tag string) {
	if what == "" {
		return
	}
	p, err := h.Store.GetProfile(ctx, userID)
	if err != nil {
		h.Log.Error("announce shared", "err", err)
		return
	}
	if _, err := h.Store.AddActivity(ctx, userID, "shared_item", "Shared "+what, map[string]any{"url": url}, nil); err != nil {
		h.Log.Error("add shared activity", "err", err)
	}
	if ok, err := h.Store.ClaimNotification(ctx, userID, "shared", tag); err != nil || !ok {
		return
	}
	friends, err := h.Store.FriendIDsWanting(ctx, userID, "friend_shares")
	if err != nil {
		h.Log.Error("friends to notify of share", "err", err)
		return
	}
	h.Notifier.Notify(friends, push.Message{
		Kind:  "friend_shared",
		Title: p.DisplayName + " shared " + what,
		Body:  "Have a look, and add it if you like it.",
		URL:   url,
		Tag:   "shared-" + userID,
	})
}

// announceItem tells friends about one newly shared item.
func (h *Handler) announceItem(ctx context.Context, userID, kind, id, name string) {
	label := map[string]string{"template": "a workout", "meal": "a meal", "routine": "a routine"}[kind]
	h.announceShared(ctx, userID, label+": "+name, "/shop/"+kind+"/"+id, kind+":"+id)
}

// JoinWorkout handles POST /v1/people/{id}/join-workout: start the workout
// that friend is doing right now, linked to theirs.
func (h *Handler) JoinWorkout(w http.ResponseWriter, r *http.Request) {
	friendID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := auth.UserID(r)
	if friendID == userID {
		httpx.Error(w, http.StatusNotFound, "not found")
		return
	}
	sess, _, err := h.Store.JoinWorkout(r.Context(), userID, friendID, h.today(r.Context(), userID))
	switch {
	case errors.Is(err, store.ErrInWorkout):
		httpx.ErrorCode(w, http.StatusConflict, "in_workout", "finish the workout you've got going first")
		return
	case errors.Is(err, store.ErrNotFound):
		httpx.ErrorCode(w, http.StatusNotFound, "not_training", "they're not training right now")
		return
	case err != nil:
		h.storeError(w, r, err)
		return
	}
	full, err := h.Store.GetSession(r.Context(), userID, sess.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if p, err := h.Store.GetProfile(r.Context(), userID); err == nil {
		if friends, err := h.Store.FriendIDsWanting(r.Context(), userID, "friend_training"); err == nil {
			for _, f := range friends {
				if f == friendID {
					h.Notifier.Notify([]string{friendID}, push.Message{
						Kind:  "training_joined",
						Title: p.DisplayName + " joined your workout 🤝",
						Body:  "You're training together. Keep each other honest.",
						URL:   "/gym",
						Tag:   "joined-" + userID,
					})
				}
			}
		}
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"session": full})
}

// SessionPartners handles GET /v1/sessions/{id}/partners.
func (h *Handler) SessionPartners(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	list, err := h.Store.SessionPartners(r.Context(), auth.UserID(r), id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"partners": list})
}
