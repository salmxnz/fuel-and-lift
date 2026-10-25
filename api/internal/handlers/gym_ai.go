package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/salmxnz/fuel-and-lift/api/internal/ai"
	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// --- sharing exercises -------------------------------------------------------------

// SetExerciseVisibility handles PUT /v1/exercises/{id}/visibility {visibility}.
func (h *Handler) SetExerciseVisibility(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Visibility string `json:"visibility"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !store.Visibilities[in.Visibility] {
		badRequest(w, "visibility must be private, friends or public")
		return
	}
	e, err := h.Store.SetExerciseVisibility(r.Context(), auth.UserID(r), id, in.Visibility)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"exercise": e})
}

// SharedExercises handles GET /v1/exercises/shared?scope=friends|public&q=.
func (h *Handler) SharedExercises(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	if scope != "friends" && scope != "public" {
		badRequest(w, "scope must be friends or public")
		return
	}
	list, err := h.Store.SharedExercises(r.Context(), auth.UserID(r), scope, r.URL.Query().Get("q"))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"exercises": list})
}

// AddSharedExercise handles POST /v1/exercises/{id}/add: a copy of someone
// else's exercise becomes the user's own.
func (h *Handler) AddSharedExercise(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	e, err := h.Store.AddSharedExercise(r.Context(), auth.UserID(r), id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"exercise": e})
}

// --- gym photos ----------------------------------------------------------------------

// maxExercisePhotoBytes keeps gym photos small: the app sends a ~800 px JPEG.
const maxExercisePhotoBytes = 600 << 10

// PutExercisePhoto handles PUT /v1/exercises/{id}/photo {media_type, data}:
// the user's own photo of the machine at their gym.
func (h *Handler) PutExercisePhoto(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in ai.Image
	if err := httpx.DecodeLimit(w, r, &in, maxExercisePhotoBytes*4/3+64<<10); err != nil {
		badRequest(w, "invalid body: "+err.Error())
		return
	}
	if base64.StdEncoding.DecodedLen(len(in.Data)) > maxExercisePhotoBytes {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "that photo is too big — try a smaller one")
		return
	}
	data, err := base64.StdEncoding.DecodeString(in.Data)
	if err != nil || len(data) == 0 {
		badRequest(w, "data must be a base64 image")
		return
	}
	// Served from our origin, so trust what the bytes are, not the label.
	mediaType := http.DetectContentType(data)
	if !validImageTypes[mediaType] {
		badRequest(w, "that file isn't a JPEG, PNG or WebP image")
		return
	}
	e, err := h.Store.SetExercisePhoto(r.Context(), auth.UserID(r), id, mediaType, data)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"exercise": e})
}

// DeleteExercisePhoto handles DELETE /v1/exercises/{id}/photo.
func (h *Handler) DeleteExercisePhoto(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	e, err := h.Store.DeleteExercisePhoto(r.Context(), auth.UserID(r), id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"exercise": e})
}

// ExercisePhoto handles GET /v1/exercise-photos/{id} (no auth, like avatars):
// the id is unguessable and URLs carry ?v=, so the bytes never change.
func (h *Handler) ExercisePhoto(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	p, err := h.Store.GetExercisePhoto(r.Context(), id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", p.MediaType)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(p.Data)
}

// --- AI: name an exercise, read a cardio screen ----------------------------------

// ExerciseAI handles POST /v1/ai/exercise {text?, images?}: which exercise a
// photo of a machine (or a description) is, the weight set on it, and the
// sets to plan. Gym photos don't count toward the free photo estimates.
func (h *Handler) ExerciseAI(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Text   string     `json:"text"`
		Images []ai.Image `json:"images"`
	}
	if err := httpx.DecodeLimit(w, r, &in, 2*(maxImageBytes*4/3+1024)+64<<10); err != nil {
		badRequest(w, "invalid body: "+err.Error())
		return
	}
	in.Text = strings.TrimSpace(in.Text)
	if utf8.RuneCountInString(in.Text) > 300 {
		badRequest(w, "text is limited to 300 characters")
		return
	}
	if len(in.Images) > 2 {
		badRequest(w, "send at most 2 photos")
		return
	}
	if !checkImages(w, in.Images) {
		return
	}
	if in.Text == "" && len(in.Images) == 0 {
		badRequest(w, "send a photo or describe the exercise")
		return
	}
	userID := auth.UserID(r)
	ctx := r.Context()
	a, ok := h.aiGate(w, r, userID, false)
	if !ok {
		return
	}
	all, err := h.Store.ListExercises(ctx, userID, "")
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	byName := map[string]store.Exercise{}
	library := make([]ai.LibraryExercise, 0, len(all))
	for _, e := range all {
		byName[strings.ToLower(e.Name)] = e
		library = append(library, ai.LibraryExercise{Name: e.Name, MuscleGroup: deref(e.MuscleGroup), Equipment: deref(e.Equipment)})
	}
	var guess ai.ExerciseGuess
	res, failed, err := h.AI.Call(ctx, ai.ExerciseCall(ai.ExerciseRequest{Text: in.Text, Images: in.Images, Library: library}),
		func(raw json.RawMessage) error {
			var err error
			guess, err = ai.DecodeExercise(raw, library)
			return err
		})
	base := store.AIRecord{UserID: userID, Kind: "exercise", HasImage: len(in.Images) > 0, ImageCount: len(in.Images), InputText: in.Text}
	h.recordAIFailures(ctx, base, failed)
	if err != nil {
		h.aiFailed(w, err)
		return
	}
	rec := base
	rec.Provider, rec.Model, rec.Result, rec.OK = res.Provider, res.Model, guess, true
	rec.InputTokens, rec.OutputTokens, rec.CostUSD = res.Usage.InputTokens, res.Usage.OutputTokens, res.Usage.CostUSD
	rec.LatencyMS = int(res.Latency.Milliseconds())
	if _, err := h.Store.RecordAI(context.WithoutCancel(ctx), rec); err != nil {
		h.storeError(w, r, err)
		return
	}
	a.usage.CallsToday++

	type option struct {
		ai.ExerciseOption
		// Match is the library (or the user's own) exercise to use, when the
		// AI found one; else the app creates a new one from the option.
		Match *store.Exercise `json:"match"`
		// PictureFrom is the exercise whose stock picture a new one borrows.
		PictureFrom *string `json:"picture_from"`
		MediaURL    *string `json:"media_url"`
	}
	opts := make([]option, 0, len(guess.Options))
	for _, o := range guess.Options {
		x := option{ExerciseOption: o}
		if e, ok := byName[strings.ToLower(o.LibraryName)]; ok && o.LibraryName != "" {
			x.Match = &e
		} else if e, ok := byName[strings.ToLower(o.Name)]; ok {
			x.Match = &e // they made this one before
		}
		if x.Match != nil {
			x.MediaURL = x.Match.MediaURL
		} else if e, ok := byName[strings.ToLower(o.PictureLike)]; ok && o.PictureLike != "" {
			id := e.ID
			x.PictureFrom, x.MediaURL = &id, e.MediaURL
		}
		opts = append(opts, x)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"found":         guess.Found,
		"options":       opts,
		"weight_kg":     guess.WeightKg,
		"weight_source": guess.WeightSource,
		"weight_note":   guess.WeightNote,
		"sets":          guess.Sets,
		"reps":          guess.Reps,
		"note":          guess.Note,
		"confidence":    guess.Confidence,
		"model":         res.Model,
		"usage":         h.usageBody(a),
	})
}

// CardioScreenAI handles POST /v1/ai/cardio-screen {image, exercise?}: the
// numbers on a cardio machine's screen, to fill in what was done.
func (h *Handler) CardioScreenAI(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Image    *ai.Image `json:"image"`
		Exercise string    `json:"exercise"`
	}
	if err := httpx.DecodeLimit(w, r, &in, maxImageBytes*4/3+64<<10); err != nil {
		badRequest(w, "invalid body: "+err.Error())
		return
	}
	if in.Image == nil {
		badRequest(w, "send a photo of the screen")
		return
	}
	if !checkImages(w, []ai.Image{*in.Image}) {
		return
	}
	in.Exercise = ai.Clip(in.Exercise, 60)
	userID := auth.UserID(r)
	ctx := r.Context()
	a, ok := h.aiGate(w, r, userID, false)
	if !ok {
		return
	}
	var reading ai.ScreenReading
	res, failed, err := h.AI.Call(ctx, ai.ScreenCall(ai.ScreenRequest{Image: *in.Image, Exercise: in.Exercise}),
		func(raw json.RawMessage) error {
			var err error
			reading, err = ai.DecodeScreen(raw)
			return err
		})
	base := store.AIRecord{UserID: userID, Kind: "cardio_screen", HasImage: true, ImageCount: 1, InputText: in.Exercise}
	h.recordAIFailures(ctx, base, failed)
	if err != nil {
		h.aiFailed(w, err)
		return
	}
	rec := base
	rec.Provider, rec.Model, rec.Result, rec.OK = res.Provider, res.Model, reading, true
	rec.InputTokens, rec.OutputTokens, rec.CostUSD = res.Usage.InputTokens, res.Usage.OutputTokens, res.Usage.CostUSD
	rec.LatencyMS = int(res.Latency.Milliseconds())
	if _, err := h.Store.RecordAI(context.WithoutCancel(ctx), rec); err != nil {
		h.storeError(w, r, err)
		return
	}
	a.usage.CallsToday++
	httpx.JSON(w, http.StatusOK, map[string]any{"reading": reading, "model": res.Model, "usage": h.usageBody(a)})
}

func (h *Handler) aiFailed(w http.ResponseWriter, err error) {
	if errors.Is(err, context.Canceled) {
		return
	}
	h.Log.Warn("AI call failed", "err", err)
	httpx.ErrorCode(w, http.StatusBadGateway, "ai_failed", "the AI couldn't read that one — try again or add it by hand")
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// --- session order and rest alerts ------------------------------------------------

// ReorderSession handles PUT /v1/sessions/{id}/order {block_ids}.
func (h *Handler) ReorderSession(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		BlockIDs []string `json:"block_ids"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(in.BlockIDs) == 0 || len(in.BlockIDs) > 60 {
		badRequest(w, "block_ids must list the workout's exercises")
		return
	}
	for _, b := range in.BlockIDs {
		if !isUUID(b) {
			badRequest(w, "block_ids must be block ids")
			return
		}
	}
	s, err := h.Store.ReorderSession(r.Context(), auth.UserID(r), id, in.BlockIDs)
	h.sessionResponse(w, r, http.StatusOK, s, err)
}

// restTimers are pending "rest's over" pushes, one per user. They live in
// memory: a restart loses at most one alert.
type restTimers struct {
	mu sync.Mutex
	m  map[string]*time.Timer
}

func (t *restTimers) set(userID string, d time.Duration, fn func()) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.m == nil {
		t.m = map[string]*time.Timer{}
	}
	if old := t.m[userID]; old != nil {
		old.Stop()
	}
	var timer *time.Timer
	timer = time.AfterFunc(d, func() {
		t.mu.Lock()
		if t.m[userID] == timer {
			delete(t.m, userID)
		}
		t.mu.Unlock()
		fn()
	})
	t.m[userID] = timer
}

func (t *restTimers) cancel(userID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if old := t.m[userID]; old != nil {
		old.Stop()
		delete(t.m, userID)
	}
}

// StartRest handles POST /v1/sessions/{id}/rest {seconds, next}: a push when
// the rest is over, so it reaches a locked phone. Starting another rest
// replaces it; DELETE cancels it.
func (h *Handler) StartRest(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Seconds int    `json:"seconds"`
		Next    string `json:"next"` // "Set 3 · Bench press 60 kg × 8"
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Seconds < 5 || in.Seconds > 1800 {
		badRequest(w, "seconds must be between 5 and 1800")
		return
	}
	userID := auth.UserID(r)
	s, err := h.Store.GetSession(r.Context(), userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if s.Status != "active" {
		httpx.Error(w, http.StatusConflict, "this workout is finished")
		return
	}
	body := ai.Clip(in.Next, 120)
	if body == "" {
		body = "Back to it"
	} else {
		body = "Next: " + body
	}
	msg := push.Message{Kind: "rest_timer", Title: "Rest's over 💪", Body: body, URL: "/gym/session/" + id, Tag: "rest-" + id, Urgent: true}
	h.rest.set(userID, time.Duration(in.Seconds)*time.Second, func() {
		h.Notifier.Notify([]string{userID}, msg)
	})
	httpx.JSON(w, http.StatusAccepted, map[string]any{"ends_at": h.now().Add(time.Duration(in.Seconds) * time.Second)})
}

// StopRest handles DELETE /v1/sessions/{id}/rest.
func (h *Handler) StopRest(w http.ResponseWriter, r *http.Request) {
	if _, ok := pathID(w, r, "id"); !ok {
		return
	}
	h.rest.cancel(auth.UserID(r))
	httpx.NoContent(w)
}

// --- insights and this week's extras --------------------------------------------

// Muscles people tend to skip: only these get a nudge when they've never
// been trained (others only once they lapse).
var oftenSkipped = map[string]bool{
	"upper chest": true, "rear delts": true, "side delts": true, "forearms": true,
	"hamstrings": true, "calves": true, "abs": true, "lower back": true,
}

// Nudge says a muscle needs some work and offers exercises for it.
type Nudge struct {
	Muscle    string                    `json:"muscle"`
	Text      string                    `json:"text"`
	DaysSince *int                      `json:"days_since"` // nil: not in the last 90 days
	Exercises []store.SuggestedExercise `json:"exercises"`
	// AddTo is the next workout this week the exercises can go into.
	AddTo *NudgeTarget `json:"add_to"`
}

// NudgeTarget is a workout planned later this week.
type NudgeTarget struct {
	TemplateID string     `json:"template_id"`
	Name       string     `json:"name"`
	Date       store.Date `json:"date"`
}

// GymInsights handles GET /v1/gym/insights: when each muscle was last
// trained, up to two nudges for ones that need work, and this week's extras.
func (h *Handler) GymInsights(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := auth.UserID(r)
	today := h.today(ctx, userID)
	stats, days, err := h.Store.MuscleStats(ctx, userID, today)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	extras, err := h.Store.PendingWeekExtras(ctx, userID, store.WeekStart(today))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	nudges := []Nudge{}
	// New or barely-training users get no nudges: there's nothing to compare.
	if days >= 3 {
		target, err := h.nextWorkout(ctx, userID, today)
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		pending := map[string]bool{}
		for _, x := range extras {
			for _, m := range x.Exercise.Muscles {
				pending[m] = true
			}
		}
		for _, n := range pickNudges(stats, today, pending) {
			ex, err := h.Store.ExercisesFor(ctx, userID, n.Muscle, 2)
			if err != nil {
				h.storeError(w, r, err)
				return
			}
			if len(ex) == 0 {
				continue
			}
			n.Exercises, n.AddTo = ex, target
			nudges = append(nudges, n)
		}
	}
	if stats == nil {
		stats = []store.MuscleStat{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"muscles": stats, "nudges": nudges, "extras": extras})
}

// pickNudges chooses up to two muscles to nudge, most overdue first: ones
// trained before that have lapsed two weeks or more, then regulars missing
// this week (from Thursday), then often-skipped ones never trained lately.
// Muscles with extras already planned this week are left out.
func pickNudges(stats []store.MuscleStat, today store.Date, pending map[string]bool) []Nudge {
	seen := map[string]store.MuscleStat{}
	for _, s := range stats {
		seen[s.Muscle] = s
	}
	var lapsed, thisWeek, never []Nudge
	weekday := (int(today.Weekday()) + 6) % 7 // Monday 0
	for _, m := range ai.Muscles {
		if pending[m] {
			continue
		}
		s, ok := seen[m]
		if !ok {
			if oftenSkipped[m] {
				never = append(never, Nudge{Muscle: m, Text: fmt.Sprintf("No %s work in the last 3 months", m)})
			}
			continue
		}
		since := int(today.Sub(s.LastTrained.Time).Hours() / 24)
		switch {
		case since >= 14:
			lapsed = append(lapsed, Nudge{Muscle: m, DaysSince: &since, Text: fmt.Sprintf("You haven't trained %s in %s", m, agoText(since))})
		case s.SetsThisWeek == 0 && s.Days4Weeks >= 3 && weekday >= 3:
			thisWeek = append(thisWeek, Nudge{Muscle: m, DaysSince: &since, Text: fmt.Sprintf("You haven't trained %s this week", m)})
		}
	}
	// Longest lapse first.
	sort.SliceStable(lapsed, func(i, j int) bool { return *lapsed[i].DaysSince > *lapsed[j].DaysSince })
	out := append(append(lapsed, thisWeek...), never...)
	if len(out) > 2 {
		out = out[:2]
	}
	return out
}

// agoText is "2 weeks", "a month", "3 months".
func agoText(days int) string {
	switch {
	case days < 28:
		return fmt.Sprintf("%d weeks", days/7)
	case days < 56:
		return "a month"
	default:
		return fmt.Sprintf("%d months", min(days/30, 3))
	}
}

// nextWorkout is the next planned workout from today to Sunday that hasn't
// been started yet, or nil.
func (h *Handler) nextWorkout(ctx context.Context, userID string, today store.Date) (*NudgeTarget, error) {
	plan, err := h.Store.GetWeeklyPlan(ctx, userID)
	if err != nil {
		return nil, err
	}
	monday := store.WeekStart(today)
	sessions, err := h.Store.ListSessions(ctx, userID, monday, store.Date{Time: monday.AddDate(0, 0, 6)})
	if err != nil {
		return nil, err
	}
	started := map[string]bool{}
	for _, s := range sessions {
		if s.TemplateID != nil {
			started[s.Date.String()+*s.TemplateID] = true
		}
	}
	templates, err := h.Store.ListTemplates(ctx, userID)
	if err != nil {
		return nil, err
	}
	names := map[string]string{}
	for _, t := range templates {
		names[t.ID] = t.Name
	}
	for d := today; d.Sub(monday.Time) < 7*24*time.Hour; d = (store.Date{Time: d.AddDate(0, 0, 1)}) {
		id := plan[store.Weekdays[(int(d.Weekday())+6)%7]]
		if id == nil || names[*id] == "" || started[d.String()+*id] {
			continue
		}
		return &NudgeTarget{TemplateID: *id, Name: names[*id], Date: d}, nil
	}
	return nil, nil
}

// AddWeekExtras handles POST /v1/gym/week-extras {template_id, date, blocks}:
// exercises added to that workout for that date's week only.
func (h *Handler) AddWeekExtras(w http.ResponseWriter, r *http.Request) {
	var in struct {
		TemplateID string             `json:"template_id"`
		Date       *store.Date        `json:"date"`
		Blocks     []store.BlockInput `json:"blocks"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !isUUID(in.TemplateID) {
		badRequest(w, "template_id is required")
		return
	}
	if len(in.Blocks) == 0 || len(in.Blocks) > 6 {
		badRequest(w, "add 1 to 6 exercises")
		return
	}
	for _, b := range in.Blocks {
		if msg := checkBlock(b); msg != "" {
			badRequest(w, msg)
			return
		}
	}
	userID := auth.UserID(r)
	d := h.today(r.Context(), userID)
	if in.Date != nil {
		d = *in.Date
	}
	week := store.WeekStart(d)
	if err := h.Store.AddWeekExtras(r.Context(), userID, in.TemplateID, week, in.Blocks); err != nil {
		h.storeError(w, r, err)
		return
	}
	extras, err := h.Store.PendingWeekExtras(r.Context(), userID, week)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"extras": extras})
}

// DeleteWeekExtra handles DELETE /v1/gym/week-extras/{id}.
func (h *Handler) DeleteWeekExtra(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.DeleteWeekExtra(r.Context(), auth.UserID(r), id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}
