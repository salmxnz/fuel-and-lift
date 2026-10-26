package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/salmxnz/fuel-and-lift/api/internal/ai"
	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

const maxImageBytes = 2 << 20

// maxImages is how many photos one meal estimate takes.
const maxImages = 3

var validImageTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}
var validAIKinds = map[string]bool{"photo": true, "text": true, "restaurant": true}

// allowance is where a user stands against the AI limits right now.
type allowance struct {
	usage      store.AIUsage
	pro        bool
	resetsOn   store.Date
	photoLimit *int // nil = unlimited
}

func (h *Handler) allowance(ctx context.Context, userID string) (allowance, error) {
	u, err := h.Store.GetUser(ctx, userID)
	if err != nil {
		return allowance{}, err
	}
	tz := h.Store.Timezone(ctx, userID)
	now := h.now()
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	l := now.In(loc)
	dayStart := time.Date(l.Year(), l.Month(), l.Day(), 0, 0, 0, 0, loc)
	monthStart, resets := store.MonthStart(now, tz)
	usage, err := h.Store.GetAIUsage(ctx, userID, dayStart, monthStart)
	if err != nil {
		return allowance{}, err
	}
	a := allowance{usage: usage, pro: u.IsPro(now), resetsOn: resets}
	if !a.pro {
		limit := h.Cfg.FreePhotosMonthly
		a.photoLimit = &limit
	}
	return a, nil
}

func (h *Handler) usageBody(a allowance) map[string]any {
	return map[string]any{
		"used_today":        a.usage.CallsToday,
		"limit_today":       h.Cfg.AIPerDay,
		"per_minute":        h.Cfg.AIPerMinute,
		"photos_this_month": a.usage.PhotosThisMonth,
		"photo_limit":       a.photoLimit,
		"resets_on":         a.resetsOn,
	}
}

// AIUsage handles GET /v1/ai/usage.
func (h *Handler) AIUsage(w http.ResponseWriter, r *http.Request) {
	a, err := h.allowance(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, h.usageBody(a))
}

// MealEstimate handles POST /v1/ai/meal-estimate.
func (h *Handler) MealEstimate(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind               string            `json:"kind"`
		Text               string            `json:"text"`
		Image              *ai.Image         `json:"image"`  // one photo (older clients)
		Images             []ai.Image        `json:"images"` // up to 3 photos of the same meal
		Answers            map[string]string `json:"answers"`
		PreviousEstimateID *string           `json:"previous_estimate_id"`
		// Refine-only: the user's correction, their name for the dish and
		// their edited items.
		Correction string          `json:"correction"`
		Title      string          `json:"title"`
		Items      json.RawMessage `json:"items"`
	}
	if err := httpx.DecodeLimit(w, r, &in, maxImages*(maxImageBytes*4/3+1024)+64<<10); err != nil {
		badRequest(w, "invalid body: "+err.Error())
		return
	}
	images := in.Images
	if in.Image != nil {
		images = append([]ai.Image{*in.Image}, images...)
	}
	in.Text = strings.TrimSpace(in.Text)
	if utf8.RuneCountInString(in.Text) > 1000 {
		badRequest(w, "text is limited to 1000 characters")
		return
	}
	if len(images) > maxImages {
		badRequest(w, fmt.Sprintf("send at most %d photos", maxImages))
		return
	}
	if !checkImages(w, images) {
		return
	}
	if len(in.Answers) > 5 {
		badRequest(w, "too many answers")
		return
	}
	in.Correction, in.Title = strings.TrimSpace(in.Correction), strings.TrimSpace(in.Title)
	if utf8.RuneCountInString(in.Correction) > 300 || utf8.RuneCountInString(in.Title) > 120 {
		badRequest(w, "correction is limited to 300 characters and title to 120")
		return
	}
	var edited []struct {
		Name     string   `json:"name"`
		Grams    *float64 `json:"grams"`
		Kcal     float64  `json:"kcal"`
		ProteinG float64  `json:"protein_g"`
		CarbsG   float64  `json:"carbs_g"`
		FatG     float64  `json:"fat_g"`
	}
	if len(in.Items) > 0 && string(in.Items) != "null" {
		if err := json.Unmarshal(in.Items, &edited); err != nil || len(edited) > 30 {
			badRequest(w, "items must be a list of up to 30 items")
			return
		}
	}
	if (in.Correction != "" || in.Title != "" || len(edited) > 0) && in.PreviousEstimateID == nil {
		badRequest(w, "correction, title and items need previous_estimate_id")
		return
	}
	userID := auth.UserID(r)
	ctx := r.Context()

	req := ai.Request{Text: in.Text, Images: images, Answers: in.Answers, Kind: in.Kind}
	if in.PreviousEstimateID != nil {
		if !isUUID(*in.PreviousEstimateID) {
			httpx.Error(w, http.StatusNotFound, "that estimate doesn't exist")
			return
		}
		kind, text, prev, err := h.Store.PreviousEstimate(ctx, userID, *in.PreviousEstimateID)
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		req.Previous = prev
		if req.Kind == "" {
			req.Kind = kind
		}
		if req.Text == "" {
			req.Text = text
		}
		req.Title = in.Title
		if len(edited) > 0 {
			req.Edited, _ = json.Marshal(edited)
		}
		if in.Correction != "" {
			// Kept with the text so later refines still see it.
			req.Correction = in.Correction
			req.Text = strings.TrimSpace(req.Text + "\nCorrection: " + in.Correction)
		}
	} else {
		in.Answers, req.Answers = nil, nil
	}
	if req.Kind == "" {
		req.Kind = "text"
		if len(images) > 0 {
			req.Kind = "photo"
		}
	}
	if !validAIKinds[req.Kind] {
		badRequest(w, "kind must be photo, text or restaurant")
		return
	}
	if len(images) == 0 && req.Text == "" && req.Previous == nil {
		badRequest(w, "send a photo or describe the meal")
		return
	}

	a, ok := h.aiGate(w, r, userID, len(images) > 0)
	if !ok {
		return
	}
	if p, err := h.Store.GetProfile(ctx, userID); err == nil {
		req.Voice = p.CoachVoice
	}
	req.Context = h.aiContext(ctx, userID)

	res, failed, err := h.AI.Estimate(ctx, req)
	base := store.AIRecord{UserID: userID, Kind: req.Kind, HasImage: len(images) > 0, ImageCount: len(images), InputText: req.Text,
		Answers: req.Answers, PreviousID: in.PreviousEstimateID}
	h.recordAIFailures(ctx, base, failed)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		h.Log.Warn("AI estimate failed", "err", err)
		httpx.ErrorCode(w, http.StatusBadGateway, "ai_failed", "the AI couldn't read that one — try again or log it manually")
		return
	}
	rec := base
	rec.Provider, rec.Model, rec.Result, rec.OK = res.Provider, res.Model, res.Estimate, true
	rec.InputTokens, rec.OutputTokens, rec.CostUSD = res.Usage.InputTokens, res.Usage.OutputTokens, res.Usage.CostUSD
	rec.LatencyMS = int(res.Latency.Milliseconds())
	id, err := h.Store.RecordAI(context.WithoutCancel(ctx), rec)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.keepEstimatePhotos(context.WithoutCancel(ctx), userID, id, images)
	a.usage.CallsToday++
	if len(images) > 0 {
		a.usage.PhotosThisMonth++
		if a.photoLimit != nil && a.usage.PhotosThisMonth == *a.photoLimit {
			h.emailPhotoLimit(ctx, userID, a)
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"estimate_id": id,
		"title":       res.Estimate.Title,
		"icon":        nilIfEmpty(res.Estimate.Icon),
		"items":       res.Estimate.Items,
		"questions":   res.Estimate.Questions,
		"totals":      res.Estimate.Totals,
		"model":       res.Model,
		"usage":       h.usageBody(a),
	})
}

// aiGate checks the AI is set up and the user is within their limits,
// writing the error when not. photo says the call counts as a photo estimate
// (gym photos don't).
func (h *Handler) aiGate(w http.ResponseWriter, r *http.Request, userID string, photo bool) (allowance, bool) {
	ctx := r.Context()
	if h.AI == nil || len(h.AI.Providers) == 0 {
		httpx.ErrorCode(w, http.StatusServiceUnavailable, "ai_unavailable", "AI estimates aren't set up on this server yet")
		return allowance{}, false
	}
	a, err := h.allowance(ctx, userID)
	if err != nil {
		h.storeError(w, r, err)
		return a, false
	}
	if a.usage.CallsLastMinute >= h.Cfg.AIPerMinute {
		w.Header().Set("Retry-After", "60")
		httpx.ErrorCode(w, http.StatusTooManyRequests, "rate_minute", "slow down a little — try again in a minute")
		return a, false
	}
	if a.usage.CallsToday >= h.Cfg.AIPerDay {
		httpx.ErrorCode(w, http.StatusTooManyRequests, "rate_day", "you've hit today's AI limit — it resets at midnight")
		return a, false
	}
	// One estimate counts once, however many photos it has.
	if photo && a.photoLimit != nil && a.usage.PhotosThisMonth >= *a.photoLimit {
		httpx.ErrorCode(w, http.StatusPaymentRequired, "photo_limit",
			fmt.Sprintf("you've used your %d free photo estimates this month — they reset on %s", *a.photoLimit, a.resetsOn.Format("2 January")))
		return a, false
	}
	if h.Cfg.AIMonthlyBudget > 0 {
		n := h.now().UTC()
		spent, err := h.Store.AISpendSince(ctx, time.Date(n.Year(), n.Month(), 1, 0, 0, 0, 0, time.UTC))
		if err != nil {
			h.storeError(w, r, err)
			return a, false
		}
		if spent >= h.Cfg.AIMonthlyBudget {
			h.Log.Warn("AI monthly budget reached", "spent_usd", spent)
			httpx.ErrorCode(w, http.StatusServiceUnavailable, "ai_budget", "AI estimates are paused until next month — log it manually for now")
			return a, false
		}
	}
	return a, true
}

// recordAIFailures logs each failed provider attempt.
func (h *Handler) recordAIFailures(ctx context.Context, base store.AIRecord, failed []ai.Attempt) {
	for _, f := range failed {
		rec := base
		rec.Provider, rec.Model, rec.Error, rec.LatencyMS = f.Provider, f.Model, truncate(f.Err.Error(), 500), int(f.Latency.Milliseconds())
		if _, rerr := h.Store.RecordAI(context.WithoutCancel(ctx), rec); rerr != nil {
			h.Log.Error("record AI failure", "err", rerr)
		}
	}
}

// checkImages validates base64 photos, writing a 400/413 when one is bad.
func checkImages(w http.ResponseWriter, images []ai.Image) bool {
	for _, img := range images {
		if !validImageTypes[img.MediaType] {
			badRequest(w, "images must be JPEG, PNG or WebP")
			return false
		}
		if base64.StdEncoding.DecodedLen(len(img.Data)) > maxImageBytes {
			httpx.Error(w, http.StatusRequestEntityTooLarge, "a photo is over 2 MB — resize it first")
			return false
		}
		if _, err := base64.StdEncoding.DecodeString(img.Data); err != nil {
			badRequest(w, "image data must be base64")
			return false
		}
	}
	return true
}

// aiContext lists a few of the user's saved meals so guesses match how they
// actually eat ("3 fried eggs ≈ 270 kcal").
func (h *Handler) aiContext(ctx context.Context, userID string) string {
	meals, err := h.Store.ListSavedMeals(ctx, userID)
	if err != nil || len(meals) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("The user's saved meals (name: kcal, protein g):\n")
	for i, m := range meals {
		if i == 12 {
			break
		}
		fmt.Fprintf(&b, "- %s: %d kcal, %d g protein\n", m.Name, int(math.Round(m.Base.Kcal)), int(math.Round(m.Base.ProteinG)))
	}
	return b.String()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// nilIfEmpty turns "" into JSON null.
func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
