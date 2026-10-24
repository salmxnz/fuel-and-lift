package splits

import (
	"reflect"
	"testing"
)

func names(s Split, days []int) []string {
	a := Assign(s, days)
	var out []string
	for d := 0; d < 7; d++ {
		if w, ok := a[d]; ok {
			out = append(out, s.Workouts[w].Name)
		}
	}
	return out
}

func TestAssign(t *testing.T) {
	cases := []struct {
		key  string
		days []int
		want []string
	}{
		{"ppl", []int{4, 0, 2}, []string{"Push", "Pull", "Legs"}},
		{"ppl", []int{0, 1, 2, 3, 4, 5}, []string{"Push", "Pull", "Legs", "Push", "Pull", "Legs"}},
		{"bro", []int{0, 1, 2, 3, 4, 5}, []string{"Chest", "Back", "Shoulders", "Arms", "Legs", "Chest"}},
		{"full_body", []int{0, 2, 4}, []string{"Full Body A", "Full Body B", "Full Body A"}},
	}
	for _, c := range cases {
		s, ok := Get(c.key)
		if !ok {
			t.Fatalf("no split %q", c.key)
		}
		if got := names(s, c.days); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s on %v = %v, want %v", c.key, c.days, got, c.want)
		}
	}
}

func TestUsed(t *testing.T) {
	ppl, _ := Get("ppl")
	if got := Used(ppl, nil); !reflect.DeepEqual(got, []int{0, 1, 2}) {
		t.Errorf("no days: %v", got)
	}
	fb, _ := Get("full_body")
	if got := Used(fb, []int{0, 3}); !reflect.DeepEqual(got, []int{0, 1}) {
		t.Errorf("full body: %v", got)
	}
	if got := Used(Starter, []int{2}); !reflect.DeepEqual(got, []int{0}) {
		t.Errorf("starter on one day: %v", got)
	}
}

func TestPresetsAreWellFormed(t *testing.T) {
	seen := map[string]bool{}
	for _, s := range All {
		if seen[s.Key] {
			t.Errorf("duplicate key %s", s.Key)
		}
		seen[s.Key] = true
		if s.MinDays < 1 || s.MaxDays > 7 || s.MinDays > s.MaxDays {
			t.Errorf("%s: days %d..%d", s.Key, s.MinDays, s.MaxDays)
		}
		if n := len(s.DefaultDays); n < s.MinDays || n > s.MaxDays {
			t.Errorf("%s: %d default days outside %d..%d", s.Key, n, s.MinDays, s.MaxDays)
		}
		for _, w := range s.Rotation {
			if w < 0 || w >= len(s.Workouts) {
				t.Errorf("%s: rotation index %d", s.Key, w)
			}
		}
		for _, w := range s.Workouts {
			if len([]rune(w.Name)) > 40 || len(w.Blocks) == 0 || len(w.Blocks) > 30 {
				t.Errorf("%s: workout %q", s.Key, w.Name)
			}
		}
	}
}
