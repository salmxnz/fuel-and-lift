package ai

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
)

// Gym helpers: name an exercise from a photo of the machine (and read the
// weight off the pin or the plates), or from a description; and read a cardio
// machine's screen at the end.

// MuscleGroups, Muscles and Equipment are the words the exercise library
// uses. Muscles are finer than groups ("rear delts", not "shoulders"), so the
// Gym tab can say what hasn't been trained in a while.
var (
	MuscleGroups = []string{"chest", "back", "shoulders", "biceps", "triceps", "forearms", "legs", "glutes", "calves", "core", "full body", "cardio"}
	Muscles      = []string{
		"upper chest", "mid chest", "lower chest",
		"front delts", "side delts", "rear delts",
		"lats", "upper back", "traps", "lower back",
		"biceps", "triceps", "forearms",
		"quads", "hamstrings", "glutes", "adductors", "abductors", "calves",
		"abs", "obliques",
	}
	Equipment = []string{
		"machine", "cable machine", "smith machine", "barbell", "dumbbell", "ez bar", "trap bar", "t-bar", "kettlebell",
		"bodyweight", "ab wheel", "box", "sled", "bands",
		"treadmill", "bike", "rower", "elliptical", "stair climber", "ski erg", "jump rope", "battle ropes", "running", "walking", "pool",
	}
)

// LibraryExercise is an exercise the AI may answer with.
type LibraryExercise struct {
	Name        string
	MuscleGroup string
	Equipment   string
}

// ExerciseRequest asks what exercise a photo or description shows.
type ExerciseRequest struct {
	Text    string
	Images  []Image // a photo of the machine, maybe its instruction placard
	Library []LibraryExercise
}

// ExerciseOption is one exercise the AI offers.
type ExerciseOption struct {
	// LibraryName is an exact name from the library when one is the same
	// exercise on the same kind of equipment, else "".
	LibraryName string   `json:"library_name"`
	Name        string   `json:"name"`
	Kind        string   `json:"kind"`
	MuscleGroup string   `json:"muscle_group"`
	Muscles     []string `json:"muscles"` // main muscle first
	Equipment   string   `json:"equipment"`
	// PictureLike is the library exercise whose stock photo looks most like
	// this one, for a new exercise's picture.
	PictureLike string `json:"picture_like"`
	// Cue says what it works and how it differs, in a few words.
	Cue string `json:"cue"`
}

// ExerciseGuess is the AI's answer: one option for a photo or a specific
// exercise, up to three variations for something vague ("rear delt").
type ExerciseGuess struct {
	Found        bool             `json:"found"`
	Options      []ExerciseOption `json:"options"`
	WeightKg     *float64         `json:"weight_kg"`
	WeightSource string           `json:"weight_source"` // pin | plates | dumbbell | text | none
	WeightNote   string           `json:"weight_note"`
	Sets         int              `json:"sets"`
	Reps         *int             `json:"reps"`
	Note         string           `json:"note"`
	Confidence   float64          `json:"confidence"`
}

var exerciseSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"found", "options", "weight_kg", "weight_source", "weight_note", "sets", "reps", "note", "confidence"},
	"properties": map[string]any{
		"found": map[string]any{"type": "boolean", "description": "false when no exercise or gym equipment can be made out"},
		"options": map[string]any{
			"type": "array",
			"items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"library_name", "name", "kind", "muscle_group", "muscles", "equipment", "picture_like", "cue"},
				"properties": map[string]any{
					"library_name": map[string]any{"type": "string", "description": "Exact name from the library list when it is the same exercise on the same kind of equipment, else \"\""},
					"name":         map[string]any{"type": "string", "description": "Short everyday name, e.g. \"Pec deck\", \"Plate-loaded chest press\""},
					"kind":         map[string]any{"type": "string", "enum": []string{"strength", "cardio"}},
					"muscle_group": map[string]any{"type": "string", "enum": MuscleGroups},
					"muscles":      map[string]any{"type": "array", "items": map[string]any{"type": "string", "enum": Muscles}, "description": "Muscles worked, main one first (1 to 3)"},
					"equipment":    map[string]any{"type": "string", "enum": Equipment},
					"picture_like": map[string]any{"type": "string", "description": "Library name whose photo looks most like this exercise, or \"\""},
					"cue":          map[string]any{"type": "string", "description": "At most 8 words: what it works and how it differs, e.g. \"Rear delts, strict, easy to load\""},
				},
			},
		},
		"weight_kg":     map[string]any{"type": []string{"number", "null"}, "description": "The load set on the machine in the photo, in kg"},
		"weight_source": map[string]any{"type": "string", "enum": []string{"pin", "plates", "dumbbell", "text", "none"}},
		"weight_note":   map[string]any{"type": "string", "description": "How the weight was read, in a few words"},
		"sets":          map[string]any{"type": "integer"},
		"reps":          map[string]any{"type": []string{"integer", "null"}},
		"note":          map[string]any{"type": "string", "description": "One short line for the user, or \"\""},
		"confidence":    map[string]any{"type": "number", "description": "0 to 1"},
	},
}

const exerciseSystem = `You help someone log a gym workout. From a photo of a machine or piece of equipment (sometimes its instruction placard), or from their description, you say which exercise it is and what weight is set.

Rules:
- options: for a photo, or a description of one specific exercise, give exactly one option. For something vague, like a muscle or a goal ("rear delt", "upper chest", "something for forearms"), give three good variations that differ in equipment or angle, best first.
- For each option: if one exercise in the library list is the same movement on the same kind of equipment, set library_name to its exact name and use that name. Machines differ between brands: a "pec deck" or "butterfly" is "Pec deck"; a plate-loaded chest press is not "Chest press (machine)" unless the list has nothing closer. Otherwise set library_name to "" and give a short everyday name (keep a model name like "N933" out of it).
- muscles: the muscles it works, main one first, from the list (an incline press is "upper chest" first, a reverse pec deck "rear delts").
- picture_like is the library exercise whose photo would look most like this one (same movement), even when library_name is "".
- cue: at most 8 words on what it works and how it differs from the other options. Don't describe the photo.
- A placard often names the machine and shows the muscles worked: use it.
- Weight, only from what you can see or what the user says:
  - Selectorized stack: the number on the plate where the pin is (weight_source "pin"). If the stack is in lb, convert to kg and say so in weight_note.
  - Plate-loaded machine or bar: add up the plates you can see (weight_source "plates"). If only one side is visible and the machine loads both sides, assume the other side matches and say so. Don't add the bar or the machine's own weight.
  - Dumbbells: the number on one dumbbell (weight_source "dumbbell").
  - The user said a weight: use it (weight_source "text").
  - Can't see it: weight_kg null, weight_source "none", and the note asks them to set it.
- sets: what the user said, else 3. reps: what the user said, else a sensible number for the exercise (10 for most machines, 12 for small isolation moves). Cardio: sets 0, reps null.
- note: one short, friendly line, only when it helps (what you assumed, or what to check). Otherwise "".
- If the photo shows no exercise or gym equipment, set found to false.
- Respond only with JSON matching the schema.`

// ExerciseCall is the structured call that identifies an exercise.
func ExerciseCall(req ExerciseRequest) Call {
	var b strings.Builder
	switch {
	case len(req.Images) > 1:
		fmt.Fprintf(&b, "%d photos of one piece of gym equipment (for example the machine and its placard).\n", len(req.Images))
	case len(req.Images) == 1:
		b.WriteString("A photo of a piece of gym equipment.\n")
	default:
		b.WriteString("An exercise described in words.\n")
	}
	if t := strings.TrimSpace(req.Text); t != "" {
		b.WriteString("The user says: \"" + t + "\"\n")
	}
	b.WriteString("The library (name | muscle group | equipment):\n")
	for _, e := range req.Library {
		fmt.Fprintf(&b, "- %s | %s | %s\n", e.Name, e.MuscleGroup, e.Equipment)
	}
	b.WriteString("Return the answer as JSON.")
	return Call{
		Name: "record_exercise", Description: "Record which exercise this is and the weight set.",
		System: exerciseSystem, Text: b.String(), Images: req.Images, Schema: exerciseSchema, MaxTokens: 600,
	}
}

// NormaliseExercise cleans the AI's answer: library_name and picture_like
// must be real library names, numbers are clamped, words come from the lists,
// and there are 1 to 3 different options.
func NormaliseExercise(g *ExerciseGuess, library []LibraryExercise) error {
	if !g.Found {
		g.Options = []ExerciseOption{}
		return nil
	}
	names := map[string]string{}
	for _, e := range library {
		names[strings.ToLower(e.Name)] = e.Name
	}
	var opts []ExerciseOption
	seen := map[string]bool{}
	for _, o := range g.Options {
		o.LibraryName = names[strings.ToLower(strings.TrimSpace(o.LibraryName))]
		o.PictureLike = names[strings.ToLower(strings.TrimSpace(o.PictureLike))]
		if o.LibraryName != "" {
			o.Name, o.PictureLike = o.LibraryName, o.LibraryName
		}
		o.Name = Clip(o.Name, 60)
		if o.Name == "" || seen[strings.ToLower(o.Name)] {
			continue
		}
		seen[strings.ToLower(o.Name)] = true
		if o.Kind != "cardio" {
			o.Kind = "strength"
		}
		if !slices.Contains(MuscleGroups, o.MuscleGroup) {
			o.MuscleGroup = ""
		}
		if !slices.Contains(Equipment, o.Equipment) {
			o.Equipment = ""
		}
		var ms []string
		for _, m := range o.Muscles {
			if slices.Contains(Muscles, m) && !slices.Contains(ms, m) && len(ms) < 3 {
				ms = append(ms, m)
			}
		}
		if ms == nil {
			ms = []string{}
		}
		o.Muscles = ms
		o.Cue = Clip(o.Cue, 80)
		opts = append(opts, o)
		if len(opts) == 3 {
			break
		}
	}
	if len(opts) == 0 {
		return errors.New("the model named no exercise")
	}
	g.Options = opts
	if opts[0].Kind == "cardio" {
		g.Sets, g.Reps, g.WeightKg = 0, nil, nil
	}
	if g.WeightKg != nil {
		w := math.Round(*g.WeightKg*4) / 4
		if w <= 0 || w > 1000 {
			g.WeightKg = nil
		} else {
			g.WeightKg = &w
		}
	}
	if g.WeightKg == nil {
		g.WeightSource = "none"
	}
	g.WeightNote, g.Note = Clip(g.WeightNote, 120), Clip(g.Note, 160)
	if opts[0].Kind != "cardio" {
		g.Sets = min(max(g.Sets, 1), 12)
		if g.Reps != nil && (*g.Reps < 1 || *g.Reps > 100) {
			g.Reps = nil
		}
	}
	g.Confidence = math.Min(1, math.Max(0, g.Confidence))
	return nil
}

// ScreenRequest asks what a cardio machine's screen says.
type ScreenRequest struct {
	Image    Image
	Exercise string // "Treadmill"
}

// ScreenReading is what was read off the screen, metric. Fields the screen
// doesn't show are null.
type ScreenReading struct {
	Found      bool     `json:"found"`
	Minutes    *float64 `json:"minutes"`
	DistanceKm *float64 `json:"distance_km"`
	Incline    *float64 `json:"incline"`
	Speed      *float64 `json:"speed"` // km/h
	Level      *float64 `json:"level"`
	Kcal       *float64 `json:"kcal"`
	Note       string   `json:"note"`
}

var screenSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"found", "minutes", "distance_km", "incline", "speed", "level", "kcal", "note"},
	"properties": map[string]any{
		"found":       map[string]any{"type": "boolean", "description": "false when no workout numbers can be read"},
		"minutes":     map[string]any{"type": []string{"number", "null"}, "description": "Elapsed time in minutes (25:30 is 25.5)"},
		"distance_km": map[string]any{"type": []string{"number", "null"}},
		"incline":     map[string]any{"type": []string{"number", "null"}, "description": "Incline in %"},
		"speed":       map[string]any{"type": []string{"number", "null"}, "description": "Speed in km/h (average if shown, else current)"},
		"level":       map[string]any{"type": []string{"number", "null"}, "description": "Resistance level"},
		"kcal":        map[string]any{"type": []string{"number", "null"}},
		"note":        map[string]any{"type": "string", "description": "One short line, e.g. a unit conversion you made, or \"\""},
	},
}

const screenSystem = `You read the summary screen of a gym cardio machine (treadmill, bike, rower, elliptical, stair climber) from a photo, for a workout log.

Rules:
- Read only numbers you can see. Leave anything not shown as null; never guess.
- Time is elapsed workout time in minutes ("25:30" is 25.5, "1:02:00" is 62). Ignore time remaining and the clock.
- Convert to metric: miles to km, mph to km/h, and say so in the note. A rower's "2000 m" is 2 km.
- Speed: prefer the average speed when shown, else the current speed. Pace (min/km or a rower's /500 m split) is not speed: leave speed null unless the screen also shows speed.
- Incline in %. Level is the resistance level.
- If the photo shows no workout screen, set found to false.
- Respond only with JSON matching the schema.`

// ScreenCall is the structured call that reads a cardio screen.
func ScreenCall(req ScreenRequest) Call {
	text := "A photo of a cardio machine's screen at the end of a workout."
	if e := strings.TrimSpace(req.Exercise); e != "" {
		text += " The exercise is \"" + e + "\"."
	}
	return Call{
		Name: "record_screen", Description: "Record the numbers on the cardio machine's screen.",
		System: screenSystem, Text: text + "\nReturn the numbers as JSON.", Images: []Image{req.Image}, Schema: screenSchema, MaxTokens: 400,
	}
}

// NormaliseScreen drops impossible numbers and rounds the rest.
func NormaliseScreen(s *ScreenReading) {
	clamp := func(p **float64, max float64, places float64) {
		if *p == nil {
			return
		}
		v := **p
		if math.IsNaN(v) || v < 0 || v > max {
			*p = nil
			return
		}
		v = math.Round(v*places) / places
		*p = &v
	}
	clamp(&s.Minutes, 600, 10)
	clamp(&s.DistanceKm, 300, 100)
	clamp(&s.Incline, 40, 10)
	clamp(&s.Speed, 60, 10)
	clamp(&s.Level, 50, 10)
	clamp(&s.Kcal, 5000, 1)
	s.Note = Clip(s.Note, 160)
	if s.Minutes == nil && s.DistanceKm == nil && s.Kcal == nil && s.Speed == nil && s.Level == nil && s.Incline == nil {
		s.Found = false
	}
}

// DecodeExercise decodes and cleans an exercise answer.
func DecodeExercise(raw json.RawMessage, library []LibraryExercise) (ExerciseGuess, error) {
	var g ExerciseGuess
	if err := json.Unmarshal(raw, &g); err != nil {
		return g, fmt.Errorf("model returned a malformed answer: %w", err)
	}
	return g, NormaliseExercise(&g, library)
}

// DecodeScreen decodes and cleans a screen reading.
func DecodeScreen(raw json.RawMessage) (ScreenReading, error) {
	var s ScreenReading
	if err := json.Unmarshal(raw, &s); err != nil {
		return s, fmt.Errorf("model returned a malformed answer: %w", err)
	}
	NormaliseScreen(&s)
	return s, nil
}
