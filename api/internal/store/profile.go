package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/salmxnz/fuel-and-lift/api/internal/nutrition"
)

// Profile is what onboarding collects.
type Profile struct {
	DisplayName    string  `json:"display_name"`
	Sex            string  `json:"sex"`
	DateOfBirth    Date    `json:"date_of_birth"`
	HeightCm       float64 `json:"height_cm"`
	ActivityLevel  int     `json:"activity_level"`
	Units          string  `json:"units"`
	Timezone       string  `json:"timezone"`
	CoachVoice     string  `json:"coach_voice"`
	WeighInCadence string  `json:"weigh_in_cadence"`
}

const profileCols = `display_name, sex, date_of_birth, height_cm::float8, activity_level, units, timezone, coach_voice, weigh_in_cadence`

func scanProfile(row pgx.Row) (Profile, error) {
	var p Profile
	var dob time.Time
	err := row.Scan(&p.DisplayName, &p.Sex, &dob, &p.HeightCm, &p.ActivityLevel, &p.Units, &p.Timezone, &p.CoachVoice, &p.WeighInCadence)
	p.DateOfBirth = DateOf(dob)
	return p, notFound(err)
}

// GetProfile returns the user's profile or ErrNotFound before onboarding.
func (s *Store) GetProfile(ctx context.Context, userID string) (Profile, error) {
	return scanProfile(s.Pool.QueryRow(ctx, `select `+profileCols+` from profiles where user_id = $1::uuid`, userID))
}

// Timezone returns the user's zone, UTC before onboarding.
func (s *Store) Timezone(ctx context.Context, userID string) string {
	var tz string
	if err := s.Pool.QueryRow(ctx, `select timezone from profiles where user_id = $1::uuid`, userID).Scan(&tz); err != nil || tz == "" {
		return "UTC"
	}
	return tz
}

// UpdateProfile saves a full profile.
func (s *Store) UpdateProfile(ctx context.Context, userID string, p Profile) (Profile, error) {
	return scanProfile(s.Pool.QueryRow(ctx, `
		update profiles set display_name = $2, sex = $3, date_of_birth = $4, height_cm = $5, activity_level = $6,
		       units = $7, timezone = $8, coach_voice = $9, weigh_in_cadence = $10, updated_at = now()
		where user_id = $1::uuid returning `+profileCols,
		userID, p.DisplayName, p.Sex, p.DateOfBirth.Time, p.HeightCm, p.ActivityLevel, p.Units, p.Timezone, p.CoachVoice, p.WeighInCadence))
}

// Goal is the active goal.
type Goal struct {
	ID            string         `json:"id"`
	Mode          string         `json:"mode"`
	Pace          string         `json:"pace"`
	StartWeightKg float64        `json:"start_weight_kg"`
	GoalWeightKg  *float64       `json:"goal_weight_kg"`
	StartedOn     Date           `json:"started_on"`
	Plan          nutrition.Plan `json:"plan"`
}

func scanGoal(row pgx.Row) (Goal, error) {
	var g Goal
	var started time.Time
	var raw []byte
	err := row.Scan(&g.ID, &g.Mode, &g.Pace, &g.StartWeightKg, &g.GoalWeightKg, &started, &raw)
	if err != nil {
		return g, notFound(err)
	}
	g.StartedOn = DateOf(started)
	err = json.Unmarshal(raw, &g.Plan)
	return g, err
}

const goalCols = `id::text, mode, pace, start_weight_kg::float8, goal_weight_kg::float8, started_on, plan`

// ActiveGoal returns the current goal or ErrNotFound.
func (s *Store) ActiveGoal(ctx context.Context, userID string) (Goal, error) {
	return scanGoal(s.Pool.QueryRow(ctx, `select `+goalCols+` from goals where user_id = $1::uuid and ended_on is null`, userID))
}

func insertGoal(ctx context.Context, tx pgx.Tx, userID string, mode, pace string, startKg float64, goalKg *float64, on Date, plan nutrition.Plan) (Goal, error) {
	if _, err := tx.Exec(ctx, `update goals set ended_on = $2 where user_id = $1::uuid and ended_on is null`, userID, on.Time); err != nil {
		return Goal{}, err
	}
	b, _ := json.Marshal(plan)
	return scanGoal(tx.QueryRow(ctx, `
		insert into goals (user_id, mode, pace, start_weight_kg, goal_weight_kg, started_on, plan)
		values ($1::uuid, $2, $3, $4, $5, $6, $7) returning `+goalCols,
		userID, mode, pace, startKg, goalKg, on.Time, b))
}

// NewGoal starts a new goal (ending the previous one).
func (s *Store) NewGoal(ctx context.Context, userID, mode, pace string, startKg float64, goalKg *float64, on Date, plan nutrition.Plan) (Goal, error) {
	var g Goal
	err := s.tx(ctx, func(tx pgx.Tx) (err error) {
		g, err = insertGoal(ctx, tx, userID, mode, pace, startKg, goalKg, on, plan)
		return err
	})
	return g, err
}

// UpdateGoalPlan replaces the stored plan of the active goal (adaptive update).
func (s *Store) UpdateGoalPlan(ctx context.Context, goalID string, plan nutrition.Plan) error {
	b, _ := json.Marshal(plan)
	_, err := s.Pool.Exec(ctx, `update goals set plan = $2 where id = $1::uuid`, goalID, b)
	return err
}

// Onboarding is everything the onboarding flow submits.
type Onboarding struct {
	Profile  Profile
	WeightKg float64
	Mode     string
	Pace     string
	GoalKg   *float64
	Today    Date
	Plan     nutrition.Plan
}

// DefaultMealSlots are created at onboarding.
var DefaultMealSlots = []string{"Breakfast", "Lunch", "Dinner", "Snacks"}

// CompleteOnboarding creates the profile, first weigh-in, goal, default meals
// and settings in one transaction, then credits the inviter's referral.
// It returns ErrConflict when the user already onboarded, and the id of an
// inviter who just reached Pro (for a notification), if any.
func (s *Store) CompleteOnboarding(ctx context.Context, userID string, o Onboarding, referralsNeeded int) (Profile, Goal, string, error) {
	var prof Profile
	var goal Goal
	var upgraded string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		p := o.Profile
		var err error
		prof, err = scanProfile(tx.QueryRow(ctx, `
			insert into profiles (user_id, display_name, sex, date_of_birth, height_cm, activity_level, units, timezone, coach_voice, weigh_in_cadence)
			values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning `+profileCols,
			userID, p.DisplayName, p.Sex, p.DateOfBirth.Time, p.HeightCm, p.ActivityLevel, p.Units, p.Timezone, p.CoachVoice, p.WeighInCadence))
		if isUniqueViolation(err) {
			return ErrConflict
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `update users set name = $2 where id = $1::uuid`, userID, p.DisplayName); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into weigh_ins (user_id, date, weight_kg) values ($1::uuid, $2, $3)
			on conflict (user_id, date) do update set weight_kg = excluded.weight_kg`, userID, o.Today.Time, o.WeightKg); err != nil {
			return err
		}
		goal, err = insertGoal(ctx, tx, userID, o.Mode, o.Pace, o.WeightKg, o.GoalKg, o.Today, o.Plan)
		if err != nil {
			return err
		}
		for i, name := range DefaultMealSlots {
			if _, err := tx.Exec(ctx, `insert into meal_slots (user_id, name, position) values ($1::uuid, $2, $3)`, userID, name, i); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `insert into sharing_settings (user_id) values ($1::uuid) on conflict do nothing`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `insert into notification_prefs (user_id) values ($1::uuid) on conflict do nothing`, userID); err != nil {
			return err
		}
		upgraded, err = creditReferral(ctx, tx, userID, referralsNeeded)
		return err
	})
	return prof, goal, upgraded, err
}

// --- weigh-ins ---------------------------------------------------------------

// WeighIn is one weight entry.
type WeighIn struct {
	ID       string  `json:"id"`
	Date     Date    `json:"date"`
	WeightKg float64 `json:"weight_kg"`
	Note     *string `json:"note"`
}

func scanWeighIn(r pgx.CollectableRow) (WeighIn, error) {
	var w WeighIn
	var d time.Time
	err := r.Scan(&w.ID, &d, &w.WeightKg, &w.Note)
	w.Date = DateOf(d)
	return w, err
}

// ListWeighIns returns weigh-ins in [from, to], newest first.
func (s *Store) ListWeighIns(ctx context.Context, userID string, from, to Date) ([]WeighIn, error) {
	rows, err := s.Pool.Query(ctx, `
		select id::text, date, weight_kg::float8, note from weigh_ins
		where user_id = $1::uuid and date between $2 and $3 order by date desc`, userID, from.Time, to.Time)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, scanWeighIn)
	if out == nil {
		out = []WeighIn{}
	}
	return out, err
}

// LatestWeighIn returns the most recent weigh-in.
func (s *Store) LatestWeighIn(ctx context.Context, userID string) (WeighIn, error) {
	rows, err := s.Pool.Query(ctx, `select id::text, date, weight_kg::float8, note from weigh_ins where user_id = $1::uuid order by date desc limit 1`, userID)
	if err != nil {
		return WeighIn{}, err
	}
	w, err := pgx.CollectExactlyOneRow(rows, scanWeighIn)
	return w, notFound(err)
}

// PutWeighIn upserts the weigh-in for a date.
func (s *Store) PutWeighIn(ctx context.Context, userID string, d Date, kg float64, note *string) (WeighIn, error) {
	rows, err := s.Pool.Query(ctx, `
		insert into weigh_ins (user_id, date, weight_kg, note) values ($1::uuid, $2, $3, $4)
		on conflict (user_id, date) do update set weight_kg = excluded.weight_kg, note = excluded.note
		returning id::text, date, weight_kg::float8, note`, userID, d.Time, kg, note)
	if err != nil {
		return WeighIn{}, err
	}
	return pgx.CollectExactlyOneRow(rows, scanWeighIn)
}

// DeleteWeighIn removes one of the user's weigh-ins.
func (s *Store) DeleteWeighIn(ctx context.Context, userID, id string) error {
	ct, err := s.Pool.Exec(ctx, `delete from weigh_ins where id = $1::uuid and user_id = $2::uuid`, id, userID)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}
