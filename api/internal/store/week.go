package store

import (
	"context"
	"math"
)

// WeeklyGoalDays is how many days on target make a week's goal.
const WeeklyGoalDays = 5

// WeekSummary is how someone's week (Monday to today, in their timezone) is
// going. It only says whether days hit the target, never how much was eaten,
// so friends can see it.
type WeekSummary struct {
	WeekStart      Date      `json:"week_start"`
	DaysLogged     int       `json:"days_logged"`
	DaysOnTarget   int       `json:"days_on_target"`
	DaysProteinHit int       `json:"days_protein_hit"`
	GoalDays       int       `json:"goal_days"`
	GoalHit        bool      `json:"goal_hit"`
	Streak         int       `json:"streak"`
	ActiveToday    bool      `json:"active_today"`
	Workouts       *int      `json:"workouts"` // null when workouts aren't shared
	Days           []WeekDay `json:"days"`     // Monday to Sunday; future days are empty
}

// WeekDay is one day of a WeekSummary.
type WeekDay struct {
	Date       Date `json:"date"`
	Logged     bool `json:"logged"`
	OnTarget   bool `json:"on_target"`
	ProteinHit bool `json:"protein_hit"`
}

// WeekStart is the Monday on or before d.
func WeekStart(d Date) Date {
	return Date{d.AddDate(0, 0, -d.Weekday0())}
}

// OnTarget reports whether a logged day's calories are within 10% of the
// target. Without a target no day counts.
func OnTarget(kcal, target float64) bool {
	return target > 0 && math.Abs(kcal-target) <= target*0.1
}

// ProteinHit reports whether a day reached 90% of the protein target.
func ProteinHit(protein, target float64) bool {
	return target > 0 && protein >= target*0.9
}

// ComputeWeek builds the summary from per-day totals (keyed YYYY-MM-DD).
func ComputeWeek(today Date, totals map[string]Macros, target Macros) WeekSummary {
	start := WeekStart(today)
	w := WeekSummary{WeekStart: start, GoalDays: WeeklyGoalDays, Days: make([]WeekDay, 7)}
	for i := range 7 {
		d := Date{start.AddDate(0, 0, i)}
		day := WeekDay{Date: d}
		if m, ok := totals[d.String()]; ok && !d.After(today.Time) {
			day.Logged = true
			day.OnTarget = OnTarget(m.Kcal, target.Kcal)
			day.ProteinHit = ProteinHit(m.ProteinG, target.ProteinG)
		}
		if day.Logged {
			w.DaysLogged++
		}
		if day.OnTarget {
			w.DaysOnTarget++
		}
		if day.ProteinHit {
			w.DaysProteinHit++
		}
		w.Days[i] = day
	}
	w.GoalHit = w.DaysOnTarget >= WeeklyGoalDays
	return w
}

// WeekSummary works out userID's week so far. today is their local date;
// withWorkouts adds the number of finished workouts.
func (s *Store) WeekSummary(ctx context.Context, userID string, today Date, target Macros, withWorkouts bool) (WeekSummary, error) {
	totals, err := s.DailyTotals(ctx, userID, WeekStart(today), today)
	if err != nil {
		return WeekSummary{}, err
	}
	w := ComputeWeek(today, totals, target)
	st, err := s.Streak(ctx, userID, today)
	if err != nil {
		return w, err
	}
	w.Streak, w.ActiveToday = st.Current, st.ActiveToday
	if withWorkouts {
		var n int
		if err := s.Pool.QueryRow(ctx, `
			select count(*) from sessions where user_id = $1::uuid and status = 'finished' and date between $2 and $3`,
			userID, w.WeekStart.Time, today.Time).Scan(&n); err != nil {
			return w, err
		}
		w.Workouts = &n
	}
	return w, nil
}
