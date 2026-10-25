package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// LiveWindow is how long a started workout counts as "at the gym".
const LiveWindow = 4 * time.Hour

// ErrInWorkout means the user already has a workout going.
var ErrInWorkout = errors.New("already in a workout")

// LiveSession is a workout someone is doing (or just did), as a friend sees it.
type LiveSession struct {
	ID             string     `json:"id"`
	Person         Person     `json:"person"`
	TemplateName   *string    `json:"template_name"`
	StartedAt      time.Time  `json:"started_at"`
	FinishedAt     *time.Time `json:"finished_at"`
	ExercisesTotal int        `json:"exercises_total"`
	ExercisesDone  int        `json:"exercises_done"`
	SetsDone       int        `json:"sets_done"`
	// The exercise they're on (the one with their latest set, or the first not started).
	Current *string `json:"current"`
	// Their latest set; weights only when they share workout details.
	LastSet *LiveSet `json:"last_set"`
}

// LiveSet is one done set.
type LiveSet struct {
	Exercise string    `json:"exercise"`
	Kg       *float64  `json:"kg"`
	Reps     *int      `json:"reps"`
	At       time.Time `json:"at"`
}

// FriendIDsWanting returns the user's friends who have a notification switch
// on (friend_shares, friend_training or friend_workouts; missing rows count as
// on) and, for training, haven't muted this friend's workouts.
func (s *Store) FriendIDsWanting(ctx context.Context, userID, pref string) ([]string, error) {
	switch pref {
	case "friend_shares", "friend_training", "friend_workouts":
	default:
		return nil, errors.New("unknown notification switch " + pref)
	}
	muted := ""
	if pref != "friend_shares" {
		muted = ` and not exists (select 1 from friend_settings fs where fs.user_id = f.id and fs.friend_id = $1::uuid and not fs.notify_workouts)`
	}
	rows, err := s.Pool.Query(ctx, `
		select f.id::text from (`+friendIDsSQL+`) as f(id)
		left join notification_prefs np on np.user_id = f.id
		where coalesce(np.`+pref+`, true)`+muted, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// ClearTraining removes a session's "training now" from the feed (it finished).
func (s *Store) ClearTraining(ctx context.Context, sessionID string) error {
	_, err := s.Pool.Exec(ctx, `delete from activities where kind = 'workout_started' and session_id = $1::uuid`, sessionID)
	return err
}

// TrainingNow returns the workout personID has going, if viewer may see it:
// their own, or a friend's who shares training_now. Nil when there's none.
func (s *Store) TrainingNow(ctx context.Context, viewer, personID string) (*LiveSession, error) {
	if viewer != personID {
		ok, err := s.AreFriends(ctx, viewer, personID)
		if err != nil || !ok {
			return nil, err
		}
		sh, err := s.GetSharing(ctx, personID)
		if err != nil || !sh.TrainingNow {
			return nil, err
		}
	}
	var id string
	err := s.Pool.QueryRow(ctx, `
		select id::text from sessions where user_id = $1::uuid and status = 'active' and started_at > $2
		order by started_at desc limit 1`, personID, time.Now().Add(-LiveWindow)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	details := viewer == personID
	if !details {
		sh, err := s.GetSharing(ctx, personID)
		if err != nil {
			return nil, err
		}
		details = sh.WorkoutDetails
	}
	l, err := s.liveSession(ctx, id, details)
	return &l, err
}

// liveSession summarises a session's progress.
func (s *Store) liveSession(ctx context.Context, id string, details bool) (LiveSession, error) {
	var l LiveSession
	err := s.Pool.QueryRow(ctx, `
		select s.id::text, u.id::text, coalesce(p.display_name, u.name), u.avatar_url, s.template_name, s.started_at, s.finished_at,
		       (select count(*) from session_blocks b where b.session_id = s.id and not b.skipped),
		       (select count(*) from session_blocks b where b.session_id = s.id and not b.skipped
		          and (b.cardio_done or exists(select 1 from session_sets st where st.block_id = b.id and st.done))),
		       (select count(*) from session_sets st join session_blocks b on b.id = st.block_id
		          where b.session_id = s.id and st.done and not st.warmup)
		from sessions s join users u on u.id = s.user_id left join profiles p on p.user_id = u.id
		where s.id = $1::uuid`, id).
		Scan(&l.ID, &l.Person.ID, &l.Person.Name, &l.Person.AvatarURL, &l.TemplateName, &l.StartedAt, &l.FinishedAt,
			&l.ExercisesTotal, &l.ExercisesDone, &l.SetsDone)
	if err != nil {
		return l, notFound(err)
	}
	var last LiveSet
	var kg *float64
	err = s.Pool.QueryRow(ctx, `
		select e.name, st.actual_kg::float8, st.actual_reps, st.done_at
		from session_sets st join session_blocks b on b.id = st.block_id join exercises e on e.id = b.exercise_id
		where b.session_id = $1::uuid and st.done and st.done_at is not null
		order by st.done_at desc limit 1`, id).Scan(&last.Exercise, &kg, &last.Reps, &last.At)
	switch {
	case err == nil:
		name := last.Exercise
		l.Current = &name
		if details {
			last.Kg = kg
		} else {
			last.Reps = nil
		}
		l.LastSet = &last
	case errors.Is(err, pgx.ErrNoRows):
		// Nothing done yet: they're on the first exercise.
		var first string
		if err := s.Pool.QueryRow(ctx, `
			select e.name from session_blocks b join exercises e on e.id = b.exercise_id
			where b.session_id = $1::uuid and not b.skipped order by b.position limit 1`, id).Scan(&first); err == nil {
			l.Current = &first
		}
	default:
		return l, err
	}
	return l, nil
}

// JoinWorkout starts the user's own copy of the workout a friend is doing
// now and links the two sessions. The friend's template is copied once (into
// a template that remembers where it came from) and reused next time.
// ErrNotFound when the friend isn't training (or doesn't share it);
// ErrInWorkout when the user already has one going.
func (s *Store) JoinWorkout(ctx context.Context, userID, friendID string, d Date) (Session, string, error) {
	live, err := s.TrainingNow(ctx, userID, friendID)
	if err != nil {
		return Session{}, "", err
	}
	if live == nil || live.FinishedAt != nil {
		return Session{}, "", ErrNotFound
	}
	if mine, err := s.TrainingNow(ctx, userID, userID); err != nil {
		return Session{}, "", err
	} else if mine != nil {
		return Session{}, "", ErrInWorkout
	}

	var friendTpl *string
	if err := s.Pool.QueryRow(ctx, `select template_id::text from sessions where id = $1::uuid`, live.ID).Scan(&friendTpl); err != nil {
		return Session{}, "", err
	}

	var myTpl *string
	if friendTpl != nil {
		var existing string
		err := s.Pool.QueryRow(ctx, `select id::text from templates where user_id = $1::uuid and copied_from_id = $2::uuid and archived_at is null
			order by created_at desc limit 1`, userID, *friendTpl).Scan(&existing)
		switch {
		case err == nil:
			myTpl = &existing
		case errors.Is(err, pgx.ErrNoRows):
			t, err := s.GetTemplate(ctx, friendID, *friendTpl)
			if err != nil {
				return Session{}, "", err
			}
			var id string
			err = s.tx(ctx, func(tx pgx.Tx) error {
				w, err := copyWorkout(ctx, tx, userID, snapshotTemplate(t), live.Person.Name)
				if err != nil {
					return err
				}
				if id, err = createTemplate(ctx, tx, userID, w.Name, w.Blocks); err != nil {
					return err
				}
				_, err = tx.Exec(ctx, `update templates set copied_from_id = $2::uuid, copied_from_user = $3::uuid where id = $1::uuid`,
					id, *friendTpl, friendID)
				return err
			})
			if err != nil {
				return Session{}, "", err
			}
			myTpl = &id
		default:
			return Session{}, "", err
		}
	}

	sess, err := s.StartSession(ctx, userID, d, myTpl)
	if err != nil {
		return Session{}, "", err
	}
	if _, err := s.Pool.Exec(ctx, `
		insert into session_partners (session_id, partner_session_id) values ($1::uuid, $2::uuid), ($2::uuid, $1::uuid)
		on conflict do nothing`, sess.ID, live.ID); err != nil {
		return Session{}, "", err
	}
	return sess, live.ID, nil
}

// SessionPartners returns the sessions trained together with one of the
// user's sessions. Partners always see each other's current exercise;
// weights only when that person shares workout details.
func (s *Store) SessionPartners(ctx context.Context, userID, sessionID string) ([]LiveSession, error) {
	var owner string
	if err := s.Pool.QueryRow(ctx, `select user_id::text from sessions where id = $1::uuid`, sessionID).Scan(&owner); err != nil {
		return nil, notFound(err)
	}
	if owner != userID {
		return nil, ErrNotFound
	}
	rows, err := s.Pool.Query(ctx, `
		select sp.partner_session_id::text, s.user_id::text from session_partners sp join sessions s on s.id = sp.partner_session_id
		where sp.session_id = $1::uuid order by sp.created_at`, sessionID)
	if err != nil {
		return nil, err
	}
	type ref struct{ id, user string }
	refs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (ref, error) {
		var x ref
		return x, r.Scan(&x.id, &x.user)
	})
	if err != nil {
		return nil, err
	}
	out := make([]LiveSession, 0, len(refs))
	for _, x := range refs {
		sh, err := s.GetSharing(ctx, x.user)
		if err != nil {
			return nil, err
		}
		l, err := s.liveSession(ctx, x.id, sh.WorkoutDetails)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, nil
}

// FriendMeal is something a friend logged, as their friends see it: what and
// when, never how much.
type FriendMeal struct {
	Person   Person    `json:"person"`
	EntryID  string    `json:"entry_id"`
	Name     string    `json:"name"`
	MealName string    `json:"meal_name"`
	Icon     *string   `json:"icon"`
	LoggedAt time.Time `json:"logged_at"`
}

// FriendMealsOn returns what the viewer's friends who share meals logged on
// their own date d (or, with personID set, just that friend), newest first.
func (s *Store) FriendMealsOn(ctx context.Context, viewer, personID string, d Date, limit int) ([]FriendMeal, error) {
	only := ""
	args := []any{viewer, d.Time, limit}
	if personID != "" {
		only = ` and e.user_id = $4::uuid`
		args = append(args, personID)
	}
	rows, err := s.Pool.Query(ctx, `
		select u.id::text, coalesce(p.display_name, u.name), u.avatar_url, e.id::text, e.name, e.meal_name, e.icon, e.logged_at
		from log_entries e
		join users u on u.id = e.user_id
		left join profiles p on p.user_id = u.id
		join sharing_settings sh on sh.user_id = e.user_id and sh.meals
		where e.user_id in (`+friendIDsSQL+`) and e.date = $2`+only+`
		order by e.logged_at desc limit $3`, args...)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (FriendMeal, error) {
		var m FriendMeal
		return m, r.Scan(&m.Person.ID, &m.Person.Name, &m.Person.AvatarURL, &m.EntryID, &m.Name, &m.MealName, &m.Icon, &m.LoggedAt)
	})
	if out == nil {
		out = []FriendMeal{}
	}
	return out, err
}

// ActivityOf returns personID's recent feed items the viewer may see.
func (s *Store) ActivityOf(ctx context.Context, viewer, personID string, limit int) ([]FeedItem, error) {
	rows, err := s.Pool.Query(ctx, feedSelect+` and a.user_id = $2::uuid order by a.created_at desc limit $3`, viewer, personID, limit)
	if err != nil {
		return nil, err
	}
	items, err := pgx.CollectRows(rows, scanFeed)
	if items == nil {
		items = []FeedItem{}
	}
	return items, err
}
