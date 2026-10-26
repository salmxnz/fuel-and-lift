package store

import (
	"context"
	"encoding/json"
	"errors"
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
	ID         string   `json:"id"`
	Position   int      `json:"position"`
	Exercise   Exercise `json:"exercise"`
	Skipped    bool     `json:"skipped"`
	Cardio     *Cardio  `json:"cardio"`
	CardioDone bool     `json:"cardio_done"`
	// CardioActual is what was done (typed, or read off the machine's screen).
	CardioActual *Cardio      `json:"cardio_actual"`
	Sets         []SessionSet `json:"sets"`
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

// SessionStart is what a client may decide about a new session. ID and
// StartedAt come from a session started offline; Blocks, when not nil, are
// used instead of the template's (the client built them from the template,
// the week's extras included).
type SessionStart struct {
	ID        *string
	StartedAt *time.Time
	Blocks    []BlockInput
}

// StartSession creates a session for a date, copied from the template's
// current version when templateID is given (an empty session otherwise),
// plus any exercises added to that workout for that week.
func (s *Store) StartSession(ctx context.Context, userID string, d Date, templateID *string) (Session, error) {
	sess, _, err := s.StartSessionWith(ctx, userID, d, templateID, SessionStart{})
	return sess, err
}

// StartSessionWith is StartSession with the client's id, start time and
// blocks. created is false when opt.ID is already one of the user's
// sessions: that one comes back unchanged. Someone else's id is ErrNotFound.
func (s *Store) StartSessionWith(ctx context.Context, userID string, d Date, templateID *string, opt SessionStart) (Session, bool, error) {
	var id string
	created := true
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if opt.ID != nil {
			found, err := ownedRow(ctx, tx, "sessions", *opt.ID, userID)
			if err != nil {
				return err
			}
			if found {
				id, created = *opt.ID, false
				return nil
			}
		}
		var name *string
		var versionID *string
		var version *int
		blocks := opt.Blocks
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
			name, versionID, version = &n, &vid, &v
			if opt.Blocks == nil {
				var stored []storedBlock
				if err := json.Unmarshal(raw, &stored); err != nil {
					return err
				}
				blocks = make([]BlockInput, len(stored))
				for i, b := range stored {
					b.BlockInput.ID = nil
					b.Sets = withoutIDs(b.Sets)
					blocks[i] = b.BlockInput
				}
			}
		}
		if opt.Blocks != nil {
			if err := checkExercises(ctx, tx, userID, opt.Blocks); err != nil {
				return err
			}
		}
		err := tx.QueryRow(ctx, `
			insert into sessions (id, user_id, date, template_id, template_version_id, template_version, template_name, started_at)
			values (coalesce($1::uuid, gen_random_uuid()), $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, coalesce($8::timestamptz, now()))
			on conflict (id) do nothing returning id::text`,
			opt.ID, userID, d.Time, templateID, versionID, version, name, opt.StartedAt).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) && opt.ID != nil {
			// The same id, saved by a request racing this one.
			found, err := ownedRow(ctx, tx, "sessions", *opt.ID, userID)
			if err == nil && !found {
				err = ErrConflict
			}
			id, created = *opt.ID, false
			return err
		}
		if err != nil {
			return err
		}
		if err := insertSessionBlocks(ctx, tx, id, blocks); err != nil {
			return err
		}
		if templateID == nil {
			return nil
		}
		if opt.Blocks != nil {
			// The client's blocks already have this week's extras.
			return claimWeekExtras(ctx, tx, userID, id, *templateID, d)
		}
		// Exercises added to this workout for this week only.
		return appendWeekExtras(ctx, tx, userID, id, *templateID, d, len(blocks))
	})
	if err != nil {
		return Session{}, false, err
	}
	sess, err := s.GetSession(ctx, userID, id)
	return sess, created, err
}

// insertSessionBlocks adds blocks (positions in order) and their sets to a
// new session, keeping client-made ids. An id already in use is ErrConflict.
func insertSessionBlocks(ctx context.Context, tx pgx.Tx, sessionID string, blocks []BlockInput) error {
	for i, b := range blocks {
		var cardio []byte
		if b.Cardio != nil {
			cardio, _ = json.Marshal(b.Cardio)
		}
		var bid string
		if err := tx.QueryRow(ctx, `insert into session_blocks (id, session_id, position, exercise_id, cardio, notes)
			values (coalesce($1::uuid, gen_random_uuid()), $2::uuid, $3, $4::uuid, $5, $6) returning id::text`,
			b.ID, sessionID, i, b.ExerciseID, cardio, b.Notes).Scan(&bid); err != nil {
			return uniqueConflict(err)
		}
		if err := insertSessionSets(ctx, tx, bid, b.Sets); err != nil {
			return err
		}
	}
	return nil
}

// insertSessionSets adds sets (positions in order) to a new block, keeping
// client-made ids. An id already in use is ErrConflict.
func insertSessionSets(ctx context.Context, tx pgx.Tx, blockID string, sets []PlannedSet) error {
	for j, set := range sets {
		if _, err := tx.Exec(ctx, `insert into session_sets (id, block_id, position, warmup, target_kg, target_reps, to_failure)
			values (coalesce($1::uuid, gen_random_uuid()), $2::uuid, $3, $4, $5, $6, $7)`,
			set.ID, blockID, j, set.Warmup, set.TargetKg, set.TargetReps, set.ToFailure); err != nil {
			return uniqueConflict(err)
		}
	}
	return nil
}

// AddSessionBlock adds an exercise to a session, with planned sets or cardio
// when given (a machine photo fills in the weight and three sets). A block id
// already in this session leaves the session unchanged (an offline replay);
// one used anywhere else is ErrNotFound.
func (s *Store) AddSessionBlock(ctx context.Context, userID, sessionID string, b BlockInput) (Session, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if err := ownSession(ctx, tx, userID, sessionID); err != nil {
			return err
		}
		if b.ID != nil {
			if found, err := blockInSession(ctx, tx, *b.ID, sessionID); err != nil || found {
				return err
			}
		}
		if err := checkExercises(ctx, tx, userID, []BlockInput{{ExerciseID: b.ExerciseID}}); err != nil {
			return err
		}
		var raw []byte
		if b.Cardio != nil {
			raw, _ = json.Marshal(b.Cardio)
		}
		var bid string
		err := tx.QueryRow(ctx, `insert into session_blocks (id, session_id, position, exercise_id, cardio)
			values (coalesce($4::uuid, gen_random_uuid()), $1::uuid,
			        (select coalesce(max(position) + 1, 0) from session_blocks where session_id = $1::uuid), $2::uuid, $3)
			on conflict (id) do nothing returning id::text`, sessionID, b.ExerciseID, raw, b.ID).Scan(&bid)
		if errors.Is(err, pgx.ErrNoRows) && b.ID != nil {
			// The same id, saved by a request racing this one.
			found, err := blockInSession(ctx, tx, *b.ID, sessionID)
			if err == nil && !found {
				err = ErrConflict
			}
			return err
		}
		if err != nil {
			return err
		}
		return insertSessionSets(ctx, tx, bid, b.Sets)
	})
	if err != nil {
		return Session{}, err
	}
	return s.GetSession(ctx, userID, sessionID)
}

// blockInSession reports whether block id exists in sessionID. A block of
// another session is ErrNotFound; no block is false.
func blockInSession(ctx context.Context, tx pgx.Tx, id, sessionID string) (bool, error) {
	var here bool
	err := tx.QueryRow(ctx, `select session_id = $2::uuid from session_blocks where id = $1::uuid`, id, sessionID).Scan(&here)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !here {
		return false, ErrNotFound
	}
	return true, nil
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
		select b.session_id::text, b.id::text, b.position, b.skipped, b.cardio, b.cardio_done, b.cardio_actual,
		       `+exerciseCols("$2")+`
		from session_blocks b join exercises e on e.id = b.exercise_id
		where b.session_id = any($1::uuid[]) order by b.position`, ids, userID)
	if err != nil {
		return nil, err
	}
	type blockRef struct{ s, b int }
	blockIdx := map[string]blockRef{}
	var blockIDs []string
	for brows.Next() {
		var sid string
		var b SessionBlock
		var cardio, actual []byte
		if err := brows.Scan(&sid, &b.ID, &b.Position, &b.Skipped, &cardio, &b.CardioDone, &actual,
			&b.Exercise.ID, &b.Exercise.Name, &b.Exercise.Kind, &b.Exercise.MuscleGroup, &b.Exercise.Equipment,
			&b.Exercise.MediaURL, &b.Exercise.GymPhotoURL, &b.Exercise.Aliases, &b.Exercise.Muscles, &b.Exercise.Mine, &b.Exercise.Visibility); err != nil {
			brows.Close()
			return nil, err
		}
		b.Exercise.fillNil()
		b.Cardio, b.CardioActual = decodeCardio(cardio), decodeCardio(actual)
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

func decodeCardio(raw []byte) *Cardio {
	if raw == nil {
		return nil
	}
	var c Cardio
	if json.Unmarshal(raw, &c) != nil {
		return nil
	}
	return &c
}

// BlockPatch is what changes on a session block. A non-nil CardioActual
// replaces what was done; ClearCardioActual removes it.
type BlockPatch struct {
	Skipped           *bool
	CardioDone        *bool
	CardioActual      *Cardio
	ClearCardioActual bool
}

// PatchBlock skips/unskips a block, marks cardio done or records what the
// cardio actually was.
func (s *Store) PatchBlock(ctx context.Context, userID, sessionID, blockID string, p BlockPatch) (Session, error) {
	var actual []byte
	if p.CardioActual != nil {
		actual, _ = json.Marshal(p.CardioActual)
	}
	ct, err := s.Pool.Exec(ctx, `
		update session_blocks b set skipped = coalesce($4, skipped), cardio_done = coalesce($5, cardio_done),
		       cardio_actual = case when $7 then null else coalesce($6, cardio_actual) end
		from sessions s where b.id = $3::uuid and b.session_id = s.id and s.id = $2::uuid and s.user_id = $1::uuid`,
		userID, sessionID, blockID, p.Skipped, p.CardioDone, actual, p.ClearCardioActual)
	if err != nil {
		return Session{}, err
	}
	if ct.RowsAffected() == 0 {
		return Session{}, ErrNotFound
	}
	return s.GetSession(ctx, userID, sessionID)
}

// ReorderSession puts a session's exercises in the given order ("machine's
// taken, do it later"). blockIDs must be exactly the session's blocks.
func (s *Store) ReorderSession(ctx context.Context, userID, sessionID string, blockIDs []string) (Session, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if err := ownSession(ctx, tx, userID, sessionID); err != nil {
			return err
		}
		var have []string
		rows, err := tx.Query(ctx, `select id::text from session_blocks where session_id = $1::uuid`, sessionID)
		if err != nil {
			return err
		}
		if have, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
			return err
		}
		want := map[string]bool{}
		for _, id := range blockIDs {
			want[id] = true
		}
		if len(want) != len(blockIDs) || len(have) != len(blockIDs) {
			return ErrBadOrder
		}
		for _, id := range have {
			if !want[id] {
				return ErrBadOrder
			}
		}
		_, err = tx.Exec(ctx, `update session_blocks b set position = o.ord - 1
			from unnest($2::uuid[]) with ordinality as o(id, ord)
			where b.id = o.id and b.session_id = $1::uuid`, sessionID, blockIDs)
		return err
	})
	if err != nil {
		return Session{}, err
	}
	return s.GetSession(ctx, userID, sessionID)
}

// AddSet appends a set to a block ("a third set today"). A set id already
// in that block leaves the session unchanged (an offline replay); one used
// anywhere else is ErrNotFound.
func (s *Store) AddSet(ctx context.Context, userID, sessionID, blockID string, p PlannedSet) (Session, error) {
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if p.ID != nil {
			if found, err := setInBlock(ctx, tx, userID, sessionID, blockID, *p.ID); err != nil || found {
				return err
			}
		}
		ct, err := tx.Exec(ctx, `
			insert into session_sets (id, block_id, position, warmup, target_kg, target_reps, to_failure)
			select coalesce($8::uuid, gen_random_uuid()), b.id, (select coalesce(max(position) + 1, 0) from session_sets where block_id = b.id), $4, $5, $6, $7
			from session_blocks b join sessions s on s.id = b.session_id
			where b.id = $3::uuid and s.id = $2::uuid and s.user_id = $1::uuid
			on conflict (id) do nothing`,
			userID, sessionID, blockID, p.Warmup, p.TargetKg, p.TargetReps, p.ToFailure, p.ID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			if p.ID != nil {
				// Maybe the same id, saved by a request racing this one.
				if found, err := setInBlock(ctx, tx, userID, sessionID, blockID, *p.ID); err != nil || found {
					return err
				}
			}
			return ErrNotFound
		}
		return nil
	})
	if err != nil {
		return Session{}, err
	}
	return s.GetSession(ctx, userID, sessionID)
}

// setInBlock reports whether set id exists in the user's block of the
// session. A set anywhere else is ErrNotFound; no set is false.
func setInBlock(ctx context.Context, tx pgx.Tx, userID, sessionID, blockID, id string) (bool, error) {
	var here bool
	err := tx.QueryRow(ctx, `
		select x.block_id = $2::uuid and b.session_id = $3::uuid and s.user_id = $4::uuid
		from session_sets x join session_blocks b on b.id = x.block_id join sessions s on s.id = b.session_id
		where x.id = $1::uuid`, id, blockID, sessionID, userID).Scan(&here)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !here {
		return false, ErrNotFound
	}
	return true, nil
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
// personal records. finishedAt (when it was finished offline) is used on the
// first finish only; nil is now.
func (s *Store) FinishSession(ctx context.Context, userID, sessionID string, finishedAt *time.Time) (Session, []Proposal, []Record, error) {
	if _, err := s.Pool.Exec(ctx, `
		update sessions set status = 'finished', finished_at = coalesce(finished_at, $3::timestamptz, now())
		where id = $1::uuid and user_id = $2::uuid`, sessionID, userID, finishedAt); err != nil {
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
