package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/nutrition"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

type planBody struct {
	Sex           string     `json:"sex"`
	DateOfBirth   store.Date `json:"date_of_birth"`
	HeightCm      float64    `json:"height_cm"`
	WeightKg      float64    `json:"weight_kg"`
	ActivityLevel int        `json:"activity_level"`
	Mode          string     `json:"mode"`
	GoalWeightKg  *float64   `json:"goal_weight_kg"`
	Pace          string     `json:"pace"`
}

func (b planBody) input(today store.Date) nutrition.Input {
	pace := b.Pace
	if pace == "" {
		pace = string(nutrition.Standard)
	}
	goal := b.GoalWeightKg
	if b.Mode == string(nutrition.Maintain) {
		goal = nil
	}
	return nutrition.Input{
		Sex: nutrition.Sex(b.Sex), DateOfBirth: b.DateOfBirth.Time, HeightCm: b.HeightCm, WeightKg: b.WeightKg,
		ActivityLevel: b.ActivityLevel, Mode: nutrition.Mode(b.Mode), GoalWeightKg: goal,
		Pace: nutrition.Pace(pace), Today: today.Time,
	}
}

func writePlanError(w http.ResponseWriter, err error) bool {
	var ve nutrition.ValidationError
	if errors.As(err, &ve) {
		badRequest(w, ve.Msg)
		return true
	}
	return false
}

// PlanPreview handles POST /v1/plan/preview (no writes).
func (h *Handler) PlanPreview(w http.ResponseWriter, r *http.Request) {
	var in planBody
	if !decode(w, r, &in) {
		return
	}
	today := h.today(r.Context(), auth.UserID(r))
	plan, err := nutrition.Compute(in.input(today))
	if err != nil {
		if !writePlanError(w, err) {
			h.storeError(w, r, err)
		}
		return
	}
	paces := map[string]nutrition.Plan{}
	if in.Mode != string(nutrition.Maintain) {
		for _, p := range nutrition.Paces {
			x := in
			x.Pace = string(p)
			if pp, err := nutrition.Compute(x.input(today)); err == nil {
				paces[string(p)] = pp
			}
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"plan": plan, "paces": paces})
}

var validUnits = map[string]bool{"metric": true, "imperial": true}
var validVoices = map[string]bool{"neutral": true, "casual": true}
var validCadence = map[string]bool{"few_per_week": true, "weekly": true, "monthly": true, "quarterly": true}

func validTimezone(tz string) bool {
	if tz == "" {
		return false
	}
	_, err := time.LoadLocation(tz)
	return err == nil
}

// Onboard handles POST /v1/onboarding.
func (h *Handler) Onboard(w http.ResponseWriter, r *http.Request) {
	var in struct {
		planBody
		DisplayName    string `json:"display_name"`
		Timezone       string `json:"timezone"`
		Units          string `json:"units"`
		CoachVoice     string `json:"coach_voice"`
		WeighInCadence string `json:"weigh_in_cadence"`
	}
	if !decode(w, r, &in) {
		return
	}
	name, ok := cleanName(in.DisplayName, 40)
	if !ok {
		badRequest(w, "display_name is required (up to 40 characters)")
		return
	}
	if !validTimezone(in.Timezone) {
		in.Timezone = "UTC"
	}
	if in.Units == "" {
		in.Units = "metric"
	}
	if in.CoachVoice == "" {
		in.CoachVoice = "neutral"
	}
	if in.WeighInCadence == "" {
		in.WeighInCadence = "weekly"
	}
	if !validUnits[in.Units] || !validVoices[in.CoachVoice] || !validCadence[in.WeighInCadence] {
		badRequest(w, "units, coach_voice or weigh_in_cadence has an unknown value")
		return
	}
	today := store.LocalToday(h.now(), in.Timezone)
	pi := in.input(today)
	plan, err := nutrition.Compute(pi)
	if err != nil {
		if !writePlanError(w, err) {
			h.storeError(w, r, err)
		}
		return
	}
	userID := auth.UserID(r)
	prof, goal, upgraded, err := h.Store.CompleteOnboarding(r.Context(), userID, store.Onboarding{
		Profile: store.Profile{
			DisplayName: name, Sex: in.Sex, DateOfBirth: in.DateOfBirth, HeightCm: in.HeightCm,
			ActivityLevel: in.ActivityLevel, Units: in.Units, Timezone: in.Timezone,
			CoachVoice: in.CoachVoice, WeighInCadence: in.WeighInCadence,
		},
		WeightKg: in.WeightKg, Mode: string(pi.Mode), Pace: string(pi.Pace), GoalKg: pi.GoalWeightKg,
		Today: today, Plan: plan,
	}, h.Cfg.ReferralsForPro)
	if errors.Is(err, store.ErrConflict) {
		httpx.Error(w, http.StatusConflict, "you've already finished onboarding")
		return
	}
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.seedStarterTemplates(r.Context(), userID)
	if upgraded != "" {
		h.Notifier.Notify([]string{upgraded}, push.Message{
			Title: "You've got Pro, for good",
			Body:  "8 friends joined Fuel & Lift through your links. Unlimited photo estimates are yours.",
			URL:   "/me", Tag: "pro",
		})
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"profile": prof, "goal": goal})
}

// GetProfile handles GET /v1/profile.
func (h *Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	p, err := h.Store.GetProfile(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"profile": p})
}

// PatchProfile handles PATCH /v1/profile. When body stats change, the active
// goal's targets are recomputed from the latest weigh-in.
func (h *Handler) PatchProfile(w http.ResponseWriter, r *http.Request) {
	var in struct {
		DisplayName    *string     `json:"display_name"`
		Sex            *string     `json:"sex"`
		DateOfBirth    *store.Date `json:"date_of_birth"`
		HeightCm       *float64    `json:"height_cm"`
		ActivityLevel  *int        `json:"activity_level"`
		Units          *string     `json:"units"`
		Timezone       *string     `json:"timezone"`
		CoachVoice     *string     `json:"coach_voice"`
		WeighInCadence *string     `json:"weigh_in_cadence"`
	}
	if !decode(w, r, &in) {
		return
	}
	userID := auth.UserID(r)
	p, err := h.Store.GetProfile(r.Context(), userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	stats := false
	if in.DisplayName != nil {
		name, ok := cleanName(*in.DisplayName, 40)
		if !ok {
			badRequest(w, "display_name must be 1 to 40 characters")
			return
		}
		p.DisplayName = name
	}
	if in.Sex != nil {
		p.Sex, stats = *in.Sex, true
	}
	if in.DateOfBirth != nil {
		p.DateOfBirth, stats = *in.DateOfBirth, true
	}
	if in.HeightCm != nil {
		p.HeightCm, stats = *in.HeightCm, true
	}
	if in.ActivityLevel != nil {
		p.ActivityLevel, stats = *in.ActivityLevel, true
	}
	if in.Units != nil {
		p.Units = *in.Units
	}
	if in.Timezone != nil {
		if !validTimezone(*in.Timezone) {
			badRequest(w, "unknown timezone")
			return
		}
		p.Timezone = *in.Timezone
	}
	if in.CoachVoice != nil {
		p.CoachVoice = *in.CoachVoice
	}
	if in.WeighInCadence != nil {
		p.WeighInCadence = *in.WeighInCadence
	}
	if !validUnits[p.Units] || !validVoices[p.CoachVoice] || !validCadence[p.WeighInCadence] {
		badRequest(w, "units, coach_voice or weigh_in_cadence has an unknown value")
		return
	}
	var newPlan *nutrition.Plan
	var goal store.Goal
	if stats {
		goal, err = h.Store.ActiveGoal(r.Context(), userID)
		if err == nil {
			latest, werr := h.Store.LatestWeighIn(r.Context(), userID)
			if werr != nil {
				h.storeError(w, r, werr)
				return
			}
			plan, perr := nutrition.Compute(nutrition.Input{
				Sex: nutrition.Sex(p.Sex), DateOfBirth: p.DateOfBirth.Time, HeightCm: p.HeightCm, WeightKg: latest.WeightKg,
				ActivityLevel: p.ActivityLevel, Mode: nutrition.Mode(goal.Mode), GoalWeightKg: goal.GoalWeightKg,
				Pace: nutrition.Pace(goal.Pace), Today: store.LocalToday(h.now(), p.Timezone).Time,
			})
			if perr != nil {
				if !writePlanError(w, perr) {
					h.storeError(w, r, perr)
				}
				return
			}
			newPlan = &plan
		} else if !errors.Is(err, store.ErrNotFound) {
			h.storeError(w, r, err)
			return
		}
	}
	p, err = h.Store.UpdateProfile(r.Context(), userID, p)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if newPlan != nil {
		if err := h.Store.UpdateGoalPlan(r.Context(), goal.ID, *newPlan); err != nil {
			h.storeError(w, r, err)
			return
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"profile": p})
}

// GetGoal handles GET /v1/goal.
func (h *Handler) GetGoal(w http.ResponseWriter, r *http.Request) {
	g, err := h.Store.ActiveGoal(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"goal": g})
}

// NewGoal handles POST /v1/goal: a new goal from the latest weigh-in.
func (h *Handler) NewGoal(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Mode         string   `json:"mode"`
		GoalWeightKg *float64 `json:"goal_weight_kg"`
		Pace         string   `json:"pace"`
	}
	if !decode(w, r, &in) {
		return
	}
	userID := auth.UserID(r)
	p, err := h.Store.GetProfile(r.Context(), userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	latest, err := h.Store.LatestWeighIn(r.Context(), userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	today := store.LocalToday(h.now(), p.Timezone)
	body := planBody{Sex: p.Sex, DateOfBirth: p.DateOfBirth, HeightCm: p.HeightCm, WeightKg: latest.WeightKg,
		ActivityLevel: p.ActivityLevel, Mode: in.Mode, GoalWeightKg: in.GoalWeightKg, Pace: in.Pace}
	pi := body.input(today)
	plan, err := nutrition.Compute(pi)
	if err != nil {
		if !writePlanError(w, err) {
			h.storeError(w, r, err)
		}
		return
	}
	g, err := h.Store.NewGoal(r.Context(), userID, string(pi.Mode), string(pi.Pace), latest.WeightKg, pi.GoalWeightKg, today, plan)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"goal": g})
}
