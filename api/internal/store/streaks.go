package store

import (
	"context"
	"sort"
	"time"
)

// StreakMilestones are the streak lengths that earn a badge and a feed post.
var StreakMilestones = []int{3, 7, 14, 30, 60, 100, 365}

// Streak is one combined streak: a day counts when anything was logged
// (a meal) or a workout was finished.
type Streak struct {
	Current     int   `json:"current"`
	Best        int   `json:"best"`
	ActiveToday bool  `json:"active_today"`
	LastActive  *Date `json:"last_active"`
	// Last7 is the last seven days, oldest first, ending today.
	Last7      []bool      `json:"last_7"`
	Milestones []Milestone `json:"milestones"`
	// Since is the first day of the current streak (null when it's 0).
	Since *Date `json:"since"`
}

// Milestone is a streak length and whether it has ever been reached.
type Milestone struct {
	Days    int  `json:"days"`
	Reached bool `json:"reached"`
}

// ComputeStreak works out the streak from the days with activity. Today
// without activity yet doesn't break it: the streak runs up to yesterday
// until the day is over.
func ComputeStreak(active []Date, today Date) Streak {
	days := map[string]bool{}
	var list []time.Time
	for _, d := range active {
		if d.After(today.Time) {
			continue
		}
		k := d.String()
		if !days[k] {
			days[k] = true
			list = append(list, d.Time)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Before(list[j]) })

	st := Streak{Last7: make([]bool, 7), Milestones: make([]Milestone, len(StreakMilestones))}
	run := 0
	for i, t := range list {
		if i > 0 && t.Sub(list[i-1]) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > st.Best {
			st.Best = run
		}
	}
	if n := len(list); n > 0 {
		last := Date{list[n-1]}
		st.LastActive = &last
	}

	st.ActiveToday = days[today.String()]
	end := today.Time
	if !st.ActiveToday {
		end = end.AddDate(0, 0, -1)
	}
	for d := end; days[Date{d}.String()]; d = d.AddDate(0, 0, -1) {
		st.Current++
		since := Date{d}
		st.Since = &since
	}
	for i := 0; i < 7; i++ {
		st.Last7[i] = days[Date{today.AddDate(0, 0, i-6)}.String()]
	}
	for i, m := range StreakMilestones {
		st.Milestones[i] = Milestone{Days: m, Reached: st.Best >= m}
	}
	return st
}

// ActiveDays lists the days (on or before `until`) with a logged meal or a
// finished workout.
func (s *Store) ActiveDays(ctx context.Context, userID string, until Date) ([]Date, error) {
	rows, err := s.Pool.Query(ctx, `
		select date::text from log_entries where user_id = $1::uuid and date <= $2::date
		union
		select date::text from sessions where user_id = $1::uuid and status = 'finished' and date <= $2::date`, userID, until.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Date
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		d, err := ParseDate(t)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// Streak computes the user's streak as of today (their local day).
func (s *Store) Streak(ctx context.Context, userID string, today Date) (Streak, error) {
	days, err := s.ActiveDays(ctx, userID, today)
	if err != nil {
		return Streak{}, err
	}
	return ComputeStreak(days, today), nil
}

// StreakPosted reports whether a feed post for this milestone exists since
// the current streak began (so each milestone posts once per streak).
func (s *Store) StreakPosted(ctx context.Context, userID string, days int, since Date) (bool, error) {
	var ok bool
	err := s.Pool.QueryRow(ctx, `
		select exists(select 1 from activities where user_id = $1::uuid and kind = 'streak'
		  and (data->>'days')::int = $2 and created_at >= $3::date - interval '1 day')`, userID, days, since.String()).Scan(&ok)
	return ok, err
}
