package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// PushSubscription is a browser push endpoint.
type PushSubscription struct {
	ID       string
	UserID   string
	Endpoint string
	P256dh   string
	Auth     string
}

// SavePushSubscription upserts by endpoint (a device re-subscribing moves to the
// current user).
func (s *Store) SavePushSubscription(ctx context.Context, userID, endpoint, p256dh, auth, ua string) error {
	_, err := s.Pool.Exec(ctx, `
		insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1::uuid, $2, $3, $4, nullif($5, ''))
		on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
		  user_agent = excluded.user_agent, failures = 0`, userID, endpoint, p256dh, auth, ua)
	return err
}

// DeletePushSubscription removes one of the user's endpoints.
func (s *Store) DeletePushSubscription(ctx context.Context, userID, endpoint string) error {
	_, err := s.Pool.Exec(ctx, `delete from push_subscriptions where user_id = $1::uuid and endpoint = $2`, userID, endpoint)
	return err
}

// PushSubscriptions returns every endpoint of the users.
func (s *Store) PushSubscriptions(ctx context.Context, userIDs []string) ([]PushSubscription, error) {
	rows, err := s.Pool.Query(ctx, `select id::text, user_id::text, endpoint, p256dh, auth from push_subscriptions where user_id = any($1::uuid[])`, userIDs)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (PushSubscription, error) {
		var p PushSubscription
		return p, r.Scan(&p.ID, &p.UserID, &p.Endpoint, &p.P256dh, &p.Auth)
	})
}

// PushResult records a delivery outcome; gone endpoints are deleted.
func (s *Store) PushResult(ctx context.Context, id string, ok, gone bool) error {
	switch {
	case gone:
		_, err := s.Pool.Exec(ctx, `delete from push_subscriptions where id = $1::uuid`, id)
		return err
	case ok:
		_, err := s.Pool.Exec(ctx, `update push_subscriptions set last_success_at = now(), failures = 0 where id = $1::uuid`, id)
		return err
	default:
		_, err := s.Pool.Exec(ctx, `update push_subscriptions set failures = failures + 1 where id = $1::uuid`, id)
		return err
	}
}

// NotificationPrefs are what a user wants to be pushed about.
type NotificationPrefs struct {
	FriendWorkouts bool    `json:"friend_workouts"`
	Cheers         bool    `json:"cheers"`
	MealNudges     bool    `json:"meal_nudges"`
	WorkoutDay     bool    `json:"workout_day"`
	WeighIn        bool    `json:"weigh_in"`
	WeeklyCheckin  bool    `json:"weekly_checkin"`
	StreakRisk     bool    `json:"streak_risk"`
	FriendGoals    bool    `json:"friend_goals"`
	QuietFrom      *string `json:"quiet_from"` // "22:00"
	QuietTo        *string `json:"quiet_to"`
}

// DefaultNotificationPrefs apply until the user changes anything.
var DefaultNotificationPrefs = NotificationPrefs{FriendWorkouts: true, Cheers: true, WorkoutDay: true, WeighIn: true, WeeklyCheckin: true,
	StreakRisk: true, FriendGoals: true}

// GetNotificationPrefs returns a user's preferences.
func (s *Store) GetNotificationPrefs(ctx context.Context, userID string) (NotificationPrefs, error) {
	p := DefaultNotificationPrefs
	err := s.Pool.QueryRow(ctx, `
		select friend_workouts, cheers, meal_nudges, workout_day, weigh_in, weekly_checkin, streak_risk, friend_goals,
		       to_char(quiet_from, 'HH24:MI'), to_char(quiet_to, 'HH24:MI')
		from notification_prefs where user_id = $1::uuid`, userID).
		Scan(&p.FriendWorkouts, &p.Cheers, &p.MealNudges, &p.WorkoutDay, &p.WeighIn, &p.WeeklyCheckin, &p.StreakRisk, &p.FriendGoals,
			&p.QuietFrom, &p.QuietTo)
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultNotificationPrefs, nil
	}
	return p, err
}

// PutNotificationPrefs saves preferences.
func (s *Store) PutNotificationPrefs(ctx context.Context, userID string, p NotificationPrefs) error {
	_, err := s.Pool.Exec(ctx, `
		insert into notification_prefs (user_id, friend_workouts, cheers, meal_nudges, workout_day, weigh_in, weekly_checkin,
		  streak_risk, friend_goals, quiet_from, quiet_to)
		values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::time, $11::time)
		on conflict (user_id) do update set friend_workouts = $2, cheers = $3, meal_nudges = $4, workout_day = $5,
		  weigh_in = $6, weekly_checkin = $7, streak_risk = $8, friend_goals = $9,
		  quiet_from = $10::time, quiet_to = $11::time, updated_at = now()`,
		userID, p.FriendWorkouts, p.Cheers, p.MealNudges, p.WorkoutDay, p.WeighIn, p.WeeklyCheckin,
		p.StreakRisk, p.FriendGoals, p.QuietFrom, p.QuietTo)
	return err
}

// WantsCheers reports whether a user wants pushes for cheers.
func (s *Store) WantsCheers(ctx context.Context, userID string) bool {
	p, err := s.GetNotificationPrefs(ctx, userID)
	return err == nil && p.Cheers
}
