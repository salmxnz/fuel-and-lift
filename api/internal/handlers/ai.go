package handlers

import (
	"context"
	"encoding/base64"
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
		Image              *ai.Image         `json:"image"`
		Answers            map[string]string `json:"answers"`
		PreviousEstimateID *string           `json:"previous_estimate_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Text = strings.TrimSpace(in.Text)
	if utf8.RuneCountInString(in.Text) > 1000 {
		badRequest(w, "text is limited to 1000 characters")
		return
	}
	if in.Image != nil {
		if !validImageTypes[in.Image.MediaType] {
			badRequest(w, "image must be JPEG, PNG or WebP")
			return
		}
		if base64.StdEncoding.DecodedLen(len(in.Image.Data)) > maxImageBytes {
			httpx.Error(w, http.StatusRequestEntityTooLarge, "the photo is over 2 MB — resize it first")
			return
		}
		if _, err := base64.StdEncoding.DecodeString(in.Image.Data); err != nil {
			badRequest(w, "image data must be base64")
			return
		}
	}
	if len(in.Answers) > 5 {
		badRequest(w, "too many answers")
		return
	}
	userID := auth.UserID(r)
	ctx := r.Context()

	req := ai.Request{Text: in.Text, Image: in.Image, Answers: in.Answers, Kind: in.Kind}
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
	} else {
		in.Answers, req.Answers = nil, nil
	}
	if req.Kind == "" {
		req.Kind = "text"
		if in.Image != nil {
			req.Kind = "photo"
		}
	}
	if !validAIKinds[req.Kind] {
		badRequest(w, "kind must be photo, text or restaurant")
		return
	}
	if in.Image == nil && req.Text == "" && req.Previous == nil {
		badRequest(w, "send a photo or describe the meal")
		return
	}

	if h.AI == nil || len(h.AI.Providers) == 0 {
		httpx.ErrorCode(w, http.StatusServiceUnavailable, "ai_unavailable", "AI estimates aren't set up on this server yet")
		return
	}
	a, err := h.allowance(ctx, userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if a.usage.CallsLastMinute >= h.Cfg.AIPerMinute {
		w.Header().Set("Retry-After", "60")
		httpx.ErrorCode(w, http.StatusTooManyRequests, "rate_minute", "slow down a little — try again in a minute")
		return
	}
	if a.usage.CallsToday >= h.Cfg.AIPerDay {
		httpx.ErrorCode(w, http.StatusTooManyRequests, "rate_day", "you've hit today's AI limit — it resets at midnight")
		return
	}
	if in.Image != nil && a.photoLimit != nil && a.usage.PhotosThisMonth >= *a.photoLimit {
		httpx.ErrorCode(w, http.StatusPaymentRequired, "photo_limit",
			fmt.Sprintf("you've used your %d free photo estimates this month — they reset on %s", *a.photoLimit, a.resetsOn.Format("2 January")))
		return
	}
	if h.Cfg.AIMonthlyBudget > 0 {
		n := h.now().UTC()
		spent, err := h.Store.AISpendSince(ctx, time.Date(n.Year(), n.Month(), 1, 0, 0, 0, 0, time.UTC))
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		if spent >= h.Cfg.AIMonthlyBudget {
			h.Log.Warn("AI monthly budget reached", "spent_usd", spent)
			httpx.ErrorCode(w, http.StatusServiceUnavailable, "ai_budget", "AI estimates are paused until next month — log it manually for now")
			return
		}
	}
	if p, err := h.Store.GetProfile(ctx, userID); err == nil {
		req.Voice = p.CoachVoice
	}
	req.Context = h.aiContext(ctx, userID)

	res, failed, err := h.AI.Estimate(ctx, req)
	base := store.AIRecord{UserID: userID, Kind: req.Kind, HasImage: in.Image != nil, InputText: req.Text,
		Answers: req.Answers, PreviousID: in.PreviousEstimateID}
	for _, f := range failed {
		rec := base
		rec.Provider, rec.Model, rec.Error, rec.LatencyMS = f.Provider, f.Model, truncate(f.Err.Error(), 500), int(f.Latency.Milliseconds())
		if _, rerr := h.Store.RecordAI(context.WithoutCancel(ctx), rec); rerr != nil {
			h.Log.Error("record AI failure", "err", rerr)
		}
	}
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
	a.usage.CallsToday++
	if in.Image != nil {
		a.usage.PhotosThisMonth++
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"estimate_id": id,
		"title":       res.Estimate.Title,
		"items":       res.Estimate.Items,
		"questions":   res.Estimate.Questions,
		"totals":      res.Estimate.Totals,
		"model":       res.Model,
		"usage":       h.usageBody(a),
	})
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

// --- billing ---------------------------------------------------------------------

func (h *Handler) billing(ctx context.Context, userID string) (map[string]any, error) {
	u, err := h.Store.GetUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	a, err := h.allowance(ctx, userID)
	if err != nil {
		return nil, err
	}
	joined, err := h.Store.ReferralCount(ctx, userID)
	if err != nil {
		return nil, err
	}
	plan := "free"
	var source *string
	var until *time.Time
	if a.pro {
		plan = "pro"
		source, until = u.ProSource, u.ProUntil
	}
	return map[string]any{
		"plan":       plan,
		"pro_source": source,
		"pro_until":  until,
		"photo_estimates": map[string]any{
			"used_this_month":  a.usage.PhotosThisMonth,
			"limit_this_month": a.photoLimit,
			"resets_on":        a.resetsOn,
		},
		"referrals": map[string]int{"joined": joined, "needed": h.Cfg.ReferralsForPro},
	}, nil
}

// Billing handles GET /v1/billing.
func (h *Handler) Billing(w http.ResponseWriter, r *http.Request) {
	b, err := h.billing(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"billing": b})
}

// Checkout handles POST /v1/billing/checkout. No payment provider yet.
func (h *Handler) Checkout(w http.ResponseWriter, r *http.Request) {
	httpx.ErrorCode(w, http.StatusNotImplemented, "checkout_unavailable",
		"paid Pro isn't open yet — invite 8 friends to get Pro free, forever")
}
