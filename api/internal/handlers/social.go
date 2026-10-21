package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

const maxOpenLinks = 20

// --- invite links ------------------------------------------------------------------

// CreateInviteLink handles POST /v1/invite-links. The raw token is only ever
// in this response; the database keeps its hash.
func (h *Handler) CreateInviteLink(w http.ResponseWriter, r *http.Request) {
	var in struct{}
	if !decode(w, r, &in) {
		return
	}
	userID := auth.UserID(r)
	links, err := h.Store.ListInviteLinks(r.Context(), userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	open := 0
	for _, l := range links {
		if l.Status == "open" {
			open++
		}
	}
	if open >= maxOpenLinks {
		httpx.ErrorCode(w, http.StatusTooManyRequests, "too_many_links", "you have 20 unused links — share or revoke some first")
		return
	}
	token, err := auth.RandomToken(24)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	l, err := h.Store.CreateInviteLink(r.Context(), userID, auth.HashToken(token))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	l.URL = h.Cfg.AppURL + "/join/" + token
	httpx.JSON(w, http.StatusCreated, map[string]any{"invite_link": l})
}

// ListInviteLinks handles GET /v1/invite-links.
func (h *Handler) ListInviteLinks(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	links, err := h.Store.ListInviteLinks(r.Context(), userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if links == nil {
		links = []store.InviteLink{}
	}
	joined, err := h.Store.ReferralCount(r.Context(), userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"invite_links": links,
		"referrals":    map[string]int{"joined": joined, "needed": h.Cfg.ReferralsForPro},
	})
}

// RevokeInviteLink handles DELETE /v1/invite-links/{id}.
func (h *Handler) RevokeInviteLink(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.RevokeInviteLink(r.Context(), auth.UserID(r), id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}

func cleanToken(t string) (string, bool) {
	t = strings.TrimSpace(t)
	return t, len(t) >= 16 && len(t) <= 100
}

// PreviewInviteLink handles GET /v1/invite-links/preview/{token} (no auth):
// the join page shows who invited you before you sign in.
func (h *Handler) PreviewInviteLink(w http.ResponseWriter, r *http.Request) {
	token, ok := cleanToken(r.PathValue("token"))
	if !ok {
		httpx.Error(w, http.StatusNotFound, "that link doesn't exist")
		return
	}
	p, err := h.Store.PreviewInviteLink(r.Context(), auth.HashToken(token))
	if errors.Is(err, store.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, "that link doesn't exist")
		return
	}
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	// Only the name and picture: the preview is public.
	httpx.JSON(w, http.StatusOK, map[string]any{
		"inviter": map[string]any{"name": p.Inviter.Name, "avatar_url": p.Inviter.AvatarURL},
		"valid":   p.Valid,
	})
}

// AcceptInviteLink handles POST /v1/invite-links/accept {token}: a signed-in
// user opening a friend's link. Already being friends leaves the link unused.
func (h *Handler) AcceptInviteLink(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if !decode(w, r, &in) {
		return
	}
	token, ok := cleanToken(in.Token)
	if !ok {
		httpx.ErrorCode(w, http.StatusGone, "invite_invalid", store.ErrInviteInvalid.Error())
		return
	}
	userID := auth.UserID(r)
	ctx := r.Context()
	hash := auth.HashToken(token)
	prev, err := h.Store.PreviewInviteLink(ctx, hash)
	if errors.Is(err, store.ErrNotFound) {
		httpx.ErrorCode(w, http.StatusGone, "invite_invalid", store.ErrInviteInvalid.Error())
		return
	}
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if prev.Inviter.ID == userID {
		httpx.ErrorCode(w, http.StatusConflict, "own_link", "that's your own link — send it to a friend")
		return
	}
	friends, err := h.Store.AreFriends(ctx, userID, prev.Inviter.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if !friends {
		if _, err := h.Store.AcceptInviteLink(ctx, hash, userID); err != nil {
			if errors.Is(err, store.ErrInviteInvalid) {
				httpx.ErrorCode(w, http.StatusGone, "invite_invalid", store.ErrInviteInvalid.Error())
				return
			}
			h.storeError(w, r, err)
			return
		}
		if me, err := h.Store.GetProfile(ctx, userID); err == nil {
			h.Notifier.Notify([]string{prev.Inviter.ID}, push.Message{
				Title: me.DisplayName + " is your friend now",
				Body:  "They opened your Fuel & Lift link.",
				URL:   "/friends", Tag: "friend-" + userID,
			})
		}
	}
	friend, err := h.friend(r, userID, prev.Inviter.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	b, err := h.billing(ctx, userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"friend": friend, "billing": b, "already_friends": friends})
}

// --- friends -----------------------------------------------------------------------

func (h *Handler) friend(r *http.Request, userID, friendID string) (store.Friend, error) {
	list, err := h.Store.ListFriends(r.Context(), userID)
	if err != nil {
		return store.Friend{}, err
	}
	for _, f := range list {
		if f.ID == friendID {
			return f, nil
		}
	}
	return store.Friend{}, store.ErrNotFound
}

// ListFriends handles GET /v1/friends.
func (h *Handler) ListFriends(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListFriends(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if list == nil {
		list = []store.Friend{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"friends": list})
}

// RemoveFriend handles DELETE /v1/friends/{user_id}.
func (h *Handler) RemoveFriend(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "user_id")
	if !ok {
		return
	}
	if err := h.Store.RemoveFriend(r.Context(), auth.UserID(r), id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}

// PatchFriend handles PATCH /v1/friends/{user_id} {notify_workouts}.
func (h *Handler) PatchFriend(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "user_id")
	if !ok {
		return
	}
	var in struct {
		NotifyWorkouts *bool `json:"notify_workouts"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.NotifyWorkouts == nil {
		badRequest(w, "notify_workouts is required")
		return
	}
	userID := auth.UserID(r)
	if err := h.Store.SetFriendNotify(r.Context(), userID, id, *in.NotifyWorkouts); err != nil {
		h.storeError(w, r, err)
		return
	}
	f, err := h.friend(r, userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"friend": f})
}

// --- sharing -----------------------------------------------------------------------

// GetSharing handles GET /v1/sharing.
func (h *Handler) GetSharing(w http.ResponseWriter, r *http.Request) {
	s, err := h.Store.GetSharing(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"sharing": s})
}

// PutSharing handles PUT /v1/sharing.
func (h *Handler) PutSharing(w http.ResponseWriter, r *http.Request) {
	var in store.Sharing
	if !decode(w, r, &in) {
		return
	}
	if err := h.Store.PutSharing(r.Context(), auth.UserID(r), in); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"sharing": in})
}

// --- feed --------------------------------------------------------------------------

// Feed handles GET /v1/feed?before=RFC3339.
func (h *Handler) Feed(w http.ResponseWriter, r *http.Request) {
	var before time.Time
	if v := r.URL.Query().Get("before"); v != "" {
		t, err := time.Parse(time.RFC3339Nano, v)
		if err != nil {
			badRequest(w, "before must be an RFC 3339 time")
			return
		}
		before = t
	}
	items, err := h.Store.Feed(r.Context(), auth.UserID(r), before)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items})
}

// Cheer handles POST and DELETE /v1/feed/{id}/cheer.
func (h *Handler) Cheer(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := auth.UserID(r)
	item, notify, err := h.Store.SetCheer(r.Context(), userID, id, r.Method == http.MethodPost)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if notify != "" && h.Store.WantsCheers(r.Context(), notify) {
		if me, err := h.Store.GetProfile(r.Context(), userID); err == nil {
			h.Notifier.Notify([]string{notify}, push.Message{
				Title: me.DisplayName + " cheered you on 🙌",
				Body:  item.Text,
				URL:   "/friends", Tag: "cheer-" + id,
			})
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"item": item})
}

// --- push and notification preferences --------------------------------------------

// VAPIDPublicKey handles GET /v1/push/vapid-public-key (no auth).
func (h *Handler) VAPIDPublicKey(w http.ResponseWriter, r *http.Request) {
	if !h.Cfg.PushConfigured() {
		httpx.ErrorCode(w, http.StatusServiceUnavailable, "push_unavailable", "push notifications aren't set up on this server")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"key": h.Cfg.VAPIDPublicKey})
}

// Subscribe handles POST /v1/push/subscriptions.
func (h *Handler) Subscribe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
		UserAgent      string `json:"user_agent"`
		ExpirationTime *int64 `json:"expirationTime"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !strings.HasPrefix(in.Endpoint, "https://") || len(in.Endpoint) > 1000 {
		badRequest(w, "endpoint must be an https URL")
		return
	}
	if in.Keys.P256dh == "" || in.Keys.Auth == "" || len(in.Keys.P256dh) > 200 || len(in.Keys.Auth) > 100 {
		badRequest(w, "keys.p256dh and keys.auth are required")
		return
	}
	ua := in.UserAgent
	if ua == "" {
		ua = userAgent(r)
	}
	if len(ua) > 300 {
		ua = ua[:300]
	}
	if err := h.Store.SavePushSubscription(r.Context(), auth.UserID(r), in.Endpoint, in.Keys.P256dh, in.Keys.Auth, ua); err != nil {
		h.storeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// Unsubscribe handles DELETE /v1/push/subscriptions {endpoint}.
func (h *Handler) Unsubscribe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint string `json:"endpoint"`
	}
	if !decode(w, r, &in) {
		return
	}
	if err := h.Store.DeletePushSubscription(r.Context(), auth.UserID(r), in.Endpoint); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}

// GetNotificationPrefs handles GET /v1/notification-prefs.
func (h *Handler) GetNotificationPrefs(w http.ResponseWriter, r *http.Request) {
	p, err := h.Store.GetNotificationPrefs(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"prefs": p})
}

func validClock(s *string) bool {
	if s == nil {
		return true
	}
	_, err := time.Parse("15:04", *s)
	return err == nil
}

// PutNotificationPrefs handles PUT /v1/notification-prefs.
func (h *Handler) PutNotificationPrefs(w http.ResponseWriter, r *http.Request) {
	var in store.NotificationPrefs
	if !decode(w, r, &in) {
		return
	}
	if !validClock(in.QuietFrom) || !validClock(in.QuietTo) {
		badRequest(w, `quiet_from and quiet_to are times like "22:00"`)
		return
	}
	if (in.QuietFrom == nil) != (in.QuietTo == nil) {
		badRequest(w, "set both quiet_from and quiet_to, or neither")
		return
	}
	if err := h.Store.PutNotificationPrefs(r.Context(), auth.UserID(r), in); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"prefs": in})
}

// --- admin -------------------------------------------------------------------------

// ListEmailInvites handles GET /v1/admin/invites.
func (h *Handler) ListEmailInvites(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListEmailInvites(r.Context())
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"invites": list})
}

// CreateEmailInvite handles POST /v1/admin/invites {email}.
func (h *Handler) CreateEmailInvite(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &in) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	at := strings.LastIndexByte(email, '@')
	if at < 1 || at == len(email)-1 || len(email) > 254 || strings.ContainsAny(email, " \t\r\n") {
		badRequest(w, "that doesn't look like an email address")
		return
	}
	inv, err := h.Store.CreateEmailInvite(r.Context(), email, auth.UserID(r))
	if errors.Is(err, store.ErrConflict) {
		httpx.Error(w, http.StatusConflict, "that email is already invited")
		return
	}
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"invite": inv})
}

// DeleteEmailInvite handles DELETE /v1/admin/invites/{id}.
func (h *Handler) DeleteEmailInvite(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.DeleteEmailInvite(r.Context(), id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}
