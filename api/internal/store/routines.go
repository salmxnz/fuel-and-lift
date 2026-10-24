package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// A routine is a week of the user's own workouts: it points at their live
// templates, so editing a workout in the Gym tab changes the routine too.
// Applying it copies its days into the weekly plan.

// ErrEmptyRoutine is returned when applying a routine with no training days.
var ErrEmptyRoutine = errors.New("this routine has no training days")

// RoutineDay is the workout a routine trains on one weekday.
type RoutineDay struct {
	TemplateID string `json:"template_id"`
	Name       string `json:"name"`
}

// Routine is a named week of workouts ("Push Pull Legs").
type Routine struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Preset      *string `json:"preset"` // the split it was made from
	// Days maps "mon".."sun" to a workout, null for rest days.
	Days      map[string]*RoutineDay `json:"days"`
	CreatedAt time.Time              `json:"created_at"`
	UpdatedAt time.Time              `json:"updated_at"`
	Community
	// Templates are the routine's workouts in full (Shop detail only).
	Templates []Template `json:"templates,omitempty"`
	ownerID   string
}

const routineSelect = `
	select r.id::text, r.user_id::text, r.name, r.description, r.preset, r.created_at, r.updated_at,
	       r.visibility, r.published_at, r.add_count, r.hidden_at is not null, ` + copiedFromCols + `
	from routines r `

// routines loads routines matching where (on alias r) with their days.
func (s *Store) routines(ctx context.Context, where string, args ...any) ([]Routine, error) {
	rows, err := s.Pool.Query(ctx, routineSelect+copiedFromJoin("r")+` where `+where, args...)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Routine, error) {
		var r Routine
		var cf copiedFrom
		err := row.Scan(&r.ID, &r.ownerID, &r.Name, &r.Description, &r.Preset, &r.CreatedAt, &r.UpdatedAt,
			&r.Visibility, &r.PublishedAt, &r.AddCount, &r.Hidden, &cf.id, &cf.name, &cf.avatar)
		r.CopiedFrom = cf.person()
		r.Days = map[string]*RoutineDay{}
		for _, d := range Weekdays {
			r.Days[d] = nil
		}
		return r, err
	})
	if err != nil || len(list) == 0 {
		if list == nil {
			list = []Routine{}
		}
		return list, err
	}
	ids := make([]string, len(list))
	at := map[string]int{}
	for i, r := range list {
		ids[i] = r.ID
		at[r.ID] = i
	}
	days, err := s.Pool.Query(ctx, `
		select rd.routine_id::text, rd.weekday, t.id::text, t.name
		from routine_days rd join templates t on t.id = rd.template_id and t.archived_at is null
		where rd.routine_id = any($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer days.Close()
	for days.Next() {
		var rid string
		var wd int
		var d RoutineDay
		if err := days.Scan(&rid, &wd, &d.TemplateID, &d.Name); err != nil {
			return nil, err
		}
		list[at[rid]].Days[Weekdays[wd]] = &d
	}
	return list, days.Err()
}

// ListRoutines returns the user's routines, most recently changed first.
func (s *Store) ListRoutines(ctx context.Context, userID string) ([]Routine, error) {
	return s.routines(ctx, `r.user_id = $1::uuid and r.archived_at is null order by r.updated_at desc`, userID)
}

// GetRoutine returns one of the user's routines.
func (s *Store) GetRoutine(ctx context.Context, userID, id string) (Routine, error) {
	list, err := s.routines(ctx, `r.id = $1::uuid and r.user_id = $2::uuid and r.archived_at is null`, id, userID)
	if err != nil {
		return Routine{}, err
	}
	if len(list) == 0 {
		return Routine{}, ErrNotFound
	}
	return list[0], nil
}

// RoutineInput is a routine as the client sends it.
type RoutineInput struct {
	Name        string
	Description *string
	Visibility  *string            // only when creating; nil = private
	Days        map[string]*string // weekday → one of the user's template ids
}

// SaveRoutine creates (id == "") or replaces a routine. Every day must be one
// of the user's workouts (ErrNotFound otherwise).
func (s *Store) SaveRoutine(ctx context.Context, userID, id string, in RoutineInput) (Routine, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		var err error
		if id == "" {
			vis := "private"
			if in.Visibility != nil {
				vis = *in.Visibility
			}
			err = tx.QueryRow(ctx, `insert into routines (user_id, name, description, visibility, published_at)
				values ($1::uuid, $2, $3, $4, case when $4 <> 'private' then now() end) returning id::text`,
				userID, in.Name, in.Description, vis).Scan(&id)
		} else {
			err = tx.QueryRow(ctx, `update routines set name = $3, description = $4, updated_at = now()
				where id = $1::uuid and user_id = $2::uuid and archived_at is null returning id::text`,
				id, userID, in.Name, in.Description).Scan(&id)
		}
		if err != nil {
			return notFound(err)
		}
		if _, err := tx.Exec(ctx, `delete from routine_days where routine_id = $1::uuid`, id); err != nil {
			return err
		}
		for i, d := range Weekdays {
			tid := in.Days[d]
			if tid == nil || *tid == "" {
				continue
			}
			ct, err := tx.Exec(ctx, `
				insert into routine_days (routine_id, weekday, template_id)
				select $1::uuid, $2, t.id from templates t where t.id = $3::uuid and t.user_id = $4::uuid and t.archived_at is null`,
				id, i, *tid, userID)
			if err != nil {
				return err
			}
			if ct.RowsAffected() == 0 {
				return ErrNotFound
			}
		}
		return nil
	})
	if err != nil {
		return Routine{}, err
	}
	return s.GetRoutine(ctx, userID, id)
}

// ArchiveRoutine removes a routine. Its workouts and the week stay as they are.
func (s *Store) ArchiveRoutine(ctx context.Context, userID, id string) error {
	ct, err := s.Pool.Exec(ctx, `update routines set archived_at = now() where id = $1::uuid and user_id = $2::uuid and archived_at is null`, id, userID)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// ApplyRoutine makes the routine the user's week, replacing the weekly plan.
func (s *Store) ApplyRoutine(ctx context.Context, userID, id string) (map[string]*string, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		var n int
		err := tx.QueryRow(ctx, `
			select count(rd.weekday) from routines r
			left join routine_days rd on rd.routine_id = r.id
			where r.id = $1::uuid and r.user_id = $2::uuid and r.archived_at is null
			group by r.id`, id, userID).Scan(&n)
		if err != nil {
			return notFound(err)
		}
		if n == 0 {
			return ErrEmptyRoutine
		}
		return applyDays(ctx, tx, userID, `select weekday, template_id from routine_days where routine_id = $2::uuid`, id)
	})
	if err != nil {
		return nil, err
	}
	return s.GetWeeklyPlan(ctx, userID)
}

// applyDays replaces the weekly plan with (weekday, template_id) rows from
// sel, which may use $2 onwards.
func applyDays(ctx context.Context, tx pgx.Tx, userID, sel string, args ...any) error {
	if _, err := tx.Exec(ctx, `delete from weekly_plan where user_id = $1::uuid`, userID); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `insert into weekly_plan (user_id, weekday, template_id) select $1::uuid, d.weekday, d.template_id from (`+sel+`) d`,
		append([]any{userID}, args...)...)
	return err
}

// NewWorkout is a workout to create while seeding a routine.
type NewWorkout struct {
	Name   string
	Blocks []BlockInput
}

// RoutineSeed creates workouts in one go: a split being applied, a routine
// copied from a friend or the Shop.
type RoutineSeed struct {
	Name        string
	Description *string
	Preset      *string
	Workouts    []NewWorkout
	Days        map[int]int // weekday (0 = Monday) → index into Workouts
	MakeRoutine bool        // also save a routine pointing at the workouts
	ApplyToWeek bool        // replace the weekly plan with Days
	// CopiedFrom* credit the original when this is a copy.
	CopiedFromID, CopiedFromUser *string
	// WorkoutsFrom are the originals of Workouts (same order) for copies.
	WorkoutsFrom []string
}

// SeedRoutine creates a seed's workouts (and routine, and week). It returns
// the routine's id ("" when MakeRoutine is false).
func (s *Store) SeedRoutine(ctx context.Context, userID string, seed RoutineSeed) (string, error) {
	var id string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		var err error
		id, err = seedRoutine(ctx, tx, userID, seed)
		return err
	})
	return id, err
}

func seedRoutine(ctx context.Context, tx pgx.Tx, userID string, seed RoutineSeed) (string, error) {
	tplIDs := make([]string, len(seed.Workouts))
	for i, w := range seed.Workouts {
		id, err := createTemplate(ctx, tx, userID, w.Name, w.Blocks)
		if err != nil {
			return "", err
		}
		tplIDs[i] = id
		if seed.CopiedFromUser != nil && i < len(seed.WorkoutsFrom) {
			if _, err := tx.Exec(ctx, `update templates set copied_from_id = $2::uuid, copied_from_user = $3::uuid where id = $1::uuid`,
				id, seed.WorkoutsFrom[i], *seed.CopiedFromUser); err != nil {
				return "", err
			}
		}
	}
	weekdays := make([]int, 0, len(seed.Days))
	templates := make([]string, 0, len(seed.Days))
	for wd, w := range seed.Days {
		weekdays = append(weekdays, wd)
		templates = append(templates, tplIDs[w])
	}
	days := `select unnest($2::smallint[]) as weekday, unnest($3::uuid[]) as template_id`
	var routineID string
	if seed.MakeRoutine {
		err := tx.QueryRow(ctx, `insert into routines (user_id, name, description, preset, copied_from_id, copied_from_user)
			values ($1::uuid, $2, $3, $4, $5::uuid, $6::uuid) returning id::text`,
			userID, seed.Name, seed.Description, seed.Preset, seed.CopiedFromID, seed.CopiedFromUser).Scan(&routineID)
		if err != nil {
			return "", err
		}
		if _, err := tx.Exec(ctx, `insert into routine_days (routine_id, weekday, template_id) select $1::uuid, d.weekday, d.template_id from (`+days+`) d`,
			routineID, weekdays, templates); err != nil {
			return "", err
		}
	}
	if seed.ApplyToWeek {
		if err := applyDays(ctx, tx, userID, days, weekdays, templates); err != nil {
			return "", err
		}
	}
	return routineID, nil
}
