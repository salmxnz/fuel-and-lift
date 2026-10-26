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
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Kind        string  `json:"kind"` // strength | cardio
	MuscleGroup *string `json:"muscle_group"`
	Equipment   *string `json:"equipment"`
	MediaURL    *string `json:"media_url"`
	// GymPhotoURL is the viewer's own photo of the machine, when they took one.
	GymPhotoURL *string  `json:"gym_photo_url"`
	Aliases     []string `json:"aliases"`
	// Muscles it works, finer than MuscleGroup, main one first.
	Muscles []string `json:"muscles"`
	// Mine is true for the viewer's own exercises (they can share them).
	Mine       bool   `json:"mine"`
	Visibility string `json:"visibility"` // private | friends | public
	// MatchedAlias is set by search when the hit came from another name
	// ("stairmaster" → Stair climber).
	MatchedAlias *string `json:"matched_alias,omitempty"`
}

// exerciseCols reads exercises aliased e, as seen by the user in parameter
// user (e.g. "$1"): their own gym photo wins.
func exerciseCols(user string) string {
	return `e.id::text, e.name, e.kind, e.muscle_group, e.equipment, e.media_url,
		coalesce((select ` + photoURLSQL + ` from exercise_photos p where p.exercise_id = e.id and p.user_id = ` + user + `::uuid), e.gym_photo_url),
		e.aliases, e.muscles, coalesce(e.owner_id = ` + user + `::uuid, false), e.visibility`
}

// photoURLSQL is an exercise photo's URL (photo aliased p); ?v= changes with
// every new photo so it can be cached for good.
const photoURLSQL = `'/exercise-photos/' || p.id::text || '?v=' || floor(extract(epoch from p.updated_at))::bigint::text`

func scanExercise(r pgx.CollectableRow) (Exercise, error) {
	var e Exercise
	err := r.Scan(&e.ID, &e.Name, &e.Kind, &e.MuscleGroup, &e.Equipment, &e.MediaURL, &e.GymPhotoURL, &e.Aliases, &e.Muscles, &e.Mine, &e.Visibility)
	e.fillNil()
	return e, err
}

func (e *Exercise) fillNil() {
	if e.Aliases == nil {
		e.Aliases = []string{}
	}
	if e.Muscles == nil {
		e.Muscles = []string{}
	}
}

// ListExercises searches the shared library and the user's own exercises
// (see RankExercises): any word order, other names and small typos match.
func (s *Store) ListExercises(ctx context.Context, userID, q string) ([]Exercise, error) {
	rows, err := s.Pool.Query(ctx, `select `+exerciseCols("$1")+` from exercises e
		where e.owner_id is null or e.owner_id = $1::uuid order by e.name`, userID)
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

// GetExercise returns one exercise the user can use.
func (s *Store) GetExercise(ctx context.Context, userID, id string) (Exercise, error) {
	rows, err := s.Pool.Query(ctx, `select `+exerciseCols("$2")+` from exercises e
		where e.id = $1::uuid and (e.owner_id is null or e.owner_id = $2::uuid)`, id, userID)
	if err != nil {
		return Exercise{}, err
	}
	e, err := pgx.CollectExactlyOneRow(rows, scanExercise)
	return e, notFound(err)
}

// CreateExercise adds one of the user's own exercises. MediaURL may borrow a
// library exercise's picture (the AI picks the closest one).
func (s *Store) CreateExercise(ctx context.Context, userID string, e Exercise) (Exercise, error) {
	rows, err := s.Pool.Query(ctx, `insert into exercises as e (owner_id, name, kind, muscle_group, equipment, media_url, muscles)
		values ($1::uuid, $2, $3, $4, $5, $6, coalesce($7::text[], '{}')) returning `+exerciseCols("$1"),
		userID, e.Name, e.Kind, e.MuscleGroup, e.Equipment, e.MediaURL, e.Muscles)
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
	rows, err := q.Query(ctx, `select `+exerciseCols("$2")+` from exercises e
		where e.id = any($1::uuid[]) and (e.owner_id is null or e.owner_id = $2::uuid)`, ids, userID)
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

// LibraryExerciseIDs maps shared-library exercise names to their ids. Names
// not in the library are left out.
func (s *Store) LibraryExerciseIDs(ctx context.Context, names []string) (map[string]string, error) {
	rows, err := s.Pool.Query(ctx, `select name, id::text from exercises where owner_id is null and name = any($1)`, names)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var name, id string
		if err := rows.Scan(&name, &id); err != nil {
			return nil, err
		}
		out[name] = id
	}
	return out, rows.Err()
}

// --- templates -----------------------------------------------------------------

// PlannedSet is one set in a template.
type PlannedSet struct {
	// ID is a client-made id (uuid) for a set added to a session, so an
	// offline replay can't add it twice. Templates don't keep it.
	ID         *string  `json:"id,omitempty"`
	Warmup     bool     `json:"warmup"`
	TargetKg   *float64 `json:"target_kg"`
	TargetReps *int     `json:"target_reps"`
	ToFailure  bool     `json:"to_failure"`
}

// Cardio parameters for a cardio block. Which ones apply depends on the
// machine (a treadmill has incline and speed, a bike a level, a rower a
// distance); the app only shows those. Kcal is only ever read off a screen.
type Cardio struct {
	Minutes    float64  `json:"minutes"`
	Incline    *float64 `json:"incline"`
	Speed      *float64 `json:"speed"`
	Level      *float64 `json:"level,omitempty"`
	DistanceKm *float64 `json:"distance_km,omitempty"`
	Kcal       *float64 `json:"kcal,omitempty"`
}

// BlockInput is a block as the client sends it.
type BlockInput struct {
	// ID is a client-made id (uuid) for a block added to a session, so an
	// offline replay can't add it twice. Templates don't keep it.
	ID          *string      `json:"id,omitempty"`
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
	ID        string `json:"id"`
	Name      string `json:"name"`
	Version   int    `json:"version"`
	VersionID string `json:"version_id"`
	// CurrentVersion is the version sessions start from; it differs from
	// Version only when an older version is being viewed.
	CurrentVersion int             `json:"current_version"`
	Blocks         []TemplateBlock `json:"blocks"`
	UpdatedAt      time.Time       `json:"updated_at"`
	Community
	ownerID string
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
		b.ID = nil
		b.Sets = withoutIDs(b.Sets)
		out[i] = storedBlock{ID: newBlockID(), BlockInput: b}
	}
	return out
}

// withoutIDs copies sets without their client ids (never nil): only
// sessions keep set ids.
func withoutIDs(sets []PlannedSet) []PlannedSet {
	out := make([]PlannedSet, len(sets))
	for i, x := range sets {
		x.ID = nil
		out[i] = x
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
		var err error
		id, err = createTemplate(ctx, tx, userID, name, blocks)
		return err
	})
	if err != nil {
		return Template{}, err
	}
	return s.GetTemplate(ctx, userID, id)
}

func createTemplate(ctx context.Context, tx pgx.Tx, userID, name string, blocks []BlockInput) (string, error) {
	if err := checkExercises(ctx, tx, userID, blocks); err != nil {
		return "", err
	}
	var id string
	if err := tx.QueryRow(ctx, `insert into templates (user_id, name) values ($1::uuid, $2) returning id::text`, userID, name).Scan(&id); err != nil {
		return "", err
	}
	raw, _ := json.Marshal(toStored(blocks))
	_, err := tx.Exec(ctx, `insert into template_versions (template_id, version, blocks) values ($1::uuid, 1, $2)`, id, raw)
	return id, err
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

// newVersion saves blocks as the next version number (one past the highest,
// not the current: an older version may have been made current) and makes it
// current.
func newVersion(ctx context.Context, tx pgx.Tx, userID, id, name string, blocks []storedBlock) error {
	var next int
	err := tx.QueryRow(ctx, `
		update templates t set current_version = (select max(version) + 1 from template_versions v where v.template_id = t.id),
		       name = coalesce(nullif($3, ''), name), updated_at = now()
		where id = $1::uuid and user_id = $2::uuid and archived_at is null returning current_version`, id, userID, name).Scan(&next)
	if err != nil {
		return notFound(err)
	}
	raw, _ := json.Marshal(blocks)
	_, err = tx.Exec(ctx, `insert into template_versions (template_id, version, blocks) values ($1::uuid, $2, $3)`, id, next, raw)
	return err
}

type templateRow struct {
	id, owner, name, versionID string
	version, current           int
	updated                    time.Time
	blocks                     []storedBlock
	community                  Community
}

// templateSelect selects templateRows at the version version (SQL).
func templateSelect(version string) string {
	return `
		select t.id::text, t.user_id::text, t.name, v.version, t.current_version, v.id::text, t.updated_at, v.blocks,
		       t.visibility, t.published_at, t.add_count, t.hidden_at is not null, ` + copiedFromCols + `
		from templates t join template_versions v on v.template_id = t.id and v.version = ` + version + `
		` + copiedFromJoin("t")
}

func scanTemplateRow(r pgx.CollectableRow) (templateRow, error) {
	var t templateRow
	var raw []byte
	var cf copiedFrom
	if err := r.Scan(&t.id, &t.owner, &t.name, &t.version, &t.current, &t.versionID, &t.updated, &raw,
		&t.community.Visibility, &t.community.PublishedAt, &t.community.AddCount, &t.community.Hidden,
		&cf.id, &cf.name, &cf.avatar); err != nil {
		return t, err
	}
	t.community.CopiedFrom = cf.person()
	return t, json.Unmarshal(raw, &t.blocks)
}

// templateRows loads the user's templates at their current version, or one
// of them at a given version.
func (s *Store) templateRows(ctx context.Context, userID string, id *string, version *int) ([]templateRow, error) {
	rows, err := s.Pool.Query(ctx, templateSelect("coalesce($3::int, t.current_version)")+`
		where t.user_id = $1::uuid and t.archived_at is null and ($2::uuid is null or t.id = $2::uuid)
		order by t.name`, userID, id, version)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanTemplateRow)
}

// templateRowsByIDs loads templates at their current version whoever owns
// them: only for callers that already checked the viewer may see them.
func (s *Store) templateRowsByIDs(ctx context.Context, ids []string) ([]templateRow, error) {
	rows, err := s.Pool.Query(ctx, templateSelect("t.current_version")+`
		where t.id = any($1::uuid[]) and t.archived_at is null
		order by t.name`, ids)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanTemplateRow)
}

// expand resolves each block's exercise as the template's owner sees it, so
// someone else's custom exercises show up in a shared or public template.
func (s *Store) expand(ctx context.Context, rows []templateRow) ([]Template, error) {
	byOwner := map[string][]string{}
	for _, t := range rows {
		for _, b := range t.blocks {
			byOwner[t.owner] = append(byOwner[t.owner], b.ExerciseID)
		}
	}
	ex := map[string]map[string]Exercise{}
	for owner, ids := range byOwner {
		m, err := exercisesByID(ctx, s.Pool, owner, ids)
		if err != nil {
			return nil, err
		}
		ex[owner] = m
	}
	out := make([]Template, 0, len(rows))
	for _, t := range rows {
		tpl := Template{ID: t.id, Name: t.name, Version: t.version, CurrentVersion: t.current, VersionID: t.versionID,
			UpdatedAt: t.updated, Blocks: []TemplateBlock{}, Community: t.community, ownerID: t.owner}
		for i, b := range t.blocks {
			tpl.Blocks = append(tpl.Blocks, TemplateBlock{
				ID: b.ID, Position: i, Exercise: ex[t.owner][b.ExerciseID], Sets: b.Sets, Cardio: b.Cardio,
				RestSeconds: b.RestSeconds, Notes: b.Notes,
			})
		}
		out = append(out, tpl)
	}
	return out, nil
}

// ListTemplates returns the user's templates at their current versions.
func (s *Store) ListTemplates(ctx context.Context, userID string) ([]Template, error) {
	rows, err := s.templateRows(ctx, userID, nil, nil)
	if err != nil {
		return nil, err
	}
	return s.expand(ctx, rows)
}

// GetTemplate returns one template at its current version.
func (s *Store) GetTemplate(ctx context.Context, userID, id string) (Template, error) {
	return s.GetTemplateVersion(ctx, userID, id, nil)
}

// GetTemplateVersion returns one template at a given version (nil = current).
func (s *Store) GetTemplateVersion(ctx context.Context, userID, id string, version *int) (Template, error) {
	rows, err := s.templateRows(ctx, userID, &id, version)
	if err != nil {
		return Template{}, err
	}
	if len(rows) == 0 {
		return Template{}, ErrNotFound
	}
	list, err := s.expand(ctx, rows)
	if err != nil {
		return Template{}, err
	}
	return list[0], nil
}

// SetCurrentVersion makes an existing version the one sessions start from.
// Nothing is copied: later saves still get the next free version number.
func (s *Store) SetCurrentVersion(ctx context.Context, userID, id string, version int) (Template, error) {
	ct, err := s.Pool.Exec(ctx, `
		update templates t set current_version = $3, updated_at = now()
		where t.id = $1::uuid and t.user_id = $2::uuid and t.archived_at is null
		  and exists (select 1 from template_versions v where v.template_id = t.id and v.version = $3)`, id, userID, version)
	if err != nil {
		return Template{}, err
	}
	if ct.RowsAffected() == 0 {
		return Template{}, ErrNotFound
	}
	return s.GetTemplate(ctx, userID, id)
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
		if _, err = tx.Exec(ctx, `delete from weekly_plan where template_id = $1::uuid`, id); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `delete from routine_days where template_id = $1::uuid`, id)
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
