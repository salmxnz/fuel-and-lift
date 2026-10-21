package store

import "testing"

func ex(name, muscle, equip string, aliases ...string) Exercise {
	return Exercise{Name: name, MuscleGroup: &muscle, Equipment: &equip, Aliases: aliases}
}

var library = []Exercise{
	ex("Stair climber", "cardio", "stair climber", "stairmaster", "stair master", "stepmill"),
	ex("Standing calf raise", "calves", "machine", "calf raise", "calves"),
	ex("Seated calf raise", "calves", "machine", "calf raise"),
	ex("Calf raise (machine)", "calves", "machine", "calf raise"),
	ex("Lateral raise", "shoulders", "dumbbell", "side raise"),
	ex("Romanian deadlift", "legs", "barbell", "rdl"),
	ex("Deadlift", "back", "barbell"),
	ex("Back squat", "legs", "barbell", "squat"),
	ex("Front squat", "legs", "barbell"),
	ex("Bench press", "chest", "barbell", "bench"),
	ex("Pull-up", "back", "bodyweight", "pullup"),
	ex("Treadmill", "cardio", "treadmill"),
}

func names(list []Exercise) []string {
	out := make([]string, len(list))
	for i, e := range list {
		out[i] = e.Name
	}
	return out
}

func TestRankExercises(t *testing.T) {
	cases := []struct {
		q     string
		first string
		in    []string // must be present
		out   []string // must be absent
	}{
		{q: "stair master", first: "Stair climber"},
		{q: "stairmaster", first: "Stair climber"},
		{q: "stair", first: "Stair climber"},
		{q: "calf", in: []string{"Standing calf raise", "Seated calf raise", "Calf raise (machine)"}, out: []string{"Lateral raise"}},
		{q: "raise calf", in: []string{"Standing calf raise", "Seated calf raise"}, out: []string{"Lateral raise"}},
		{q: "calf rasie", in: []string{"Standing calf raise", "Seated calf raise"}, out: []string{"Lateral raise"}},
		{q: "rdl", first: "Romanian deadlift"},
		{q: "squatt", in: []string{"Back squat", "Front squat"}},
		{q: "deadlift", first: "Deadlift"},
		{q: "pull up", first: "Pull-up"},
		{q: "pullup", first: "Pull-up"},
		{q: "benc pres", first: "Bench press"},
		{q: "zzzz", out: []string{"Treadmill"}},
	}
	for _, c := range cases {
		got := names(RankExercises(library, c.q, 50))
		if c.first != "" && (len(got) == 0 || got[0] != c.first) {
			t.Errorf("%q: first = %v, want %q", c.q, got, c.first)
		}
		has := map[string]bool{}
		for _, n := range got {
			has[n] = true
		}
		for _, n := range c.in {
			if !has[n] {
				t.Errorf("%q: missing %q in %v", c.q, n, got)
			}
		}
		for _, n := range c.out {
			if has[n] {
				t.Errorf("%q: unexpected %q in %v", c.q, n, got)
			}
		}
	}
	if got := RankExercises(library, "stairmaster", 1); got[0].MatchedAlias == nil || *got[0].MatchedAlias != "stairmaster" {
		t.Errorf("matched alias: %+v", got[0].MatchedAlias)
	}
	if got := RankExercises(library, "", 0); len(got) != len(library) {
		t.Errorf("empty query returns everything, got %d", len(got))
	}
}

func TestEditDistance(t *testing.T) {
	for _, c := range []struct {
		a, b string
		d    int
	}{{"rasie", "raise", 1}, {"squatt", "squat", 1}, {"calf", "calf", 0}, {"kitten", "sitting", 3}} {
		if got := editDistance(c.a, c.b); got != c.d {
			t.Errorf("editDistance(%q,%q) = %d, want %d", c.a, c.b, got, c.d)
		}
	}
}
