package handlers

import (
	"context"
	"fmt"
	"net/http"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/splits"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

type splitWorkout struct {
	Name      string   `json:"name"`
	Exercises []string `json:"exercises"`
}

type splitView struct {
	Key         string         `json:"key"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	MinDays     int            `json:"min_days"`
	MaxDays     int            `json:"max_days"`
	DefaultDays []string       `json:"default_days"`
	Workouts    []splitWorkout `json:"workouts"`
	Rotation    []int          `json:"rotation"`
}

func viewSplit(s splits.Split) splitView {
	v := splitView{Key: s.Key, Name: s.Name, Description: s.Description, MinDays: s.MinDays, MaxDays: s.MaxDays,
		DefaultDays: []string{}, Workouts: []splitWorkout{}, Rotation: s.Rotation}
	for _, d := range s.DefaultDays {
		v.DefaultDays = append(v.DefaultDays, store.Weekdays[d])
	}
	for _, w := range s.Workouts {
		sw := splitWorkout{Name: w.Name, Exercises: []string{}}
		for _, b := range w.Blocks {
			sw.Exercises = append(sw.Exercises, b.Exercise)
		}
		v.Workouts = append(v.Workouts, sw)
	}
	return v
}

// GetSplits handles GET /v1/splits: the preset splits.
func (h *Handler) GetSplits(w http.ResponseWriter, r *http.Request) {
	out := make([]splitView, len(splits.All))
	for i, s := range splits.All {
		out[i] = viewSplit(s)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"splits": out})
}

// parseDays reads ["mon", "wed"] into weekday numbers (0 = Monday).
func parseDays(days []string) ([]int, bool) {
	seen := map[int]bool{}
	out := make([]int, 0, len(days))
	for _, d := range days {
		i := -1
		for j, wd := range store.Weekdays {
			if wd == d {
				i = j
			}
		}
		if i < 0 || seen[i] {
			return nil, false
		}
		seen[i] = true
		out = append(out, i)
	}
	return out, true
}

// splitDays checks the days for a split, falling back to its defaults. It
// returns a message when they don't fit.
func splitDays(s splits.Split, raw []string) ([]int, string) {
	days, ok := parseDays(raw)
	if !ok {
		return nil, `gym_days must be different weekdays like "mon"`
	}
	if len(days) == 0 {
		return s.DefaultDays, ""
	}
	if len(days) < s.MinDays || len(days) > s.MaxDays {
		return nil, fmt.Sprintf("%s needs %d to %d days", s.Name, s.MinDays, s.MaxDays)
	}
	return days, ""
}

// presetSeed turns a split into workouts for days: only the workouts those
// days use are created, from library exercises (sets with blank weights,
// 90s rest; cardio as a warm-up).
func (h *Handler) presetSeed(ctx context.Context, s splits.Split, days []int, used []int) (store.RoutineSeed, error) {
	lib, err := h.Store.LibraryExerciseIDs(ctx, splits.Names())
	if err != nil {
		return store.RoutineSeed{}, err
	}
	key, desc := s.Key, s.Description
	seed := store.RoutineSeed{Name: s.Name, Description: &desc, Preset: &key, Days: map[int]int{}}
	index := map[int]int{}
	rest := 90
	for _, wi := range used {
		w := s.Workouts[wi]
		nw := store.NewWorkout{Name: w.Name}
		for _, b := range w.Blocks {
			id, ok := lib[b.Exercise]
			if !ok {
				h.Log.Error("split exercise missing from library", "split", s.Key, "exercise", b.Exercise)
				continue
			}
			in := store.BlockInput{ExerciseID: id}
			if b.CardioMin > 0 {
				in.Cardio = &store.Cardio{Minutes: b.CardioMin}
			} else {
				reps := b.Reps
				for i := 0; i < b.Sets; i++ {
					in.Sets = append(in.Sets, store.PlannedSet{TargetReps: &reps})
				}
				in.RestSeconds = &rest
			}
			nw.Blocks = append(nw.Blocks, in)
		}
		index[wi] = len(seed.Workouts)
		seed.Workouts = append(seed.Workouts, nw)
	}
	for d, wi := range splits.Assign(s, days) {
		if i, ok := index[wi]; ok {
			seed.Days[d] = i
		}
	}
	return seed, nil
}

// seedGym fills a new user's Gym tab after onboarding. With a split: its
// workouts, a routine and the week. Without: the two starter workouts, put on
// the days they train if they said. Failures are logged and skipped:
// onboarding has already succeeded.
func (h *Handler) seedGym(ctx context.Context, userID string, split *splits.Split, days []int) {
	s, makeRoutine := splits.Starter, false
	used := splits.Used(splits.Starter, nil) // both, whatever the days
	if split != nil {
		s, makeRoutine = *split, true
		used = splits.Used(s, days)
	}
	seed, err := h.presetSeed(ctx, s, days, used)
	if err != nil {
		h.Log.Error("seed gym", "err", err)
		return
	}
	seed.MakeRoutine, seed.ApplyToWeek = makeRoutine, len(days) > 0
	if _, err := h.Store.SeedRoutine(ctx, userID, seed); err != nil {
		h.Log.Error("seed gym", "split", s.Key, "err", err)
	}
}

// ApplySplit handles POST /v1/splits/{key}/apply {days?, apply_to_week?}:
// new workouts and a routine from a preset; by default it becomes the week.
func (h *Handler) ApplySplit(w http.ResponseWriter, r *http.Request) {
	s, ok := splits.Get(r.PathValue("key"))
	if !ok {
		httpx.Error(w, http.StatusNotFound, "not found")
		return
	}
	var in struct {
		Days        []string `json:"days"`
		ApplyToWeek *bool    `json:"apply_to_week"`
	}
	if !decode(w, r, &in) {
		return
	}
	days, msg := splitDays(s, in.Days)
	if msg != "" {
		badRequest(w, msg)
		return
	}
	ctx := r.Context()
	userID := auth.UserID(r)
	seed, err := h.presetSeed(ctx, s, days, splits.Used(s, days))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	seed.MakeRoutine = true
	seed.ApplyToWeek = in.ApplyToWeek == nil || *in.ApplyToWeek
	id, err := h.Store.SeedRoutine(ctx, userID, seed)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	routine, err := h.Store.GetRoutine(ctx, userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	plan, err := h.Store.GetWeeklyPlan(ctx, userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"routine": routine, "days": plan})
}
