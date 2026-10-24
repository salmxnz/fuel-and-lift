package store

import "testing"

func TestWeekStart(t *testing.T) {
	for in, want := range map[string]string{
		"2026-10-19": "2026-10-19", // Monday
		"2026-10-22": "2026-10-19",
		"2026-10-25": "2026-10-19", // Sunday ends the week
		"2026-10-26": "2026-10-26",
	} {
		if got := WeekStart(dates(t, in)[0]).String(); got != want {
			t.Errorf("WeekStart(%s) = %s, want %s", in, got, want)
		}
	}
}

func TestComputeWeek(t *testing.T) {
	target := Macros{Kcal: 2000, ProteinG: 150}
	today := dates(t, "2026-10-23")[0] // Friday
	totals := map[string]Macros{
		"2026-10-19": {Kcal: 2000, ProteinG: 150}, // on target, protein hit
		"2026-10-20": {Kcal: 2190, ProteinG: 135}, // +9.5%, protein exactly 90%
		"2026-10-21": {Kcal: 1790, ProteinG: 100}, // -10.5%: off
		"2026-10-22": {Kcal: 1800, ProteinG: 160}, // -10%: on
		"2026-10-24": {Kcal: 2000, ProteinG: 150}, // tomorrow: ignored
	}
	w := ComputeWeek(today, totals, target)
	if w.WeekStart.String() != "2026-10-19" || len(w.Days) != 7 {
		t.Fatalf("week: %+v", w)
	}
	if w.DaysLogged != 4 || w.DaysOnTarget != 3 || w.DaysProteinHit != 3 {
		t.Fatalf("logged %d, on target %d, protein %d", w.DaysLogged, w.DaysOnTarget, w.DaysProteinHit)
	}
	if w.GoalHit || w.GoalDays != WeeklyGoalDays {
		t.Fatal("3 days on target isn't the goal")
	}
	if w.Days[5].Logged {
		t.Fatal("a future day counted")
	}

	totals["2026-10-23"] = Macros{Kcal: 2100, ProteinG: 10}
	totals["2026-10-21"] = Macros{Kcal: 1900}
	if w := ComputeWeek(today, totals, target); !w.GoalHit || w.DaysOnTarget != 5 {
		t.Fatalf("5 days on target should hit the goal: %+v", w)
	}
	// No goal set: nothing is on target.
	if w := ComputeWeek(today, totals, Macros{}); w.DaysOnTarget != 0 || w.DaysProteinHit != 0 || w.DaysLogged != 5 {
		t.Fatalf("without a target: %+v", w)
	}
}
