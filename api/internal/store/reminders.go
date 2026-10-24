package store

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// ReminderUser is an onboarded user the reminder loop looks at.
type ReminderUser struct {
	ID             string
	Name           string
	Timezone       string
	WeighInCadence string
	// HasPush is set when they have a device subscribed. Without one they get
	// no reminders themselves, but friends still hear when they hit a goal.
	HasPush bool
	Prefs   NotificationPrefs
}

// ReminderCandidates lists every active onboarded user, with their
// preferences (defaults filled in) and timezone.
func (s *Store) ReminderCandidates(ctx context.Context) ([]ReminderUser, error) {
	d := DefaultNotificationPrefs
	rows, err := s.Pool.Query(ctx, `
		select u.id::text, coalesce(p.display_name, u.name), p.timezone, p.weigh_in_cadence,
		       exists(select 1 from push_subscriptions ps where ps.user_id = u.id),
		       coalesce(np.meal_nudges, $1), coalesce(np.workout_day, $2), coalesce(np.weigh_in, $3),
		       coalesce(np.weekly_checkin, $4), coalesce(np.streak_risk, $5)
		from users u
		join profiles p on p.user_id = u.id and p.onboarded_at is not null
		left join notification_prefs np on np.user_id = u.id
		where u.suspended_at is null`,
		d.MealNudges, d.WorkoutDay, d.WeighIn, d.WeeklyCheckin, d.StreakRisk)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (ReminderUser, error) {
		var u ReminderUser
		err := r.Scan(&u.ID, &u.Name, &u.Timezone, &u.WeighInCadence, &u.HasPush,
			&u.Prefs.MealNudges, &u.Prefs.WorkoutDay, &u.Prefs.WeighIn, &u.Prefs.WeeklyCheckin, &u.Prefs.StreakRisk)
		if u.Timezone == "" {
			u.Timezone = "UTC"
		}
		return u, err
	})
}

// ClaimNotification records that a scheduled push (kind, ref) is going to
// userID. It's false when it was already sent, so each goes out once.
func (s *Store) ClaimNotification(ctx context.Context, userID, kind, ref string) (bool, error) {
	ct, err := s.Pool.Exec(ctx, `
		insert into notification_log (user_id, kind, ref) values ($1::uuid, $2, $3) on conflict do nothing`, userID, kind, ref)
	if err != nil {
		return false, err
	}
	return ct.RowsAffected() == 1, nil
}

// SlotLogged reports whether anything was logged in a meal on a day.
func (s *Store) SlotLogged(ctx context.Context, userID, slotID string, d Date) (bool, error) {
	var ok bool
	err := s.Pool.QueryRow(ctx, `
		select exists(select 1 from log_entries where user_id = $1::uuid and meal_slot_id = $2::uuid and date = $3)`,
		userID, slotID, d.Time).Scan(&ok)
	return ok, err
}

// WeighedIn reports whether the user weighed in on a day.
func (s *Store) WeighedIn(ctx context.Context, userID string, d Date) (bool, error) {
	var ok bool
	err := s.Pool.QueryRow(ctx, `select exists(select 1 from weigh_ins where user_id = $1::uuid and date = $2)`, userID, d.Time).Scan(&ok)
	return ok, err
}

// PlannedWorkout reports whether the weekly plan has a workout on d's weekday
// and whether one has been finished that day.
func (s *Store) PlannedWorkout(ctx context.Context, userID string, d Date) (planned, done bool, err error) {
	err = s.Pool.QueryRow(ctx, `
		select exists(select 1 from weekly_plan where user_id = $1::uuid and weekday = $2),
		       exists(select 1 from sessions where user_id = $1::uuid and date = $3 and status = 'finished')`,
		userID, d.Weekday0(), d.Time).Scan(&planned, &done)
	return planned, done, err
}

// FriendsToNotifyOfGoals returns friends who want a push when userID hits
// their weekly goal.
func (s *Store) FriendsToNotifyOfGoals(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.Pool.Query(ctx, `
		select f.id::text from (`+friendIDsSQL+`) as f(id)
		left join notification_prefs np on np.user_id = f.id
		where coalesce(np.friend_goals, true)`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
