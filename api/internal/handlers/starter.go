package handlers

import (
	"context"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// starterTemplates are given to everyone at onboarding so the Gym tab isn't
// empty. Weights start blank: the first session fills them in, and they're
// ordinary templates the user can edit or delete.
var starterTemplates = []struct {
	name   string
	blocks []starterBlock
}{
	{"Upper-1", []starterBlock{
		{name: "Treadmill", cardioMin: 5},
		{name: "Lat pulldown", sets: 3, reps: 10},
		{name: "T-bar row", sets: 3, reps: 8},
		{name: "Incline dumbbell press", sets: 3, reps: 8},
		{name: "Chest fly (machine)", sets: 3, reps: 12},
		{name: "Lateral raise", sets: 3, reps: 12},
		{name: "Triceps pushdown", sets: 3, reps: 12},
	}},
	{"Lower-1", []starterBlock{
		{name: "Stationary bike", cardioMin: 5},
		{name: "Back squat", sets: 3, reps: 8},
		{name: "Romanian deadlift", sets: 3, reps: 10},
		{name: "Leg press", sets: 3, reps: 10},
		{name: "Seated leg curl", sets: 3, reps: 12},
		{name: "Standing calf raise", sets: 3, reps: 12},
	}},
}

type starterBlock struct {
	name       string
	sets, reps int
	cardioMin  float64
}

// seedStarterTemplates creates the starter templates. Failures are logged and
// skipped: onboarding has already succeeded.
func (h *Handler) seedStarterTemplates(ctx context.Context, userID string) {
	lib, err := h.Store.ListExercises(ctx, userID, "")
	if err != nil {
		h.Log.Error("starter templates", "err", err)
		return
	}
	byName := map[string]string{}
	for _, e := range lib {
		byName[e.Name] = e.ID
	}
	rest := 90
	for _, t := range starterTemplates {
		var blocks []store.BlockInput
		for _, b := range t.blocks {
			id, ok := byName[b.name]
			if !ok {
				continue
			}
			in := store.BlockInput{ExerciseID: id}
			if b.cardioMin > 0 {
				in.Cardio = &store.Cardio{Minutes: b.cardioMin}
			} else {
				reps := b.reps
				for i := 0; i < b.sets; i++ {
					in.Sets = append(in.Sets, store.PlannedSet{TargetReps: &reps})
				}
				in.RestSeconds = &rest
			}
			blocks = append(blocks, in)
		}
		if _, err := h.Store.CreateTemplate(ctx, userID, t.name, blocks); err != nil {
			h.Log.Error("starter template", "name", t.name, "err", err)
		}
	}
}
