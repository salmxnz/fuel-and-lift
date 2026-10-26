package handlers

import (
	"context"
	"encoding/base64"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/salmxnz/fuel-and-lift/api/internal/ai"
	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// Feedback: people send it from Me → Feedback (with up to 3 screenshots,
// kept in R2), see their own, and admins triage it in the admin app.

const maxFeedbackPhotos = 3

func (h *Handler) signFeedback(list []store.Feedback) {
	if h.Photos == nil {
		return
	}
	for i := range list {
		for j := range list[i].Photos {
			list[i].Photos[j].URL = h.Photos.PresignGet(list[i].Photos[j].ObjectKey, h.Cfg.PhotoURLTTL)
		}
	}
}

// SendFeedback handles POST /v1/feedback {kind?, message, page?, images?}.
func (h *Handler) SendFeedback(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind    string     `json:"kind"`
		Message string     `json:"message"`
		Page    *string    `json:"page"`
		Images  []ai.Image `json:"images"`
	}
	if err := httpx.DecodeLimit(w, r, &in, maxFeedbackPhotos*(maxImageBytes*4/3+1024)+64<<10); err != nil {
		badRequest(w, "invalid body: "+err.Error())
		return
	}
	in.Message = strings.TrimSpace(in.Message)
	if in.Message == "" || utf8.RuneCountInString(in.Message) > 2000 {
		badRequest(w, "write what happened or what you'd like (up to 2000 characters)")
		return
	}
	if in.Kind == "" {
		in.Kind = "other"
	}
	if !store.FeedbackKinds[in.Kind] {
		badRequest(w, "kind must be bug, idea or other")
		return
	}
	if in.Page != nil {
		p := ai.Clip(*in.Page, 200)
		in.Page = &p
	}
	if len(in.Images) > maxFeedbackPhotos {
		badRequest(w, "attach at most 3 images")
		return
	}
	if !checkImages(w, in.Images) {
		return
	}
	if len(in.Images) > 0 && h.Photos == nil {
		httpx.ErrorCode(w, http.StatusServiceUnavailable, "photos_unavailable", "image uploads aren't set up on this server yet — send it without the image")
		return
	}
	userID := auth.UserID(r)
	ctx := r.Context()

	var photos []store.NewFeedbackPhoto
	var keys []string
	for _, img := range in.Images {
		data, _ := base64.StdEncoding.DecodeString(img.Data)
		mediaType := http.DetectContentType(data)
		if !validImageTypes[mediaType] {
			h.deleteObjects(context.WithoutCancel(ctx), keys)
			badRequest(w, "attachments must be JPEG, PNG or WebP images")
			return
		}
		key := "feedback/" + userID + "/" + newObjectID() + photoExt[mediaType]
		if err := h.Photos.Put(ctx, key, mediaType, data); err != nil {
			h.Log.Error("store feedback image", "err", err)
			h.deleteObjects(context.WithoutCancel(ctx), keys)
			httpx.Error(w, http.StatusBadGateway, "couldn't save the image — try again")
			return
		}
		keys = append(keys, key)
		photos = append(photos, store.NewFeedbackPhoto{ObjectKey: key, ContentType: mediaType, Bytes: len(data)})
	}
	var ua *string
	if v := r.Header.Get("User-Agent"); v != "" {
		v = ai.Clip(v, 300)
		ua = &v
	}
	id, err := h.Store.AddFeedback(ctx, userID, store.Feedback{Kind: in.Kind, Message: in.Message, Page: in.Page, UserAgent: ua}, photos)
	if err != nil {
		h.deleteObjects(context.WithoutCancel(ctx), keys)
		h.storeError(w, r, err)
		return
	}
	f, err := h.Store.GetFeedback(ctx, userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	f.User, f.UserAgent = nil, nil
	h.signFeedback([]store.Feedback{f})
	h.tellAdmins(context.WithoutCancel(ctx), userID, f)
	httpx.JSON(w, http.StatusCreated, map[string]any{"feedback": f})
}

// tellAdmins pushes new feedback to the admins (but not the sender).
func (h *Handler) tellAdmins(ctx context.Context, from string, f store.Feedback) {
	ids, err := h.Store.AdminIDs(ctx)
	if err != nil {
		h.Log.Error("feedback: admins", "err", err)
		return
	}
	var to []string
	for _, id := range ids {
		if id != from {
			to = append(to, id)
		}
	}
	name := "Someone"
	if p, err := h.Store.GetProfile(ctx, from); err == nil && p.DisplayName != "" {
		name = p.DisplayName
	}
	what := map[string]string{"bug": "a bug", "idea": "an idea", "other": "feedback"}[f.Kind]
	h.Notifier.Notify(to, push.Message{
		Kind:  "feedback",
		Title: name + " sent " + what,
		Body:  ai.Clip(f.Message, 120),
		URL:   "/feedback",
		Tag:   "feedback-" + strconv.FormatInt(f.ID, 10),
	})
}

// ListMyFeedback handles GET /v1/feedback: what the user sent, newest first.
func (h *Handler) ListMyFeedback(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListFeedback(r.Context(), store.FeedbackFilter{UserID: auth.UserID(r), Limit: 200})
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	for i := range list {
		list[i].User, list[i].UserAgent = nil, nil
	}
	h.signFeedback(list)
	httpx.JSON(w, http.StatusOK, map[string]any{"feedback": list})
}

// ListAdminFeedback handles GET /v1/admin/feedback?status=&kind=&user_id=&before=&limit=.
func (h *Handler) ListAdminFeedback(w http.ResponseWriter, r *http.Request) {
	before, limit, ok := pageParams(w, r, 50)
	if !ok {
		return
	}
	userID, ok := queryUserID(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	f := store.FeedbackFilter{UserID: userID, Status: q.Get("status"), Kind: q.Get("kind"), Before: before, Limit: limit + 1}
	if (f.Status != "" && !store.FeedbackStatuses[f.Status]) || (f.Kind != "" && !store.FeedbackKinds[f.Kind]) {
		badRequest(w, "status must be new, seen or done; kind bug, idea or other")
		return
	}
	list, err := h.Store.ListFeedback(r.Context(), f)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	var next *int64
	if len(list) > limit {
		list = list[:limit]
		n := list[limit-1].ID
		next = &n
	}
	counts, err := h.Store.FeedbackCounts(r.Context())
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.signFeedback(list)
	httpx.JSON(w, http.StatusOK, map[string]any{"feedback": list, "next_before": next, "counts": counts})
}

// PatchAdminFeedback handles PATCH /v1/admin/feedback/{id} {status?, admin_note?}.
func (h *Handler) PatchAdminFeedback(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id < 1 {
		httpx.Error(w, http.StatusNotFound, "that feedback doesn't exist")
		return
	}
	var in struct {
		Status    *string `json:"status"`
		AdminNote *string `json:"admin_note"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Status != nil && !store.FeedbackStatuses[*in.Status] {
		badRequest(w, "status must be new, seen or done")
		return
	}
	if in.AdminNote != nil {
		n := strings.TrimSpace(*in.AdminNote)
		if utf8.RuneCountInString(n) > 1000 {
			badRequest(w, "the note is limited to 1000 characters")
			return
		}
		in.AdminNote = &n
	}
	if err := h.Store.UpdateFeedback(r.Context(), id, in.Status, in.AdminNote); err != nil {
		h.storeError(w, r, err)
		return
	}
	f, err := h.Store.GetFeedback(r.Context(), "", id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.signFeedback([]store.Feedback{f})
	httpx.JSON(w, http.StatusOK, map[string]any{"feedback": f})
}
