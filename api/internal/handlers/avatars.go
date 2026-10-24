package handlers

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
)

// PutAvatar handles POST /v1/profile/avatar {media_type, data}: the user's own
// profile photo, base64 like meal photos. The app sends a small square JPEG.
func (h *Handler) PutAvatar(w http.ResponseWriter, r *http.Request) {
	var in struct {
		MediaType string `json:"media_type"`
		Data      string `json:"data"`
	}
	if err := httpx.DecodeLimit(w, r, &in, maxImageBytes*4/3+64<<10); err != nil {
		badRequest(w, "invalid body: "+err.Error())
		return
	}
	if !validImageTypes[in.MediaType] {
		badRequest(w, "media_type must be image/jpeg, image/png or image/webp")
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
	// The photo is served publicly, so trust what the bytes are, not the label.
	mediaType := http.DetectContentType(data)
	if !validImageTypes[mediaType] {
		badRequest(w, "that file isn't a JPEG, PNG or WebP image")
		return
	}
	userID := auth.UserID(r)
	url := fmt.Sprintf("%s/avatars/%s?v=%d", h.Cfg.AppURL, userID, h.now().Unix())
	u, err := h.Store.SetAvatar(r.Context(), userID, mediaType, data, url)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": u})
}

// DeleteAvatar handles DELETE /v1/profile/avatar: back to the Google picture.
func (h *Handler) DeleteAvatar(w http.ResponseWriter, r *http.Request) {
	u, err := h.Store.DeleteAvatar(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": u})
}

// Avatar handles GET /v1/avatars/{user_id} (no auth): an uploaded profile
// photo. URLs carry ?v=, so the bytes behind one never change.
func (h *Handler) Avatar(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "user_id")
	if !ok {
		return
	}
	a, err := h.Store.GetAvatar(r.Context(), id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", a.MediaType)
	w.Header().Set("Content-Length", strconv.Itoa(len(a.Data)))
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'")
	_, _ = w.Write(a.Data)
}
