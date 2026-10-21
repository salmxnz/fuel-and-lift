package store

import "testing"

func dates(t *testing.T, ss ...string) []Date {
	t.Helper()
	out := make([]Date, len(ss))
	for i, s := range ss {
		d, err := ParseDate(s)
		if err != nil {
			t.Fatal(err)
		}
		out[i] = d
	}
	return out
}

func TestComputeStreak(t *testing.T) {
	today := dates(t, "2026-10-22")[0]
	cases := []struct {
		name          string
		active        []string
		current, best int
		activeToday   bool
	}{
		{"nothing", nil, 0, 0, false},
		{"today only", []string{"2026-10-22"}, 1, 1, true},
		// Today not logged yet: the streak still stands until midnight.
		{"through yesterday", []string{"2026-10-19", "2026-10-20", "2026-10-21"}, 3, 3, false},
		{"broken two days ago", []string{"2026-10-18", "2026-10-19", "2026-10-20"}, 0, 3, false},
		{"duplicates and order", []string{"2026-10-22", "2026-10-21", "2026-10-22", "2026-10-20"}, 3, 3, true},
		{"best in the past", []string{"2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-10-21", "2026-10-22"}, 2, 4, true},
		{"future ignored", []string{"2026-10-22", "2026-10-23"}, 1, 1, true},
		{"month boundary", []string{"2026-09-30", "2026-10-01"}, 0, 2, false},
	}
	for _, c := range cases {
		st := ComputeStreak(dates(t, c.active...), today)
		if st.Current != c.current || st.Best != c.best || st.ActiveToday != c.activeToday {
			t.Errorf("%s: got current %d best %d today %v, want %d %d %v", c.name, st.Current, st.Best, st.ActiveToday, c.current, c.best, c.activeToday)
		}
	}

	st := ComputeStreak(dates(t, "2026-10-16", "2026-10-20", "2026-10-21", "2026-10-22"), today)
	want := []bool{true, false, false, false, true, true, true}
	for i := range want {
		if st.Last7[i] != want[i] {
			t.Fatalf("last7 = %v, want %v", st.Last7, want)
		}
	}
	if st.Since == nil || st.Since.String() != "2026-10-20" {
		t.Fatalf("since = %v", st.Since)
	}
	if !st.Milestones[0].Reached || st.Milestones[1].Reached {
		t.Fatalf("milestones: %+v", st.Milestones)
	}
}
