package handlers

import (
	"context"
	"encoding/base64"
	"net/http"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// Progress photos are private: kept in R2 like meal photos, shown to their
// owner only through short-lived signed links, never shared.

// ListProgressPhotos handles GET /v1/progress/photos.
func (h *Handler) ListProgressPhotos(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListProgressPhotos(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	for i := range list {
		h.signProgressPhoto(&list[i])
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"photos": list, "enabled": h.Photos != nil, "limit": store.MaxProgressPhotos})
}

func (h *Handler) signProgressPhoto(p *store.ProgressPhoto) {
	if h.Photos != nil {
		p.URL = h.Photos.PresignGet(p.ObjectKey, h.Cfg.PhotoURLTTL)
	}
}

// AddProgressPhoto handles POST /v1/progress/photos {media_type, data, taken_on?, pose?}.
func (h *Handler) AddProgressPhoto(w http.ResponseWriter, r *http.Request) {
	var in struct {
		MediaType string      `json:"media_type"`
		Data      string      `json:"data"`
		TakenOn   *store.Date `json:"taken_on"`
		Pose      string      `json:"pose"`
	}
	if err := httpx.DecodeLimit(w, r, &in, maxImageBytes*4/3+64<<10); err != nil {
		badRequest(w, "invalid body: "+err.Error())
		return
	}
	if h.Photos == nil {
		httpx.ErrorCode(w, http.StatusServiceUnavailable, "photos_unavailable", "photo storage isn't set up on this server yet")
		return
	}
	if in.Pose == "" {
		in.Pose = "front"
	}
	if !store.ProgressPoses[in.Pose] {
		badRequest(w, "pose must be front, side, back or other")
		return
	}
	if base64.StdEncoding.DecodedLen(len(in.Data)) > maxImageBytes {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "that photo is over 2 MB — try a smaller one")
		return
	}
	data, err := base64.StdEncoding.DecodeString(in.Data)
	if err != nil || len(data) == 0 {
		badRequest(w, "data must be a base64 image")
		return
	}
	mediaType := http.DetectContentType(data)
	if !validImageTypes[mediaType] {
		badRequest(w, "that file isn't a JPEG, PNG or WebP image")
		return
	}
	userID := auth.UserID(r)
	ctx := r.Context()
	today := h.today(ctx, userID)
	d := today
	if in.TakenOn != nil {
		if in.TakenOn.After(today.Time) {
			badRequest(w, "taken_on can't be in the future")
			return
		}
		d = *in.TakenOn
	}
	n, err := h.Store.ProgressPhotoCount(ctx, userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if n >= store.MaxProgressPhotos {
		httpx.ErrorCode(w, http.StatusConflict, "photo_limit", "you've kept the most progress photos there's room for — delete a few first")
		return
	}
	key := "progress/" + userID + "/" + newObjectID() + photoExt[mediaType]
	if err := h.Photos.Put(ctx, key, mediaType, data); err != nil {
		h.Log.Error("store progress photo", "err", err)
		httpx.Error(w, http.StatusBadGateway, "couldn't save the photo — try again")
		return
	}
	p, err := h.Store.AddProgressPhoto(ctx, userID, d, in.Pose, key, mediaType, len(data))
	if err != nil {
		h.deleteObjects(context.WithoutCancel(ctx), []string{key})
		h.storeError(w, r, err)
		return
	}
	h.signProgressPhoto(&p)
	httpx.JSON(w, http.StatusCreated, map[string]any{"photo": p})
}

// DeleteProgressPhoto handles DELETE /v1/progress/photos/{id}.
func (h *Handler) DeleteProgressPhoto(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	key, err := h.Store.DeleteProgressPhoto(r.Context(), auth.UserID(r), id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.deleteObjects(context.WithoutCancel(r.Context()), []string{key})
	httpx.NoContent(w)
}
