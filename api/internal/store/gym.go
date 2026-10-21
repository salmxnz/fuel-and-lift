package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// --- exercises -----------------------------------------------------------------

// Exercise is a movement in the library.
type Exercise struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Kind        string   `json:"kind"` // strength | cardio
	MuscleGroup *string  `json:"muscle_group"`
	Equipment   *string  `json:"equipment"`
	MediaURL    *string  `json:"media_url"`
	GymPhotoURL *string  `json:"gym_photo_url"`
	Aliases     []string `json:"aliases"`
	// MatchedAlias is set by search when the hit came from another name
	// ("stairmaster" → Stair climber).
	MatchedAlias *string `json:"matched_alias,omitempty"`
}

const exerciseCols = `id::text, name, kind, muscle_group, equipment, media_url, gym_photo_url, aliases`

func scanExercise(r pgx.CollectableRow) (Exercise, error) {
	var e Exercise
	err := r.Scan(&e.ID, &e.Name, &e.Kind, &e.MuscleGroup, &e.Equipment, &e.MediaURL, &e.GymPhotoURL, &e.Aliases)
	if e.Aliases == nil {
		e.Aliases = []string{}
	}
	return e, err
}

// ListExercises searches the shared library and the user's own exercises
// (see RankExercises): any word order, other names and small typos match.
func (s *Store) ListExercises(ctx context.Context, userID, q string) ([]Exercise, error) {
	rows, err := s.Pool.Query(ctx, `select `+exerciseCols+` from exercises
		where owner_id is null or owner_id = $1::uuid order by name`, userID)
	if err != nil {
		return nil, err
	}
	all, err := pgx.CollectRows(rows, scanExercise)
	if err != nil {
		return nil, err
	}
	limit := 50
	if strings.TrimSpace(q) == "" {
		limit = 300
	}
	return RankExercises(all, q, limit), nil
}

// GetExercise returns one exercise the user can see.
func (s *Store) GetExercise(ctx context.Context, userID, id string) (Exercise, error) {
	rows, err := s.Pool.Query(ctx, `select `+exerciseCols+` from exercises where id = $1::uuid and (owner_id is null or owner_id = $2::uuid)`, id, userID)
	if err != nil {
		return Exercise{}, err
	}
	e, err := pgx.CollectExactlyOneRow(rows, scanExercise)
	return e, notFound(err)
}

// CreateExercise adds one of the user's own exercises.
func (s *Store) CreateExercise(ctx context.Context, userID string, e Exercise) (Exercise, error) {
	rows, err := s.Pool.Query(ctx, `insert into exercises (owner_id, name, kind, muscle_group, equipment)
		values ($1::uuid, $2, $3, $4, $5) returning `+exerciseCols, userID, e.Name, e.Kind, e.MuscleGroup, e.Equipment)
	if err != nil {
		return Exercise{}, err
	}
	out, err := pgx.CollectExactlyOneRow(rows, scanExercise)
	if isUniqueViolation(err) {
		return out, ErrConflict
	}
	return out, err
}

// exercisesByID loads the exercises the user can see among ids.
func exercisesByID(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, userID string, ids []string) (map[string]Exercise, error) {
	rows, err := q.Query(ctx, `select `+exerciseCols+` from exercises
		where id = any($1::uuid[]) and (owner_id is null or owner_id = $2::uuid)`, ids, userID)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, scanExercise)
	if err != nil {
		return nil, err
	}
	m := make(map[string]Exercise, len(list))
	for _, e := range list {
		m[e.ID] = e
	}
	return m, nil
}

// --- templates -----------------------------------------------------------------

// PlannedSet is one set in a template.
type PlannedSet struct {
	Warmup     bool     `json:"warmup"`
	TargetKg   *float64 `json:"target_kg"`
	TargetReps *int     `json:"target_reps"`
	ToFailure  bool     `json:"to_failure"`
}

// Cardio parameters for a cardio block.
type Cardio struct {
	Minutes float64  `json:"minutes"`
	Incline *float64 `json:"incline"`
	Speed   *float64 `json:"speed"`
}

// BlockInput is a block as the client sends it.
type BlockInput struct {
	ExerciseID  string       `json:"exercise_id"`
	Sets        []PlannedSet `json:"sets"`
	Cardio      *Cardio      `json:"cardio"`
	RestSeconds *int         `json:"rest_seconds"`
	Notes       *string      `json:"notes"`
}

type storedBlock struct {
	ID string `json:"id"`
	BlockInput
}

// TemplateBlock is a block with its exercise expanded.
type TemplateBlock struct {
	ID          string       `json:"id"`
	Position    int          `json:"position"`
	Exercise    Exercise     `json:"exercise"`
	Sets        []PlannedSet `json:"sets"`
	Cardio      *Cardio      `json:"cardio"`
	RestSeconds *int         `json:"rest_seconds"`
	Notes       *string      `json:"notes"`
}

// Template is a workout plan at its current version.
type Template struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Version   int             `json:"version"`
	VersionID string          `json:"version_id"`
	Blocks    []TemplateBlock `json:"blocks"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// TemplateVersion is one saved version.
type TemplateVersion struct {
	Version   int       `json:"version"`
	VersionID string    `json:"version_id"`
	CreatedAt time.Time `json:"created_at"`
}

// ErrUnknownExercise is returned when a block names an exercise the user can't use.
var ErrUnknownExercise = errors.New("unknown exercise")

func newBlockID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func toStored(blocks []BlockInput) []storedBlock {
	out := make([]storedBlock, len(blocks))
	for i, b := range blocks {
		if b.Sets == nil {
			b.Sets = []PlannedSet{}
		}
		out[i] = storedBlock{ID: newBlockID(), BlockInput: b}
	}
	return out
}

func checkExercises(ctx context.Context, tx pgx.Tx, userID string, blocks []BlockInput) error {
	ids := make([]string, 0, len(blocks))
	for _, b := range blocks {
		ids = append(ids, b.ExerciseID)
	}
	m, err := exercisesByID(ctx, tx, userID, ids)
	if err != nil {
		return err
	}
	for _, id := range ids {
		if _, ok := m[id]; !ok {
			return ErrUnknownExercise
		}
	}
	return nil
}

// CreateTemplate saves version 1 of a new template.
func (s *Store) CreateTemplate(ctx context.Context, userID, name string, blocks []BlockInput) (Template, error) {
	var id string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if err := checkExercises(ctx, tx, userID, blocks); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `insert into templates (user_id, name) values ($1::uuid, $2) returning id::text`, userID, name).Scan(&id); err != nil {
			return err
		}
		raw, _ := json.Marshal(toStored(blocks))
		_, err := tx.Exec(ctx, `insert into template_versions (template_id, version, blocks) values ($1::uuid, 1, $2)`, id, raw)
		return err
	})
	if err != nil {
		return Template{}, err
	}
	return s.GetTemplate(ctx, userID, id)
}

// SaveTemplateVersion writes a new version (and the name) of a template.
func (s *Store) SaveTemplateVersion(ctx context.Context, userID, id, name string, blocks []BlockInput) (Template, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if err := checkExercises(ctx, tx, userID, blocks); err != nil {
			return err
		}
		return newVersion(ctx, tx, userID, id, name, toStored(blocks))
	})
	if err != nil {
		return Template{}, err
	}
	return s.GetTemplate(ctx, userID, id)
}

func newVersion(ctx context.Context, tx pgx.Tx, userID, id, name string, blocks []storedBlock) error {
	var next int
	err := tx.QueryRow(ctx, `
		update templates set current_version = current_version + 1, name = coalesce(nullif($3, ''), name), updated_at = now()
		where id = $1::uuid and user_id = $2::uuid and archived_at is null returning current_version`, id, userID, name).Scan(&next)
	if err != nil {
		return notFound(err)
	}
	raw, _ := json.Marshal(blocks)
	_, err = tx.Exec(ctx, `insert into template_versions (template_id, version, blocks) values ($1::uuid, $2, $3)`, id, next, raw)
	return err
}

type templateRow struct {
	id, name, versionID string
	version             int
	updated             time.Time
	blocks              []storedBlock
}

func (s *Store) templateRows(ctx context.Context, userID string, id *string) ([]templateRow, error) {
	rows, err := s.Pool.Query(ctx, `
		select t.id::text, t.name, t.current_version, v.id::text, t.updated_at, v.blocks
		from templates t join template_versions v on v.template_id = t.id and v.version = t.current_version
		where t.user_id = $1::uuid and t.archived_at is null and ($2::uuid is null or t.id = $2::uuid)
		order by t.name`, userID, id)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (templateRow, error) {
		var t templateRow
		var raw []byte
		if err := r.Scan(&t.id, &t.name, &t.version, &t.versionID, &t.updated, &raw); err != nil {
			return t, err
		}
		return t, json.Unmarshal(raw, &t.blocks)
	})
}

func (s *Store) expand(ctx context.Context, userID string, rows []templateRow) ([]Template, error) {
	var ids []string
	for _, t := range rows {
		for _, b := range t.blocks {
			ids = append(ids, b.ExerciseID)
		}
	}
	ex, err := exercisesByID(ctx, s.Pool, userID, ids)
	if err != nil {
		return nil, err
	}
	out := make([]Template, 0, len(rows))
	for _, t := range rows {
		tpl := Template{ID: t.id, Name: t.name, Version: t.version, VersionID: t.versionID, UpdatedAt: t.updated, Blocks: []TemplateBlock{}}
		for i, b := range t.blocks {
			tpl.Blocks = append(tpl.Blocks, TemplateBlock{
				ID: b.ID, Position: i, Exercise: ex[b.ExerciseID], Sets: b.Sets, Cardio: b.Cardio,
				RestSeconds: b.RestSeconds, Notes: b.Notes,
			})
		}
		out = append(out, tpl)
	}
	return out, nil
}

// ListTemplates returns the user's templates at their current versions.
func (s *Store) ListTemplates(ctx context.Context, userID string) ([]Template, error) {
	rows, err := s.templateRows(ctx, userID, nil)
	if err != nil {
		return nil, err
	}
	return s.expand(ctx, userID, rows)
}

// GetTemplate returns one template at its current version.
func (s *Store) GetTemplate(ctx context.Context, userID, id string) (Template, error) {
	rows, err := s.templateRows(ctx, userID, &id)
	if err != nil {
		return Template{}, err
	}
	if len(rows) == 0 {
		return Template{}, ErrNotFound
	}
	list, err := s.expand(ctx, userID, rows)
	if err != nil {
		return Template{}, err
	}
	return list[0], nil
}

// TemplateVersions lists the versions of a template, newest first.
func (s *Store) TemplateVersions(ctx context.Context, userID, id string) ([]TemplateVersion, error) {
	rows, err := s.Pool.Query(ctx, `
		select v.version, v.id::text, v.created_at from template_versions v join templates t on t.id = v.template_id
		where t.id = $1::uuid and t.user_id = $2::uuid order by v.version desc`, id, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (TemplateVersion, error) {
		var v TemplateVersion
		return v, r.Scan(&v.Version, &v.VersionID, &v.CreatedAt)
	})
}

// ArchiveTemplate hides a template; sessions keep their history.
func (s *Store) ArchiveTemplate(ctx context.Context, userID, id string) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx, `update templates set archived_at = now() where id = $1::uuid and user_id = $2::uuid and archived_at is null`, id, userID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx, `delete from weekly_plan where template_id = $1::uuid`, id)
		return err
	})
}

// --- weekly plan -------------------------------------------------------------------

// Weekdays are the keys of the weekly plan, Monday first.
var Weekdays = []string{"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

// GetWeeklyPlan returns weekday → template id (nil for rest days).
func (s *Store) GetWeeklyPlan(ctx context.Context, userID string) (map[string]*string, error) {
	out := map[string]*string{}
	for _, d := range Weekdays {
		out[d] = nil
	}
	rows, err := s.Pool.Query(ctx, `select weekday, template_id::text from weekly_plan where user_id = $1::uuid`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var wd int
		var id string
		if err := rows.Scan(&wd, &id); err != nil {
			return nil, err
		}
		out[Weekdays[wd]] = &id
	}
	return out, rows.Err()
}

// PutWeeklyPlan replaces the weekly plan.
func (s *Store) PutWeeklyPlan(ctx context.Context, userID string, days map[string]*string) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `delete from weekly_plan where user_id = $1::uuid`, userID); err != nil {
			return err
		}
		for i, d := range Weekdays {
			id := days[d]
			if id == nil || *id == "" {
				continue
			}
			var ok bool
			if err := tx.QueryRow(ctx, `select exists(select 1 from templates where id = $1::uuid and user_id = $2::uuid and archived_at is null)`, *id, userID).Scan(&ok); err != nil {
				return err
			}
			if !ok {
				return ErrNotFound
			}
			if _, err := tx.Exec(ctx, `insert into weekly_plan (user_id, weekday, template_id) values ($1::uuid, $2, $3::uuid)`, userID, i, *id); err != nil {
				return err
			}
		}
		return nil
	})
}

// PlannedTemplateFor returns the template planned for a date's weekday.
func (s *Store) PlannedTemplateFor(ctx context.Context, userID string, d Date) (*string, error) {
	var id string
	err := s.Pool.QueryRow(ctx, `select template_id::text from weekly_plan where user_id = $1::uuid and weekday = $2`, userID, d.Weekday0()).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &id, err
}
