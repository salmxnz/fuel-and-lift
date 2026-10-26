package store

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

// Gym insights: which muscles haven't been trained in a while, and a few
// exercises for them that can be added to one of this week's workouts.

// MuscleStat is how recently one muscle was trained. A block counts for its
// exercise's first two muscles once it has a done working set.
type MuscleStat struct {
	Muscle       string `json:"muscle"`
	LastTrained  *Date  `json:"last_trained"`
	SetsThisWeek int    `json:"sets_this_week"`
	// Days4Weeks is on how many days in the last 28 it was trained.
	Days4Weeks int `json:"days_4_weeks"`
}

// MuscleStats returns stats for every muscle trained in the last 90 days,
// and on how many days the user trained at all in the last 28.
func (s *Store) MuscleStats(ctx context.Context, userID string, today Date) ([]MuscleStat, int, error) {
	monday := WeekStart(today)
	rows, err := s.Pool.Query(ctx, `
		with work as (
			select s.date, m.muscle,
			       (select count(*) from session_sets x where x.block_id = b.id and x.done and not x.warmup) as sets
			from sessions s
			join session_blocks b on b.session_id = s.id and not b.skipped
			join exercises e on e.id = b.exercise_id
			cross join lateral unnest(e.muscles[1:2]) as m(muscle)
			where s.user_id = $1::uuid and s.date between $2::date - 90 and $2::date
		)
		select muscle, max(date) filter (where sets > 0),
		       coalesce(sum(sets) filter (where date >= $3::date), 0)::int,
		       count(distinct date) filter (where sets > 0 and date > $2::date - 28)::int
		from work group by muscle having max(date) filter (where sets > 0) is not null`,
		userID, today.Time, monday.Time)
	if err != nil {
		return nil, 0, err
	}
	stats, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (MuscleStat, error) {
		var m MuscleStat
		var last time.Time
		err := r.Scan(&m.Muscle, &last, &m.SetsThisWeek, &m.Days4Weeks)
		d := DateOf(last)
		m.LastTrained = &d
		return m, err
	})
	if err != nil {
		return nil, 0, err
	}
	var days int
	err = s.Pool.QueryRow(ctx, `
		select count(distinct s.date)::int from sessions s
		where s.user_id = $1::uuid and s.date > $2::date - 28 and s.date <= $2::date
		  and exists (select 1 from session_blocks b join session_sets x on x.block_id = b.id where b.session_id = s.id and x.done)`,
		userID, today.Time).Scan(&days)
	return stats, days, err
}

// SuggestedExercise is an exercise for a muscle, with the user's last
// working weight on it.
type SuggestedExercise struct {
	Exercise Exercise `json:"exercise"`
	LastKg   *float64 `json:"last_kg"`
}

// ExercisesFor returns strength exercises the user can use that work muscle:
// ones where it's the main muscle first, then ones they've done most.
func (s *Store) ExercisesFor(ctx context.Context, userID, muscle string, limit int) ([]SuggestedExercise, error) {
	rows, err := s.Pool.Query(ctx, `
		select `+exerciseCols("$1")+`,
		       (select x.actual_kg::float8 from session_sets x
		          join session_blocks b on b.id = x.block_id join sessions s on s.id = b.session_id
		         where s.user_id = $1::uuid and b.exercise_id = e.id and x.done and not x.warmup and x.actual_kg is not null
		         order by s.date desc, x.actual_kg desc limit 1)
		from exercises e
		where (e.owner_id is null or e.owner_id = $1::uuid) and e.kind = 'strength' and $2 = any(e.muscles)
		order by e.muscles[1] = $2 desc,
		         (select count(distinct b.session_id) from session_blocks b join sessions s on s.id = b.session_id
		           where s.user_id = $1::uuid and b.exercise_id = e.id) desc,
		         e.media_url is null, e.owner_id nulls first, e.name
		limit $3`, userID, muscle, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (SuggestedExercise, error) {
		var x SuggestedExercise
		e := &x.Exercise
		err := r.Scan(&e.ID, &e.Name, &e.Kind, &e.MuscleGroup, &e.Equipment, &e.MediaURL, &e.GymPhotoURL, &e.Aliases, &e.Muscles,
			&e.Mine, &e.Visibility, &x.LastKg)
		e.fillNil()
		return x, err
	})
}

// WeekExtra is an exercise added to one of this week's workouts for this
// week only.
type WeekExtra struct {
	ID           string       `json:"id"`
	WeekStart    Date         `json:"week_start"`
	TemplateID   string       `json:"template_id"`
	TemplateName string       `json:"template_name"`
	Exercise     Exercise     `json:"exercise"`
	Sets         []PlannedSet `json:"sets"`
}

// AddWeekExtras adds exercises to the user's template for the week starting
// weekStart. Starting that workout in that week appends them.
func (s *Store) AddWeekExtras(ctx context.Context, userID, templateID string, weekStart Date, blocks []BlockInput) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		var ok bool
		if err := tx.QueryRow(ctx, `select exists(select 1 from templates where id = $1::uuid and user_id = $2::uuid and archived_at is null)`,
			templateID, userID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return ErrNotFound
		}
		if err := checkExercises(ctx, tx, userID, blocks); err != nil {
			return err
		}
		for _, b := range blocks {
			sets, _ := json.Marshal(withoutIDs(b.Sets))
			if _, err := tx.Exec(ctx, `insert into week_extras (user_id, week_start, template_id, exercise_id, sets)
				values ($1::uuid, $2, $3::uuid, $4::uuid, $5)`, userID, weekStart.Time, templateID, b.ExerciseID, sets); err != nil {
				return err
			}
		}
		return nil
	})
}

// PendingWeekExtras lists the week's extras not yet in a session.
func (s *Store) PendingWeekExtras(ctx context.Context, userID string, weekStart Date) ([]WeekExtra, error) {
	rows, err := s.Pool.Query(ctx, `
		select w.id::text, w.week_start, w.template_id::text, t.name, w.sets, `+exerciseCols("$1")+`
		from week_extras w join templates t on t.id = w.template_id join exercises e on e.id = w.exercise_id
		where w.user_id = $1::uuid and w.week_start = $2 and w.session_id is null
		order by w.created_at`, userID, weekStart.Time)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (WeekExtra, error) {
		var x WeekExtra
		var ws time.Time
		var sets []byte
		e := &x.Exercise
		err := r.Scan(&x.ID, &ws, &x.TemplateID, &x.TemplateName, &sets,
			&e.ID, &e.Name, &e.Kind, &e.MuscleGroup, &e.Equipment, &e.MediaURL, &e.GymPhotoURL, &e.Aliases, &e.Muscles, &e.Mine, &e.Visibility)
		x.WeekStart = DateOf(ws)
		e.fillNil()
		x.Sets = []PlannedSet{}
		_ = json.Unmarshal(sets, &x.Sets)
		return x, err
	})
	if list == nil {
		list = []WeekExtra{}
	}
	return list, err
}

// DeleteWeekExtra removes a pending extra.
func (s *Store) DeleteWeekExtra(ctx context.Context, userID, id string) error {
	ct, err := s.Pool.Exec(ctx, `delete from week_extras where id = $1::uuid and user_id = $2::uuid and session_id is null`, id, userID)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// appendWeekExtras adds the week's pending extras for a template to a new
// session, after position, and marks them used.
func appendWeekExtras(ctx context.Context, tx pgx.Tx, userID, sessionID, templateID string, d Date, position int) error {
	return weekExtrasFor(ctx, tx, userID, sessionID, templateID, d, position, true)
}

// claimWeekExtras only marks the week's pending extras for a template used
// by a session: one started with the client's own blocks, which already
// include them.
func claimWeekExtras(ctx context.Context, tx pgx.Tx, userID, sessionID, templateID string, d Date) error {
	return weekExtrasFor(ctx, tx, userID, sessionID, templateID, d, 0, false)
}

func weekExtrasFor(ctx context.Context, tx pgx.Tx, userID, sessionID, templateID string, d Date, position int, insert bool) error {
	rows, err := tx.Query(ctx, `
		update week_extras set session_id = $4::uuid
		where user_id = $1::uuid and template_id = $2::uuid and week_start = $3 and session_id is null
		returning exercise_id::text, sets, created_at`, userID, templateID, WeekStart(d).Time, sessionID)
	if err != nil {
		return err
	}
	type extra struct {
		exerciseID string
		sets       []PlannedSet
		at         time.Time
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (extra, error) {
		var x extra
		var raw []byte
		err := r.Scan(&x.exerciseID, &raw, &x.at)
		_ = json.Unmarshal(raw, &x.sets)
		return x, err
	})
	if err != nil || !insert {
		return err
	}
	sort.Slice(list, func(i, j int) bool { return list[i].at.Before(list[j].at) })
	for i, x := range list {
		var bid string
		if err := tx.QueryRow(ctx, `insert into session_blocks (session_id, position, exercise_id) values ($1::uuid, $2, $3::uuid) returning id::text`,
			sessionID, position+i, x.exerciseID).Scan(&bid); err != nil {
			return err
		}
		for j, set := range x.sets {
			if _, err := tx.Exec(ctx, `insert into session_sets (block_id, position, warmup, target_kg, target_reps, to_failure)
				values ($1::uuid, $2, $3, $4, $5, $6)`, bid, j, set.Warmup, set.TargetKg, set.TargetReps, set.ToFailure); err != nil {
				return err
			}
		}
	}
	return nil
}
