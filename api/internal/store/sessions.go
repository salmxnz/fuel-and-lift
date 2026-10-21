package store

import (
	"context"
	"encoding/json"
	"math"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

// SessionSet is a set as planned and as done.
type SessionSet struct {
	ID         string   `json:"id"`
	Position   int      `json:"position"`
	Warmup     bool     `json:"warmup"`
	TargetKg   *float64 `json:"target_kg"`
	TargetReps *int     `json:"target_reps"`
	ToFailure  bool     `json:"to_failure"`
	ActualKg   *float64 `json:"actual_kg"`
	ActualReps *int     `json:"actual_reps"`
	Done       bool     `json:"done"`
}

// SessionBlock is one exercise in a session.
type SessionBlock struct {
	ID         string       `json:"id"`
	Position   int          `json:"position"`
	Exercise   Exercise     `json:"exercise"`
	Skipped    bool         `json:"skipped"`
	Cardio     *Cardio      `json:"cardio"`
	CardioDone bool         `json:"cardio_done"`
	Sets       []SessionSet `json:"sets"`
}

// Session is one workout.
type Session struct {
	ID              string         `json:"id"`
	Date            Date           `json:"date"`
	TemplateID      *string        `json:"template_id"`
	TemplateName    *string        `json:"template_name"`
	TemplateVersion *int           `json:"template_version"`
	Status          string         `json:"status"`
	StartedAt       time.Time      `json:"started_at"`
	FinishedAt      *time.Time     `json:"finished_at"`
	Blocks          []SessionBlock `json:"blocks"`
}

// Proposal suggests raising a template's target weight.
type Proposal struct {
	ExerciseID   string  `json:"exercise_id"`
	ExerciseName string  `json:"exercise_name"`
	FromKg       float64 `json:"from_kg"`
	ToKg         float64 `json:"to_kg"`
}

// Record is a new personal best set during a session.
type Record struct {
	ExerciseID   string  `json:"exercise_id"`
	ExerciseName string  `json:"exercise_name"`
	Kg           float64 `json:"kg"`
	Reps         *int    `json:"reps"`
}

// StartSession creates a session for a date, copied from the template's
// current version when templateID is given (an empty session otherwise).
func (s *Store) StartSession(ctx context.Context, userID string, d Date, templateID *string) (Session, error) {
	var id string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		var name *string
		var versionID *string
		var version *int
		var blocks []storedBlock
		if templateID != nil {
			var n, vid string
			var v int
			var raw []byte
			err := tx.QueryRow(ctx, `
				select t.name, v.id::text, v.version, v.blocks from templates t
				join template_versions v on v.template_id = t.id and v.version = t.current_version
				where t.id = $1::uuid and t.user_id = $2::uuid and t.archived_at is null`, *templateID, userID).Scan(&n, &vid, &v, &raw)
			if err != nil {
				return notFound(err)
			}
			if err := json.Unmarshal(raw, &blocks); err != nil {
				return err
			}
			name, versionID, version = &n, &vid, &v
		}
		if err := tx.QueryRow(ctx, `
			insert into sessions (user_id, date, template_id, template_version_id, template_version, template_name)
			values ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6) returning id::text`,
			userID, d.Time, templateID, versionID, version, name).Scan(&id); err != nil {
			return err
		}
		for i, b := range blocks {
			var cardio []byte
			if b.Cardio != nil {
				cardio, _ = json.Marshal(b.Cardio)
			}
			var bid string
			if err := tx.QueryRow(ctx, `insert into session_blocks (session_id, position, exercise_id, cardio, notes)
				values ($1::uuid, $2, $3::uuid, $4, $5) returning id::text`, id, i, b.ExerciseID, cardio, b.Notes).Scan(&bid); err != nil {
				return err
			}
			for j, set := range b.Sets {
				if _, err := tx.Exec(ctx, `insert into session_sets (block_id, position, warmup, target_kg, target_reps, to_failure)
					values ($1::uuid, $2, $3, $4, $5, $6)`, bid, j, set.Warmup, set.TargetKg, set.TargetReps, set.ToFailure); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return Session{}, err
	}
	return s.GetSession(ctx, userID, id)
}

// AddSessionBlock adds an exercise to a session (for ad-hoc workouts).
func (s *Store) AddSessionBlock(ctx context.Context, userID, sessionID, exerciseID string) (Session, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if err := ownSession(ctx, tx, userID, sessionID); err != nil {
			return err
		}
		if err := checkExercises(ctx, tx, userID, []BlockInput{{ExerciseID: exerciseID}}); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `insert into session_blocks (session_id, position, exercise_id)
			values ($1::uuid, (select coalesce(max(position) + 1, 0) from session_blocks where session_id = $1::uuid), $2::uuid)`, sessionID, exerciseID)
		return err
	})
	if err != nil {
		return Session{}, err
	}
	return s.GetSession(ctx, userID, sessionID)
}

func ownSession(ctx context.Context, tx pgx.Tx, userID, sessionID string) error {
	var ok bool
	if err := tx.QueryRow(ctx, `select exists(select 1 from sessions where id = $1::uuid and user_id = $2::uuid)`, sessionID, userID).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

// GetSession loads a full session.
func (s *Store) GetSession(ctx context.Context, userID, id string) (Session, error) {
	list, err := s.loadSessions(ctx, userID, `s.id = $2::uuid`, id)
	if err != nil {
		return Session{}, err
	}
	if len(list) == 0 {
		return Session{}, ErrNotFound
	}
	return list[0], nil
}

// ListSessions returns sessions in [from, to], newest first.
func (s *Store) ListSessions(ctx context.Context, userID string, from, to Date) ([]Session, error) {
	return s.loadSessions(ctx, userID, `s.date between $2 and $3`, from.Time, to.Time)
}

func (s *Store) loadSessions(ctx context.Context, userID, where string, args ...any) ([]Session, error) {
	rows, err := s.Pool.Query(ctx, `
		select s.id::text, s.date, s.template_id::text, s.template_name, s.template_version, s.status, s.started_at, s.finished_at
		from sessions s where s.user_id = $1::uuid and `+where+` order by s.date desc, s.started_at desc`,
		append([]any{userID}, args...)...)
	if err != nil {
		return nil, err
	}
	sessions, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Session, error) {
		var x Session
		var d time.Time
		err := r.Scan(&x.ID, &d, &x.TemplateID, &x.TemplateName, &x.TemplateVersion, &x.Status, &x.StartedAt, &x.FinishedAt)
		x.Date = DateOf(d)
		x.Blocks = []SessionBlock{}
		return x, err
	})
	if err != nil || len(sessions) == 0 {
		if sessions == nil {
			sessions = []Session{}
		}
		return sessions, err
	}
	ids := make([]string, len(sessions))
	idx := map[string]int{}
	for i, x := range sessions {
		ids[i] = x.ID
		idx[x.ID] = i
	}

	brows, err := s.Pool.Query(ctx, `
		select b.session_id::text, b.id::text, b.position, b.skipped, b.cardio, b.cardio_done,
		       e.id::text, e.name, e.kind, e.muscle_group, e.equipment, e.media_url, e.gym_photo_url
		from session_blocks b join exercises e on e.id = b.exercise_id
		where b.session_id = any($1::uuid[]) order by b.position`, ids)
	if err != nil {
		return nil, err
	}
	type blockRef struct{ s, b int }
	blockIdx := map[string]blockRef{}
	var blockIDs []string
	for brows.Next() {
		var sid string
		var b SessionBlock
		var cardio []byte
		if err := brows.Scan(&sid, &b.ID, &b.Position, &b.Skipped, &cardio, &b.CardioDone,
			&b.Exercise.ID, &b.Exercise.Name, &b.Exercise.Kind, &b.Exercise.MuscleGroup, &b.Exercise.Equipment,
			&b.Exercise.MediaURL, &b.Exercise.GymPhotoURL); err != nil {
			brows.Close()
			return nil, err
		}
		if cardio != nil {
			var c Cardio
			if json.Unmarshal(cardio, &c) == nil {
				b.Cardio = &c
			}
		}
		b.Sets = []SessionSet{}
		si := idx[sid]
		sessions[si].Blocks = append(sessions[si].Blocks, b)
		blockIdx[b.ID] = blockRef{si, len(sessions[si].Blocks) - 1}
		blockIDs = append(blockIDs, b.ID)
	}
	brows.Close()
	if err := brows.Err(); err != nil {
		return nil, err
	}

	srows, err := s.Pool.Query(ctx, `
		select block_id::text, id::text, position, warmup, target_kg::float8, target_reps, to_failure,
		       actual_kg::float8, actual_reps, done
		from session_sets where block_id = any($1::uuid[]) order by position`, blockIDs)
	if err != nil {
		return nil, err
	}
	defer srows.Close()
	for srows.Next() {
		var bid string
		var x SessionSet
		if err := srows.Scan(&bid, &x.ID, &x.Position, &x.Warmup, &x.TargetKg, &x.TargetReps, &x.ToFailure,
			&x.ActualKg, &x.ActualReps, &x.Done); err != nil {
			return nil, err
		}
		ref := blockIdx[bid]
		sessions[ref.s].Blocks[ref.b].Sets = append(sessions[ref.s].Blocks[ref.b].Sets, x)
	}
	return sessions, srows.Err()
}

// PatchBlock skips/unskips a block or marks cardio done.
func (s *Store) PatchBlock(ctx context.Context, userID, sessionID, blockID string, skipped, cardioDone *bool) (Session, error) {
	ct, err := s.Pool.Exec(ctx, `
		update session_blocks b set skipped = coalesce($4, skipped), cardio_done = coalesce($5, cardio_done)
		from sessions s where b.id = $3::uuid and b.session_id = s.id and s.id = $2::uuid and s.user_id = $1::uuid`,
		userID, sessionID, blockID, skipped, cardioDone)
	if err != nil {
		return Session{}, err
	}
	if ct.RowsAffected() == 0 {
		return Session{}, ErrNotFound
	}
	return s.GetSession(ctx, userID, sessionID)
}

// AddSet appends a set to a block ("a third set today").
func (s *Store) AddSet(ctx context.Context, userID, sessionID, blockID string, p PlannedSet) (Session, error) {
	ct, err := s.Pool.Exec(ctx, `
		insert into session_sets (block_id, position, warmup, target_kg, target_reps, to_failure)
		select b.id, (select coalesce(max(position) + 1, 0) from session_sets where block_id = b.id), $4, $5, $6, $7
		from session_blocks b join sessions s on s.id = b.session_id
		where b.id = $3::uuid and s.id = $2::uuid and s.user_id = $1::uuid`,
		userID, sessionID, blockID, p.Warmup, p.TargetKg, p.TargetReps, p.ToFailure)
	if err != nil {
		return Session{}, err
	}
	if ct.RowsAffected() == 0 {
		return Session{}, ErrNotFound
	}
	return s.GetSession(ctx, userID, sessionID)
}

// SetPatch is what changes on a set.
type SetPatch struct {
	ActualKg   *float64
	ActualReps *int
	Done       *bool
	ClearKg    bool
	ClearReps  bool
}

// PatchSet records what was done. Ticking a set without actual values fills
// them from the targets ("auto-accept").
func (s *Store) PatchSet(ctx context.Context, userID, sessionID, setID string, p SetPatch) (Session, error) {
	ct, err := s.Pool.Exec(ctx, `
		update session_sets x set
		  actual_kg   = case when $7 then null else coalesce($4, case when $6 is true and x.actual_kg is null then x.target_kg end, x.actual_kg) end,
		  actual_reps = case when $8 then null else coalesce($5, case when $6 is true and x.actual_reps is null then x.target_reps end, x.actual_reps) end,
		  done        = coalesce($6, x.done),
		  done_at     = case when $6 is true then now() when $6 is false then null else x.done_at end
		from session_blocks b, sessions s
		where x.id = $3::uuid and x.block_id = b.id and b.session_id = s.id and s.id = $2::uuid and s.user_id = $1::uuid`,
		userID, sessionID, setID, p.ActualKg, p.ActualReps, p.Done, p.ClearKg, p.ClearReps)
	if err != nil {
		return Session{}, err
	}
	if ct.RowsAffected() == 0 {
		return Session{}, ErrNotFound
	}
	return s.GetSession(ctx, userID, sessionID)
}

// AcceptAll marks every set of unskipped blocks done at its targets.
func (s *Store) AcceptAll(ctx context.Context, userID, sessionID string) (Session, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if err := ownSession(ctx, tx, userID, sessionID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update session_sets x set done = true, done_at = coalesce(done_at, now()),
			       actual_kg = coalesce(actual_kg, target_kg), actual_reps = coalesce(actual_reps, target_reps)
			from session_blocks b where x.block_id = b.id and b.session_id = $1::uuid and not b.skipped and not x.done`, sessionID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `update session_blocks set cardio_done = true where session_id = $1::uuid and not skipped and cardio is not null`, sessionID)
		return err
	})
	if err != nil {
		return Session{}, err
	}
	return s.GetSession(ctx, userID, sessionID)
}

// FinishSession closes a session and works out template proposals and new
// personal records.
func (s *Store) FinishSession(ctx context.Context, userID, sessionID string) (Session, []Proposal, []Record, error) {
	if _, err := s.Pool.Exec(ctx, `
		update sessions set status = 'finished', finished_at = coalesce(finished_at, now())
		where id = $1::uuid and user_id = $2::uuid`, sessionID, userID); err != nil {
		return Session{}, nil, nil, err
	}
	sess, err := s.GetSession(ctx, userID, sessionID)
	if err != nil {
		return sess, nil, nil, err
	}
	props := Proposals(sess)
	recs, err := s.newRecords(ctx, userID, sess)
	return sess, props, recs, err
}

// Proposals finds exercises where every done working set beat the planned
// weight. The proposal is the lightest of those sets, so the template only
// moves to a weight that was lifted on every set.
func Proposals(sess Session) []Proposal {
	var out []Proposal
	for _, b := range sess.Blocks {
		if b.Skipped {
			continue
		}
		var from, to float64
		count := 0
		ok := true
		for _, x := range b.Sets {
			if x.Warmup || !x.Done {
				continue
			}
			if x.TargetKg == nil || x.ActualKg == nil || *x.ActualKg <= *x.TargetKg {
				ok = false
				break
			}
			if count == 0 || *x.ActualKg < to {
				to = *x.ActualKg
			}
			if *x.TargetKg > from {
				from = *x.TargetKg
			}
			count++
		}
		if ok && count > 0 {
			out = append(out, Proposal{ExerciseID: b.Exercise.ID, ExerciseName: b.Exercise.Name, FromKg: from, ToKg: to})
		}
	}
	if out == nil {
		out = []Proposal{}
	}
	return out
}

// newRecords compares this session's best working set per exercise with every
// earlier finished session. A first-ever session sets no records.
func (s *Store) newRecords(ctx context.Context, userID string, sess Session) ([]Record, error) {
	out := []Record{}
	for _, b := range sess.Blocks {
		if b.Skipped || b.Exercise.Kind != "strength" {
			continue
		}
		var best *SessionSet
		for i := range b.Sets {
			x := &b.Sets[i]
			if x.Warmup || !x.Done || x.ActualKg == nil {
				continue
			}
			if best == nil || *x.ActualKg > *best.ActualKg {
				best = x
			}
		}
		if best == nil {
			continue
		}
		var prev *float64
		err := s.Pool.QueryRow(ctx, `
			select max(x.actual_kg)::float8 from session_sets x
			join session_blocks b on b.id = x.block_id join sessions s on s.id = b.session_id
			where s.user_id = $1::uuid and s.id <> $2::uuid and s.status = 'finished' and b.exercise_id = $3::uuid
			  and x.done and not x.warmup and (s.date < $4 or (s.date = $4 and s.started_at < $5))`,
			userID, sess.ID, b.Exercise.ID, sess.Date.Time, sess.StartedAt).Scan(&prev)
		if err != nil {
			return nil, err
		}
		if prev != nil && *best.ActualKg > *prev {
			out = append(out, Record{ExerciseID: b.Exercise.ID, ExerciseName: b.Exercise.Name, Kg: *best.ActualKg, Reps: best.ActualReps})
		}
	}
	return out, nil
}

// ApplyProposals saves a new template version with the proposed weights for
// the chosen exercises.
func (s *Store) ApplyProposals(ctx context.Context, userID, sessionID string, exerciseIDs []string) (Template, error) {
	sess, err := s.GetSession(ctx, userID, sessionID)
	if err != nil {
		return Template{}, err
	}
	if sess.TemplateID == nil {
		return Template{}, ErrConflict
	}
	want := map[string]float64{}
	chosen := map[string]bool{}
	for _, id := range exerciseIDs {
		chosen[id] = true
	}
	for _, p := range Proposals(sess) {
		if chosen[p.ExerciseID] {
			want[p.ExerciseID] = p.ToKg
		}
	}
	if len(want) == 0 {
		return s.GetTemplate(ctx, userID, *sess.TemplateID)
	}
	err = s.tx(ctx, func(tx pgx.Tx) error {
		var raw []byte
		if err := tx.QueryRow(ctx, `
			select v.blocks from templates t join template_versions v on v.template_id = t.id and v.version = t.current_version
			where t.id = $1::uuid and t.user_id = $2::uuid for update of t`, *sess.TemplateID, userID).Scan(&raw); err != nil {
			return notFound(err)
		}
		var blocks []storedBlock
		if err := json.Unmarshal(raw, &blocks); err != nil {
			return err
		}
		for i, b := range blocks {
			kg, ok := want[b.ExerciseID]
			if !ok {
				continue
			}
			for j := range b.Sets {
				if !b.Sets[j].Warmup {
					v := kg
					blocks[i].Sets[j].TargetKg = &v
				}
			}
		}
		return newVersion(ctx, tx, userID, *sess.TemplateID, "", blocks)
	})
	if err != nil {
		return Template{}, err
	}
	return s.GetTemplate(ctx, userID, *sess.TemplateID)
}

// --- progress ----------------------------------------------------------------------

// ExercisePoint is the best set of one session.
type ExercisePoint struct {
	Date    Date    `json:"date"`
	TopKg   float64 `json:"top_kg"`
	TopReps *int    `json:"top_reps"`
	E1RMKg  float64 `json:"e1rm_kg"`
}

// E1RM is the Epley estimate of a one-rep max.
func E1RM(kg float64, reps *int) float64 {
	if reps == nil || *reps <= 1 {
		return kg
	}
	return math.Round(kg*(1+float64(*reps)/30)*10) / 10
}

// ExerciseHistory returns one point per finished session with that exercise.
func (s *Store) ExerciseHistory(ctx context.Context, userID, exerciseID string) ([]ExercisePoint, error) {
	rows, err := s.Pool.Query(ctx, `
		select s.id::text, s.date, x.actual_kg::float8, x.actual_reps
		from session_sets x join session_blocks b on b.id = x.block_id join sessions s on s.id = b.session_id
		where s.user_id = $1::uuid and s.status = 'finished' and b.exercise_id = $2::uuid
		  and x.done and not x.warmup and x.actual_kg is not null
		order by s.date, s.started_at`, userID, exerciseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type acc struct {
		p     ExercisePoint
		order int
	}
	by := map[string]*acc{}
	n := 0
	for rows.Next() {
		var sid string
		var d time.Time
		var kg float64
		var reps *int
		if err := rows.Scan(&sid, &d, &kg, &reps); err != nil {
			return nil, err
		}
		a, ok := by[sid]
		if !ok {
			a = &acc{p: ExercisePoint{Date: DateOf(d)}, order: n}
			n++
			by[sid] = a
		}
		if kg > a.p.TopKg {
			a.p.TopKg, a.p.TopReps = kg, reps
		}
		if e := E1RM(kg, reps); e > a.p.E1RMKg {
			a.p.E1RMKg = e
		}
	}
	list := make([]*acc, 0, len(by))
	for _, a := range by {
		list = append(list, a)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].order < list[j].order })
	out := make([]ExercisePoint, len(list))
	for i, a := range list {
		out[i] = a.p
	}
	return out, rows.Err()
}

// BestSet is an all-time best for an exercise.
type BestSet struct {
	ExerciseID   string  `json:"exercise_id"`
	ExerciseName string  `json:"exercise_name"`
	Kg           float64 `json:"kg"`
	Reps         *int    `json:"reps"`
	Date         Date    `json:"date"`
}

// Records returns the heaviest working set per exercise (latest on ties).
func (s *Store) Records(ctx context.Context, userID string) ([]BestSet, error) {
	rows, err := s.Pool.Query(ctx, `
		select distinct on (b.exercise_id) b.exercise_id::text, e.name, x.actual_kg::float8, x.actual_reps, s.date
		from session_sets x join session_blocks b on b.id = x.block_id join sessions s on s.id = b.session_id
		join exercises e on e.id = b.exercise_id
		where s.user_id = $1::uuid and s.status = 'finished' and x.done and not x.warmup and x.actual_kg is not null
		order by b.exercise_id, x.actual_kg desc, s.date desc`, userID)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (BestSet, error) {
		var b BestSet
		var d time.Time
		err := r.Scan(&b.ExerciseID, &b.ExerciseName, &b.Kg, &b.Reps, &d)
		b.Date = DateOf(d)
		return b, err
	})
	if out == nil {
		out = []BestSet{}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date.After(out[j].Date.Time) })
	return out, err
}
