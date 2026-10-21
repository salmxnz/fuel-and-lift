package handlers

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/nutrition"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// ListWeighIns handles GET /v1/weigh-ins.
func (h *Handler) ListWeighIns(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	today := h.today(r.Context(), userID)
	from, to, ok := queryRange(w, r, store.Date{Time: today.AddDate(-1, 0, 0)}, today)
	if !ok {
		return
	}
	list, err := h.Store.ListWeighIns(r.Context(), userID, from, to)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"weigh_ins": list})
}

// PutWeighIn handles POST /v1/weigh-ins.
func (h *Handler) PutWeighIn(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Date     *store.Date `json:"date"`
		WeightKg float64     `json:"weight_kg"`
		Note     *string     `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.WeightKg < 20 || in.WeightKg > 400 {
		badRequest(w, "weight_kg must be between 20 and 400")
		return
	}
	userID := auth.UserID(r)
	today := h.today(r.Context(), userID)
	d := today
	if in.Date != nil {
		d = *in.Date
	}
	if d.After(today.Time) {
		badRequest(w, "you can't weigh in for a future day")
		return
	}
	before, _ := h.Store.ListWeighIns(r.Context(), userID, store.Date{Time: d.AddDate(-5, 0, 0)}, today)
	wi, err := h.Store.PutWeighIn(r.Context(), userID, d, math.Round(in.WeightKg*100)/100, in.Note)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.weightMilestone(r, userID, before, wi)
	httpx.JSON(w, http.StatusCreated, map[string]any{"weigh_in": wi})
}

// weightMilestone records an activity each time the user gets another whole
// kilogram closer to their goal than ever before. Friends see it only when
// weight sharing is on, and it never contains the weight itself.
func (h *Handler) weightMilestone(r *http.Request, userID string, before []store.WeighIn, wi store.WeighIn) {
	g, err := h.Store.ActiveGoal(r.Context(), userID)
	if err != nil || g.GoalWeightKg == nil || g.Mode == "maintain" {
		return
	}
	dir := 1.0
	if g.Mode == "lose" {
		dir = -1
	}
	best := 0.0
	for _, b := range before {
		if b.Date.Before(g.StartedOn.Time) || b.ID == wi.ID {
			continue
		}
		best = math.Max(best, (b.WeightKg-g.StartWeightKg)*dir)
	}
	now := (wi.WeightKg - g.StartWeightKg) * dir
	if math.Floor(now) > math.Floor(best) && math.Floor(now) >= 1 {
		p, err := h.Store.GetProfile(r.Context(), userID)
		if err != nil {
			return
		}
		kg := int(math.Floor(now))
		text := p.DisplayName + " is " + strconv.Itoa(kg) + " kg closer to their goal"
		_, _ = h.Store.AddActivity(r.Context(), userID, "weight_milestone", text, map[string]any{"kg_progress": kg}, nil)
	}
}

// DeleteWeighIn handles DELETE /v1/weigh-ins/{id}.
func (h *Handler) DeleteWeighIn(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.DeleteWeighIn(r.Context(), auth.UserID(r), id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}

// --- progress ----------------------------------------------------------------------

type datedKg struct {
	Date     store.Date `json:"date"`
	WeightKg float64    `json:"weight_kg"`
}

// WeightProgress handles GET /v1/progress/weight: raw weigh-ins, the smoothed
// trend and the planned line from the goal's start to its forecast.
func (h *Handler) WeightProgress(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	today := h.today(r.Context(), userID)
	from, to, ok := queryRange(w, r, store.Date{Time: today.AddDate(0, -6, 0)}, today)
	if !ok {
		return
	}
	list, err := h.Store.ListWeighIns(r.Context(), userID, from, to)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	asc := append([]store.WeighIn(nil), list...)
	sort.Slice(asc, func(i, j int) bool { return asc[i].Date.Before(asc[j].Date.Time) })
	pts := make([]nutrition.WeightPoint, len(asc))
	for i, x := range asc {
		pts[i] = nutrition.WeightPoint{Date: x.Date.Time, WeightKg: x.WeightKg}
	}
	trend := []datedKg{}
	for _, p := range nutrition.Trend(pts) {
		trend = append(trend, datedKg{store.DateOf(p.Date), p.WeightKg})
	}
	plan := []datedKg{}
	var goal *store.Goal
	if g, err := h.Store.ActiveGoal(r.Context(), userID); err == nil {
		goal = &g
		plan = append(plan, datedKg{g.StartedOn, g.StartWeightKg})
		if g.GoalWeightKg != nil && g.Plan.ForecastDate != nil {
			if fd, err := store.ParseDate(*g.Plan.ForecastDate); err == nil {
				plan = append(plan, datedKg{fd, *g.GoalWeightKg})
			}
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"weigh_ins": list, "trend": trend, "plan": plan, "goal": goal})
}

// CaloriesProgress handles GET /v1/progress/calories.
func (h *Handler) CaloriesProgress(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	today := h.today(r.Context(), userID)
	from, to, ok := queryRange(w, r, store.Date{Time: today.AddDate(0, 0, -6)}, today)
	if !ok {
		return
	}
	totals, err := h.Store.DailyTotals(r.Context(), userID, from, to)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	target := 0.0
	if g, err := h.Store.ActiveGoal(r.Context(), userID); err == nil {
		target = g.Plan.TargetKcal
	}
	type day struct {
		Date       store.Date `json:"date"`
		Kcal       float64    `json:"kcal"`
		ProteinG   float64    `json:"protein_g"`
		TargetKcal float64    `json:"target_kcal"`
		Logged     bool       `json:"logged"`
	}
	days := []day{}
	for d := from.Time; !d.After(to.Time); d = d.Add(24 * time.Hour) {
		sd := store.DateOf(d)
		m, logged := totals[sd.String()]
		days = append(days, day{Date: sd, Kcal: m.Kcal, ProteinG: m.ProteinG, TargetKcal: target, Logged: logged})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"days": days})
}

// ExerciseProgress handles GET /v1/progress/exercises/{id}.
func (h *Handler) ExerciseProgress(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := auth.UserID(r)
	ex, err := h.Store.GetExercise(r.Context(), userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	pts, err := h.Store.ExerciseHistory(r.Context(), userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"exercise": ex, "points": pts})
}

// RecordsProgress handles GET /v1/progress/records.
func (h *Handler) RecordsProgress(w http.ResponseWriter, r *http.Request) {
	recs, err := h.Store.Records(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"records": recs})
}
