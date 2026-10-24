// Package splits holds the preset gym splits (Push Pull Legs, Bro split…)
// offered at onboarding and in the Gym tab. A split is a few workouts and a
// rotation: the workouts are cycled over the days the user trains, so PPL on
// Mon/Wed/Fri is Push, Pull, Legs and on six days it goes round twice.
//
// Exercises are named, not referenced: they must be names in the shared
// library (migrations 000002 and 000004). A test applies every split to check.
package splits

import "sort"

// Block is one exercise of a preset workout.
type Block struct {
	Exercise  string
	Sets      int
	Reps      int
	CardioMin float64 // a cardio warm-up instead of sets
}

// Workout is one preset workout ("Push").
type Workout struct {
	Name   string
	Blocks []Block
}

// Split is a preset week of workouts.
type Split struct {
	Key         string
	Name        string
	Description string
	MinDays     int
	MaxDays     int
	DefaultDays []int // 0 = Monday
	Workouts    []Workout
	Rotation    []int // workout indexes, cycled over the chosen days
}

// All are the splits users can pick, in display order.
var All = []Split{fullBody, upperLower, ppl, arnold, bro}

// Starter is what everyone got before splits existed: two workouts not tied to
// any split. Onboarding without a split still seeds these.
var Starter = Split{
	Key: "starter", Name: "Starter", MinDays: 0, MaxDays: 7,
	Workouts: []Workout{{"Upper-1", upperBlocks}, {"Lower-1", lowerBlocks}},
	Rotation: []int{0, 1},
}

// Get returns the split with key.
func Get(key string) (Split, bool) {
	for _, s := range All {
		if s.Key == key {
			return s, true
		}
	}
	return Split{}, false
}

// Assign maps each training day to a workout index, cycling the rotation over
// the days in week order.
func Assign(s Split, days []int) map[int]int {
	sorted := append([]int(nil), days...)
	sort.Ints(sorted)
	out := make(map[int]int, len(sorted))
	for i, d := range sorted {
		out[d] = s.Rotation[i%len(s.Rotation)]
	}
	return out
}

// Used lists the workout indexes days need, in rotation order. With no days
// it is every workout of the split.
func Used(s Split, days []int) []int {
	if len(days) == 0 {
		out := make([]int, len(s.Workouts))
		for i := range out {
			out[i] = i
		}
		return out
	}
	assigned := Assign(s, days)
	seen := map[int]bool{}
	var out []int
	for _, w := range s.Rotation {
		for _, got := range assigned {
			if got == w && !seen[w] {
				seen[w] = true
				out = append(out, w)
			}
		}
	}
	return out
}

// Names lists every library exercise the splits use.
func Names() []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range append(All, Starter) {
		for _, w := range s.Workouts {
			for _, b := range w.Blocks {
				if !seen[b.Exercise] {
					seen[b.Exercise] = true
					out = append(out, b.Exercise)
				}
			}
		}
	}
	return out
}

func sets(name string, n, reps int) Block   { return Block{Exercise: name, Sets: n, Reps: reps} }
func cardio(name string, min float64) Block { return Block{Exercise: name, CardioMin: min} }

var upperBlocks = []Block{
	cardio("Treadmill", 5),
	sets("Lat pulldown", 3, 10),
	sets("T-bar row", 3, 8),
	sets("Incline dumbbell press", 3, 8),
	sets("Chest fly (machine)", 3, 12),
	sets("Lateral raise", 3, 12),
	sets("Triceps pushdown", 3, 12),
}

var lowerBlocks = []Block{
	cardio("Stationary bike", 5),
	sets("Back squat", 3, 8),
	sets("Romanian deadlift", 3, 10),
	sets("Leg press", 3, 10),
	sets("Seated leg curl", 3, 12),
	sets("Standing calf raise", 3, 12),
}

var fullBody = Split{
	Key: "full_body", Name: "Full Body",
	Description: "Everything in each session. Great for starting out or training 2 to 4 days.",
	MinDays:     2, MaxDays: 4, DefaultDays: []int{0, 2, 4},
	Workouts: []Workout{
		{"Full Body A", []Block{
			cardio("Treadmill", 5),
			sets("Back squat", 3, 8),
			sets("Bench press", 3, 8),
			sets("Seated cable row", 3, 10),
			sets("Romanian deadlift", 3, 10),
			sets("Lateral raise", 3, 12),
			sets("Triceps pushdown", 2, 12),
		}},
		{"Full Body B", []Block{
			cardio("Stationary bike", 5),
			sets("Deadlift", 3, 5),
			sets("Overhead press", 3, 8),
			sets("Lat pulldown", 3, 10),
			sets("Leg press", 3, 10),
			sets("Incline dumbbell press", 3, 10),
			sets("Barbell curl", 2, 12),
		}},
	},
	Rotation: []int{0, 1},
}

var upperLower = Split{
	Key: "upper_lower", Name: "Upper / Lower",
	Description: "Upper body one day, legs the next. A balanced 4-day classic.",
	MinDays:     2, MaxDays: 6, DefaultDays: []int{0, 1, 3, 4},
	Workouts: []Workout{{"Upper", upperBlocks}, {"Lower", lowerBlocks}},
	Rotation: []int{0, 1},
}

var ppl = Split{
	Key: "ppl", Name: "Push Pull Legs",
	Description: "Pushing muscles, pulling muscles, then legs. Run it once or twice a week.",
	MinDays:     3, MaxDays: 6, DefaultDays: []int{0, 2, 4},
	Workouts: []Workout{
		{"Push", []Block{
			sets("Bench press", 4, 6),
			sets("Overhead press", 3, 8),
			sets("Incline dumbbell press", 3, 10),
			sets("Lateral raise", 3, 12),
			sets("Triceps pushdown", 3, 12),
			sets("Overhead triceps extension", 2, 12),
		}},
		{"Pull", []Block{
			sets("Deadlift", 3, 5),
			sets("Pull-up", 3, 8),
			sets("Barbell row", 3, 8),
			sets("Face pull", 3, 15),
			sets("Barbell curl", 3, 10),
			sets("Hammer curl", 2, 12),
		}},
		{"Legs", []Block{
			sets("Back squat", 4, 6),
			sets("Romanian deadlift", 3, 8),
			sets("Leg press", 3, 10),
			sets("Leg extension", 3, 12),
			sets("Seated leg curl", 3, 12),
			sets("Standing calf raise", 4, 12),
		}},
	},
	Rotation: []int{0, 1, 2},
}

var arnold = Split{
	Key: "arnold", Name: "Arnold Split",
	Description: "Chest and back, shoulders and arms, legs. High volume, usually 6 days.",
	MinDays:     3, MaxDays: 6, DefaultDays: []int{0, 1, 2, 3, 4, 5},
	Workouts: []Workout{
		{"Chest & Back", []Block{
			sets("Bench press", 4, 8),
			sets("Pull-up", 4, 8),
			sets("Incline dumbbell press", 3, 10),
			sets("Barbell row", 3, 10),
			sets("Cable crossover", 3, 12),
			sets("Lat pulldown", 3, 12),
		}},
		{"Shoulders & Arms", []Block{
			sets("Arnold press", 4, 10),
			sets("Lateral raise", 3, 12),
			sets("Rear delt fly (machine)", 3, 15),
			sets("Barbell curl", 3, 10),
			sets("Skull crusher", 3, 10),
			sets("Hammer curl", 3, 12),
			sets("Rope pushdown", 3, 12),
		}},
		{"Legs", []Block{
			sets("Back squat", 4, 8),
			sets("Romanian deadlift", 3, 10),
			sets("Walking lunge", 3, 12),
			sets("Leg extension", 3, 12),
			sets("Lying leg curl", 3, 12),
			sets("Standing calf raise", 4, 15),
		}},
	},
	Rotation: []int{0, 1, 2},
}

var bro = Split{
	Key: "bro", Name: "Bro Split",
	Description: "One muscle group a day: chest, back, shoulders, arms, legs.",
	MinDays:     5, MaxDays: 6, DefaultDays: []int{0, 1, 2, 3, 4},
	Workouts: []Workout{
		{"Chest", []Block{
			sets("Bench press", 4, 8),
			sets("Incline dumbbell press", 3, 10),
			sets("Chest fly (machine)", 3, 12),
			sets("Dips", 3, 10),
			sets("Cable crossover", 3, 15),
		}},
		{"Back", []Block{
			sets("Deadlift", 3, 5),
			sets("Lat pulldown", 4, 10),
			sets("Seated cable row", 3, 10),
			sets("One-arm dumbbell row", 3, 10),
			sets("Straight-arm pulldown", 3, 12),
		}},
		{"Shoulders", []Block{
			sets("Overhead press", 4, 8),
			sets("Lateral raise", 4, 12),
			sets("Rear delt fly (machine)", 3, 15),
			sets("Face pull", 3, 15),
			sets("Barbell shrug", 3, 12),
		}},
		{"Arms", []Block{
			sets("Barbell curl", 3, 10),
			sets("Close-grip bench press", 3, 8),
			sets("Hammer curl", 3, 12),
			sets("Triceps pushdown", 3, 12),
			sets("Preacher curl", 3, 12),
			sets("Overhead triceps extension", 3, 12),
		}},
		{"Legs", []Block{
			sets("Back squat", 4, 8),
			sets("Leg press", 3, 10),
			sets("Romanian deadlift", 3, 10),
			sets("Leg extension", 3, 12),
			sets("Seated leg curl", 3, 12),
			sets("Standing calf raise", 4, 15),
		}},
	},
	Rotation: []int{0, 1, 2, 3, 4},
}
