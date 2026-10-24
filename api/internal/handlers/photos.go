package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/ai"
	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

var photoExt = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

func newObjectID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// keepEstimatePhotos uploads an estimate's photos to storage as pending:
// they're attached when the meal is logged, else cleaned up after a day.
// Storage problems are logged and never fail the estimate.
func (h *Handler) keepEstimatePhotos(ctx context.Context, userID, estimateID string, images []ai.Image) {
	if h.Photos == nil || len(images) == 0 {
		return
	}
	var wg sync.WaitGroup
	for i, img := range images {
		wg.Add(1)
		go func(i int, img ai.Image) {
			defer wg.Done()
			body, err := base64.StdEncoding.DecodeString(img.Data)
			if err != nil {
				return
			}
			key := "photos/" + userID + "/" + newObjectID() + photoExt[img.MediaType]
			if err := h.Photos.Put(ctx, key, img.MediaType, body); err != nil {
				h.Log.Warn("store meal photo", "err", err)
				return
			}
			if err := h.Store.AddPendingPhoto(ctx, userID, estimateID, key, img.MediaType, i, len(body)); err != nil {
				h.Log.Error("record meal photo", "err", err)
				_ = h.Photos.Delete(ctx, key)
			}
		}(i, img)
	}
	wg.Wait()
}

// photoLimit is how many photos the user may keep (nil = unlimited, Pro).
func (h *Handler) photoLimit(ctx context.Context, userID string) (*int, error) {
	u, err := h.Store.GetUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u.IsPro(h.now()) {
		return nil, nil
	}
	n := h.Cfg.FreePhotosStored
	return &n, nil
}

// attachPhotos keeps a logged meal's photos while there's room, and returns
// how many didn't fit.
func (h *Handler) attachPhotos(ctx context.Context, userID, estimateID, entryID string) int {
	if h.Photos == nil {
		return 0
	}
	limit, err := h.photoLimit(ctx, userID)
	if err != nil {
		h.Log.Error("photo limit", "err", err)
		return 0
	}
	_, dropped, err := h.Store.AttachPhotos(ctx, userID, estimateID, entryID, limit)
	if err != nil {
		h.Log.Error("attach photos", "err", err)
		return 0
	}
	h.deleteObjects(ctx, dropped)
	return len(dropped)
}

func (h *Handler) deleteObjects(ctx context.Context, keys []string) {
	if h.Photos == nil {
		return
	}
	for _, k := range keys {
		if err := h.Photos.Delete(ctx, k); err != nil {
			h.Log.Warn("delete meal photo", "key", k, "err", err)
		}
	}
}

func (h *Handler) signPhoto(p *store.MealPhoto) {
	if h.Photos != nil {
		p.URL = h.Photos.PresignGet(p.ObjectKey, h.Cfg.PhotoURLTTL)
	}
}

// withExtras fills in what entries carry beyond their row: who each was
// shared with (and how many ways it was split) and its photos, with signed links.
func (h *Handler) withExtras(ctx context.Context, userID string, entries ...*store.Entry) {
	ids := make([]string, 0, len(entries))
	for _, e := range entries {
		e.Photos = []store.MealPhoto{}
		e.SharedWith = []store.EntryShare{}
		ids = append(ids, e.ID)
	}
	if len(ids) == 0 {
		return
	}
	if shared, ways, err := h.Store.SharesForEntries(ctx, userID, ids); err != nil {
		h.Log.Error("entry shares", "err", err)
	} else {
		for _, e := range entries {
			if list := shared[e.ID]; list != nil {
				e.SharedWith = list
			}
			if n, ok := ways[e.ID]; ok {
				e.SplitWays = &n
			}
		}
	}
	if h.Photos == nil {
		return
	}
	byEntry, err := h.Store.PhotosForEntries(ctx, userID, ids)
	if err != nil {
		h.Log.Error("entry photos", "err", err)
		return
	}
	for _, e := range entries {
		for _, p := range byEntry[e.ID] {
			h.signPhoto(&p)
			e.Photos = append(e.Photos, p)
		}
	}
}

func dayEntries(d *store.Day) []*store.Entry {
	var out []*store.Entry
	for i := range d.Meals {
		for j := range d.Meals[i].Entries {
			out = append(out, &d.Meals[i].Entries[j])
		}
	}
	return out
}

// ListPhotos handles GET /v1/photos?before=<RFC 3339 time>.
func (h *Handler) ListPhotos(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	var before *time.Time
	if v := r.URL.Query().Get("before"); v != "" {
		t, err := time.Parse(time.RFC3339Nano, v)
		if err != nil {
			badRequest(w, "before must be an RFC 3339 time")
			return
		}
		before = &t
	}
	limit := 60
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 120 {
		limit = v
	}
	list, err := h.Store.ListPhotos(r.Context(), userID, before, limit)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	for i := range list {
		h.signPhoto(&list[i])
	}
	if list == nil {
		list = []store.MealPhoto{}
	}
	stored, err := h.Store.StoredPhotoCount(r.Context(), userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	limitPtr, err := h.photoLimit(r.Context(), userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"photos": list, "stored": stored, "limit": limitPtr, "enabled": h.Photos != nil,
	})
}

// DeletePhoto handles DELETE /v1/photos/{id}. The meal keeps its numbers.
func (h *Handler) DeletePhoto(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	key, err := h.Store.DeletePhoto(r.Context(), auth.UserID(r), id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.deleteObjects(context.WithoutCancel(r.Context()), []string{key})
	httpx.NoContent(w)
}

// CleanPendingPhotos removes photos of estimates that were never logged,
// once an hour, until ctx ends.
func (h *Handler) CleanPendingPhotos(ctx context.Context) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		h.cleanPendingOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (h *Handler) cleanPendingOnce(ctx context.Context) {
	for {
		keys, err := h.Store.TakeStalePendingPhotos(ctx, h.now().Add(-24*time.Hour), 200)
		if err != nil {
			h.Log.Error("clean pending photos", "err", err)
			return
		}
		h.deleteObjects(ctx, keys)
		if len(keys) < 200 {
			return
		}
	}
}
