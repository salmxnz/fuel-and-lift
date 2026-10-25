package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Exercises people make can be shown to friends or in the Shop. Adding one
// copies it into your own exercises, so templates and sessions only ever use
// the library and your own. Friends see the owner's gym photo; the Shop shows
// only the stock picture (nobody moderates exercise photos).

// SharedExercise is someone else's exercise the viewer may add.
type SharedExercise struct {
	Exercise
	Owner Person `json:"owner"`
	// Added is the viewer's copy, when they already have one.
	Added *string `json:"added_id"`
}

// SetExerciseVisibility changes who sees one of the user's own exercises.
func (s *Store) SetExerciseVisibility(ctx context.Context, userID, id, vis string) (Exercise, error) {
	if !Visibilities[vis] {
		return Exercise{}, ErrNotFound
	}
	rows, err := s.Pool.Query(ctx, `update exercises e set visibility = $3,
			published_at = case when $3 <> 'private' then coalesce(e.published_at, now()) else e.published_at end
		where e.id = $1::uuid and e.owner_id = $2::uuid returning `+exerciseCols("$2"), id, userID, vis)
	if err != nil {
		return Exercise{}, err
	}
	e, err := pgx.CollectExactlyOneRow(rows, scanExercise)
	return e, notFound(err)
}

// SharedExercises lists other people's exercises: scope "friends" is what
// friends share (friends-only or public), "public" is the Shop. q filters
// by name.
func (s *Store) SharedExercises(ctx context.Context, viewer, scope, q string) ([]SharedExercise, error) {
	cond := `e.visibility = 'public'`
	photo := `null::text`
	if scope == "friends" {
		cond = `e.visibility in ('friends', 'public') and e.owner_id in (` + friendIDsSQL + `)`
		photo = `(select ` + photoURLSQL + ` from exercise_photos p where p.exercise_id = e.id and p.user_id = e.owner_id)`
	}
	rows, err := s.Pool.Query(ctx, `
		select e.id::text, e.name, e.kind, e.muscle_group, e.equipment, e.media_url, `+photo+`, e.aliases, e.muscles, e.visibility,
		       u.id::text, coalesce(pr.display_name, u.name, ''), u.avatar_url,
		       (select m.id::text from exercises m where m.owner_id = $1::uuid and (m.copied_from_id = e.id or lower(m.name) = lower(e.name)) limit 1)
		from exercises e join users u on u.id = e.owner_id left join profiles pr on pr.user_id = u.id
		where e.owner_id <> $1::uuid and u.suspended_at is null and `+cond+`
		  and ($2 = '' or e.name ilike $2 or e.muscle_group ilike $2 or e.equipment ilike $2)
		order by e.published_at desc nulls last limit 60`, viewer, likePattern(q))
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (SharedExercise, error) {
		var x SharedExercise
		err := r.Scan(&x.ID, &x.Name, &x.Kind, &x.MuscleGroup, &x.Equipment, &x.MediaURL, &x.GymPhotoURL, &x.Aliases, &x.Muscles, &x.Visibility,
			&x.Owner.ID, &x.Owner.Name, &x.Owner.AvatarURL, &x.Added)
		x.fillNil()
		return x, err
	})
	if list == nil {
		list = []SharedExercise{}
	}
	return list, err
}

// AddSharedExercise copies someone else's exercise into the viewer's own
// (or returns the copy they already have). A friend's gym photo comes along.
func (s *Store) AddSharedExercise(ctx context.Context, viewer, id string) (Exercise, error) {
	var newID string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		var e Exercise
		var owner string
		var friend bool
		err := tx.QueryRow(ctx, `
			select e.name, e.kind, e.muscle_group, e.equipment, e.media_url, e.muscles, e.owner_id::text,
			       e.owner_id in (`+friendIDsSQL+`)
			from exercises e join users u on u.id = e.owner_id
			where e.id = $2::uuid and e.owner_id <> $1::uuid and u.suspended_at is null
			  and (e.visibility = 'public' or (e.visibility = 'friends' and e.owner_id in (`+friendIDsSQL+`)))`, viewer, id).
			Scan(&e.Name, &e.Kind, &e.MuscleGroup, &e.Equipment, &e.MediaURL, &e.Muscles, &owner, &friend)
		if err != nil {
			return notFound(err)
		}
		err = tx.QueryRow(ctx, `select id::text from exercises where owner_id = $1::uuid and (copied_from_id = $2::uuid or lower(name) = lower($3)) limit 1`,
			viewer, id, strings.TrimSpace(e.Name)).Scan(&newID)
		if err == nil {
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err := tx.QueryRow(ctx, `insert into exercises (owner_id, name, kind, muscle_group, equipment, media_url, muscles, copied_from_id)
			values ($1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid) returning id::text`,
			viewer, e.Name, e.Kind, e.MuscleGroup, e.Equipment, e.MediaURL, e.Muscles, id).Scan(&newID); err != nil {
			return err
		}
		if !friend {
			return nil
		}
		_, err = tx.Exec(ctx, `insert into exercise_photos (user_id, exercise_id, media_type, data)
			select $1::uuid, $2::uuid, media_type, data from exercise_photos where exercise_id = $3::uuid and user_id = $4::uuid`,
			viewer, newID, id, owner)
		return err
	})
	if err != nil {
		return Exercise{}, err
	}
	return s.GetExercise(ctx, viewer, newID)
}

// SetExercisePhoto keeps the user's photo of an exercise they can use (a
// library one or their own), replacing any earlier one.
func (s *Store) SetExercisePhoto(ctx context.Context, userID, exerciseID, mediaType string, data []byte) (Exercise, error) {
	ct, err := s.Pool.Exec(ctx, `
		insert into exercise_photos (user_id, exercise_id, media_type, data)
		select $1::uuid, e.id, $3, $4 from exercises e where e.id = $2::uuid and (e.owner_id is null or e.owner_id = $1::uuid)
		on conflict (user_id, exercise_id) do update set media_type = excluded.media_type, data = excluded.data, updated_at = now()`,
		userID, exerciseID, mediaType, data)
	if err != nil {
		return Exercise{}, err
	}
	if ct.RowsAffected() == 0 {
		return Exercise{}, ErrNotFound
	}
	return s.GetExercise(ctx, userID, exerciseID)
}

// DeleteExercisePhoto removes the user's photo of an exercise.
func (s *Store) DeleteExercisePhoto(ctx context.Context, userID, exerciseID string) (Exercise, error) {
	if _, err := s.Pool.Exec(ctx, `delete from exercise_photos where user_id = $1::uuid and exercise_id = $2::uuid`, userID, exerciseID); err != nil {
		return Exercise{}, err
	}
	return s.GetExercise(ctx, userID, exerciseID)
}

// ExercisePhoto is a stored gym photo.
type ExercisePhoto struct {
	MediaType string
	Data      []byte
	UpdatedAt time.Time
}

// GetExercisePhoto returns a photo by its id (the id is in its URL).
func (s *Store) GetExercisePhoto(ctx context.Context, id string) (ExercisePhoto, error) {
	var p ExercisePhoto
	err := s.Pool.QueryRow(ctx, `select media_type, data, updated_at from exercise_photos where id = $1::uuid`, id).
		Scan(&p.MediaType, &p.Data, &p.UpdatedAt)
	return p, notFound(err)
}
