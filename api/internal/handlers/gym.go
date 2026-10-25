package handlers

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// --- exercises -------------------------------------------------------------------

// ListExercises handles GET /v1/exercises?q=.
func (h *Handler) ListExercises(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListExercises(r.Context(), auth.UserID(r), strings.TrimSpace(r.URL.Query().Get("q")))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"exercises": list})
}

// CreateExercise handles POST /v1/exercises.
func (h *Handler) CreateExercise(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name        string  `json:"name"`
		Kind        string  `json:"kind"`
		MuscleGroup *string `json:"muscle_group"`
		Equipment   *string `json:"equipment"`
	}
	if !decode(w, r, &in) {
		return
	}
	name, ok := cleanName(in.Name, 60)
	if !ok {
		badRequest(w, "name is required (up to 60 characters)")
		return
	}
	if in.Kind == "" {
		in.Kind = "strength"
	}
	if in.Kind != "strength" && in.Kind != "cardio" {
		badRequest(w, "kind must be strength or cardio")
		return
	}
	for _, p := range []*string{in.MuscleGroup, in.Equipment} {
		if p != nil && len(*p) > 40 {
			badRequest(w, "muscle_group and equipment are limited to 40 characters")
			return
		}
	}
	e, err := h.Store.CreateExercise(r.Context(), auth.UserID(r), store.Exercise{Name: name, Kind: in.Kind, MuscleGroup: in.MuscleGroup, Equipment: in.Equipment})
	if err != nil {
		if err == store.ErrConflict {
			httpx.Error(w, http.StatusConflict, "you already have an exercise with that name")
			return
		}
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"exercise": e})
}

// --- templates -------------------------------------------------------------------

type templateBody struct {
	Name   string             `json:"name"`
	Blocks []store.BlockInput `json:"blocks"`
	// Visibility is read when creating; PUT …/visibility changes it later.
	Visibility *string `json:"visibility"`
}

func checkTemplate(in templateBody) (string, string) {
	name, ok := cleanName(in.Name, 40)
	if !ok {
		return "", "name is required (up to 40 characters)"
	}
	if len(in.Blocks) > 30 {
		return "", "a template can have at most 30 exercises"
	}
	for _, b := range in.Blocks {
		if !isUUID(b.ExerciseID) {
			return "", "every block needs an exercise_id"
		}
		if len(b.Sets) > 12 {
			return "", "a block can have at most 12 sets"
		}
		for _, s := range b.Sets {
			if s.TargetKg != nil && (*s.TargetKg < 0 || *s.TargetKg > 1000) {
				return "", "target_kg must be between 0 and 1000"
			}
			if s.TargetReps != nil && (*s.TargetReps < 0 || *s.TargetReps > 200) {
				return "", "target_reps must be between 0 and 200"
			}
		}
		if b.Cardio != nil && (b.Cardio.Minutes <= 0 || b.Cardio.Minutes > 600) {
			return "", "cardio minutes must be between 0 and 600"
		}
		if b.RestSeconds != nil && (*b.RestSeconds < 0 || *b.RestSeconds > 1800) {
			return "", "rest_seconds must be between 0 and 1800"
		}
		if b.Notes != nil && utf8Len(*b.Notes) > 200 {
			return "", "notes are limited to 200 characters"
		}
	}
	return name, ""
}

// ListTemplates handles GET /v1/templates.
func (h *Handler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListTemplates(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"templates": list})
}

// CreateTemplate handles POST /v1/templates.
func (h *Handler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	var in templateBody
	if !decode(w, r, &in) {
		return
	}
	name, msg := checkTemplate(in)
	if msg != "" {
		badRequest(w, msg)
		return
	}
	if !validVisibility(w, in.Visibility) {
		return
	}
	userID := auth.UserID(r)
	t, err := h.Store.CreateTemplate(r.Context(), userID, name, in.Blocks)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	vis := h.Store.DefaultVisibility(r.Context(), userID) // left out: the user's default
	if in.Visibility != nil {
		vis = *in.Visibility
	}
	if vis != "private" {
		var ch store.VisibilityChange
		if t.Community, ch, err = h.Store.SetVisibilityFirst(r.Context(), userID, "template", t.ID, vis); err != nil {
			h.storeError(w, r, err)
			return
		}
		if ch.First {
			h.announceItem(context.WithoutCancel(r.Context()), userID, "template", t.ID, t.Name)
		}
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"template": t})
}

// GetTemplate handles GET /v1/templates/{id}.
func (h *Handler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := auth.UserID(r)
	t, err := h.Store.GetTemplate(r.Context(), userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	versions, err := h.Store.TemplateVersions(r.Context(), userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"template": t, "versions": versions})
}

// GetTemplateVersion handles GET /v1/templates/{id}/versions/{version}.
func (h *Handler) GetTemplateVersion(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	v, err := strconv.Atoi(r.PathValue("version"))
	if err != nil || v < 1 {
		httpx.Error(w, http.StatusNotFound, "that version doesn't exist")
		return
	}
	t, err := h.Store.GetTemplateVersion(r.Context(), auth.UserID(r), id, &v)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"template": t})
}

// SetCurrentTemplateVersion handles POST /v1/templates/{id}/current {version}.
func (h *Handler) SetCurrentTemplateVersion(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Version int `json:"version"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Version < 1 {
		badRequest(w, "version must be 1 or more")
		return
	}
	t, err := h.Store.SetCurrentVersion(r.Context(), auth.UserID(r), id, in.Version)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"template": t})
}

// SaveTemplate handles PUT /v1/templates/{id}: a new version.
func (h *Handler) SaveTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in templateBody
	if !decode(w, r, &in) {
		return
	}
	name, msg := checkTemplate(in)
	if msg != "" {
		badRequest(w, msg)
		return
	}
	t, err := h.Store.SaveTemplateVersion(r.Context(), auth.UserID(r), id, name, in.Blocks)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"template": t})
}

// DeleteTemplate handles DELETE /v1/templates/{id}.
func (h *Handler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.ArchiveTemplate(r.Context(), auth.UserID(r), id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}

// --- weekly plan -----------------------------------------------------------------

// GetWeeklyPlan handles GET /v1/weekly-plan.
func (h *Handler) GetWeeklyPlan(w http.ResponseWriter, r *http.Request) {
	days, err := h.Store.GetWeeklyPlan(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"days": days})
}

// PutWeeklyPlan handles PUT /v1/weekly-plan.
func (h *Handler) PutWeeklyPlan(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Days map[string]*string `json:"days"`
	}
	if !decode(w, r, &in) {
		return
	}
	known := map[string]bool{}
	for _, d := range store.Weekdays {
		known[d] = true
	}
	for k, v := range in.Days {
		if !known[k] {
			badRequest(w, "days keys are mon, tue, wed, thu, fri, sat and sun")
			return
		}
		if v != nil && !isUUID(*v) {
			badRequest(w, "each day is a template id or null")
			return
		}
	}
	userID := auth.UserID(r)
	if err := h.Store.PutWeeklyPlan(r.Context(), userID, in.Days); err != nil {
		h.storeError(w, r, err)
		return
	}
	h.GetWeeklyPlan(w, r)
}

// --- sessions --------------------------------------------------------------------

// StartSession handles POST /v1/sessions.
func (h *Handler) StartSession(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Date       *store.Date `json:"date"`
		TemplateID *string     `json:"template_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	userID := auth.UserID(r)
	d := h.today(r.Context(), userID)
	if in.Date != nil {
		d = *in.Date
	}
	if in.TemplateID != nil && !isUUID(*in.TemplateID) {
		badRequest(w, "template_id is not valid")
		return
	}
	s, err := h.Store.StartSession(r.Context(), userID, d, in.TemplateID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if d == h.today(r.Context(), userID) {
		h.announceTraining(context.WithoutCancel(r.Context()), userID, s)
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"session": s})
}

// ListSessions handles GET /v1/sessions?from=&to=.
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	today := h.today(r.Context(), userID)
	from, to, ok := queryRange(w, r, store.Date{Time: today.AddDate(0, 0, -41)}, store.Date{Time: today.AddDate(0, 0, 14)})
	if !ok {
		return
	}
	list, err := h.Store.ListSessions(r.Context(), userID, from, to)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"sessions": list})
}

// GetSession handles GET /v1/sessions/{id}.
func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	s, err := h.Store.GetSession(r.Context(), auth.UserID(r), id)
	h.sessionResponse(w, r, http.StatusOK, s, err)
}

func (h *Handler) sessionResponse(w http.ResponseWriter, r *http.Request, status int, s store.Session, err error) {
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, status, map[string]any{"session": s})
}

// AddSessionBlock handles POST /v1/sessions/{id}/blocks {exercise_id}.
func (h *Handler) AddSessionBlock(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		ExerciseID string `json:"exercise_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !isUUID(in.ExerciseID) {
		badRequest(w, "exercise_id is required")
		return
	}
	s, err := h.Store.AddSessionBlock(r.Context(), auth.UserID(r), id, in.ExerciseID)
	h.sessionResponse(w, r, http.StatusCreated, s, err)
}

// PatchBlock handles PATCH /v1/sessions/{id}/blocks/{block_id}.
func (h *Handler) PatchBlock(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	blockID, ok := pathID(w, r, "block_id")
	if !ok {
		return
	}
	var in struct {
		Skipped    *bool `json:"skipped"`
		CardioDone *bool `json:"cardio_done"`
	}
	if !decode(w, r, &in) {
		return
	}
	s, err := h.Store.PatchBlock(r.Context(), auth.UserID(r), id, blockID, in.Skipped, in.CardioDone)
	h.sessionResponse(w, r, http.StatusOK, s, err)
}

// AddSet handles POST /v1/sessions/{id}/blocks/{block_id}/sets.
func (h *Handler) AddSet(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	blockID, ok := pathID(w, r, "block_id")
	if !ok {
		return
	}
	var in store.PlannedSet
	if !decode(w, r, &in) {
		return
	}
	if (in.TargetKg != nil && (*in.TargetKg < 0 || *in.TargetKg > 1000)) || (in.TargetReps != nil && (*in.TargetReps < 0 || *in.TargetReps > 200)) {
		badRequest(w, "target values are out of range")
		return
	}
	s, err := h.Store.AddSet(r.Context(), auth.UserID(r), id, blockID, in)
	h.sessionResponse(w, r, http.StatusCreated, s, err)
}

// PatchSet handles PATCH /v1/sessions/{id}/sets/{set_id}. Sending
// "actual_kg": null clears the value.
func (h *Handler) PatchSet(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	setID, ok := pathID(w, r, "set_id")
	if !ok {
		return
	}
	var in struct {
		ActualKg   optional[float64] `json:"actual_kg"`
		ActualReps optional[int]     `json:"actual_reps"`
		Done       *bool             `json:"done"`
	}
	if !decode(w, r, &in) {
		return
	}
	p := store.SetPatch{Done: in.Done, ActualKg: in.ActualKg.Value, ActualReps: in.ActualReps.Value,
		ClearKg: in.ActualKg.Set && in.ActualKg.Value == nil, ClearReps: in.ActualReps.Set && in.ActualReps.Value == nil}
	if (p.ActualKg != nil && (*p.ActualKg < 0 || *p.ActualKg > 1000)) || (p.ActualReps != nil && (*p.ActualReps < 0 || *p.ActualReps > 200)) {
		badRequest(w, "actual values are out of range")
		return
	}
	s, err := h.Store.PatchSet(r.Context(), auth.UserID(r), id, setID, p)
	h.sessionResponse(w, r, http.StatusOK, s, err)
}

// AcceptAll handles POST /v1/sessions/{id}/accept-all.
func (h *Handler) AcceptAll(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	s, err := h.Store.AcceptAll(r.Context(), auth.UserID(r), id)
	h.sessionResponse(w, r, http.StatusOK, s, err)
}

// FinishSession handles POST /v1/sessions/{id}/finish. The first finish writes
// the feed activity, record activities and friend pushes; finishing again
// only recomputes the proposals.
func (h *Handler) FinishSession(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := auth.UserID(r)
	before, err := h.Store.GetSession(r.Context(), userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	s, props, recs, err := h.Store.FinishSession(r.Context(), userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if props == nil {
		props = []store.Proposal{}
	}
	if recs == nil {
		recs = []store.Record{}
	}
	if err := h.Store.ClearTraining(r.Context(), id); err != nil {
		h.Log.Error("clear training", "err", err)
	}
	if before.Status != "finished" {
		h.announceWorkout(context.WithoutCancel(r.Context()), userID, s, recs)
		h.celebrateStreak(context.WithoutCancel(r.Context()), userID)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"session": s, "proposals": props, "records": recs})
}

// announceWorkout writes feed activity and pushes friends. Failures are only
// logged: the workout itself is already saved.
func (h *Handler) announceWorkout(ctx context.Context, userID string, s store.Session, recs []store.Record) {
	done := 0
	type exSummary struct {
		Name string   `json:"name"`
		Sets int      `json:"sets"`
		TopK *float64 `json:"top_kg"`
	}
	var exercises []exSummary
	for _, b := range s.Blocks {
		if b.Skipped {
			continue
		}
		sum := exSummary{Name: b.Exercise.Name}
		for _, st := range b.Sets {
			if !st.Done {
				continue
			}
			sum.Sets++
			if st.ActualKg != nil && (sum.TopK == nil || *st.ActualKg > *sum.TopK) {
				k := *st.ActualKg
				sum.TopK = &k
			}
		}
		if sum.Sets > 0 || b.CardioDone {
			done++
			exercises = append(exercises, sum)
		}
	}
	if done == 0 {
		return
	}
	p, err := h.Store.GetProfile(ctx, userID)
	if err != nil {
		h.Log.Error("announce workout", "err", err)
		return
	}
	sharing, err := h.Store.GetSharing(ctx, userID)
	if err != nil {
		h.Log.Error("announce workout", "err", err)
		return
	}
	what := "A workout"
	if s.TemplateName != nil {
		what = *s.TemplateName
	}
	text := fmt.Sprintf("%s done: %d exercise%s", what, done, plural(done))
	data := map[string]any{"exercises": done}
	if s.FinishedAt != nil {
		mins := int(math.Round(s.FinishedAt.Sub(s.StartedAt).Minutes()))
		if mins > 0 && mins < 300 {
			text += ", " + strconv.Itoa(mins) + " min"
			data["minutes"] = mins
		}
	}
	if s.TemplateName != nil {
		data["template"] = *s.TemplateName
	}
	if sharing.WorkoutDetails {
		data["details"] = exercises
	}
	sid := s.ID
	if _, err := h.Store.AddActivity(ctx, userID, "workout_finished", text, data, &sid); err != nil {
		h.Log.Error("add workout activity", "err", err)
	}
	for _, rec := range recs {
		rt := fmt.Sprintf("New record: %s %s kg", rec.ExerciseName, trimKg(rec.Kg))
		if rec.Reps != nil {
			rt += " × " + strconv.Itoa(*rec.Reps)
		}
		if _, err := h.Store.AddActivity(ctx, userID, "record", rt,
			map[string]any{"exercise_id": rec.ExerciseID, "kg": rec.Kg, "reps": rec.Reps}, &sid); err != nil {
			h.Log.Error("add record activity", "err", err)
		}
	}
	if !sharing.Workouts {
		return
	}
	friends, err := h.Store.FriendsToNotifyOfWorkout(ctx, userID)
	if err != nil {
		h.Log.Error("friends to notify", "err", err)
		return
	}
	h.Notifier.Notify(friends, push.Message{
		Title: p.DisplayName + " worked out today 💪",
		Body:  text,
		URL:   "/friends",
		Tag:   "workout-" + userID,
	})
}

// ApplyProposals handles POST /v1/sessions/{id}/apply.
func (h *Handler) ApplyProposals(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		ExerciseIDs []string `json:"exercise_ids"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(in.ExerciseIDs) == 0 {
		badRequest(w, "pick at least one exercise to update")
		return
	}
	for _, e := range in.ExerciseIDs {
		if !isUUID(e) {
			badRequest(w, "exercise_ids must be exercise ids")
			return
		}
	}
	t, err := h.Store.ApplyProposals(r.Context(), auth.UserID(r), id, in.ExerciseIDs)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"template": t})
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func trimKg(kg float64) string {
	return strconv.FormatFloat(math.Round(kg*100)/100, 'f', -1, 64)
}
