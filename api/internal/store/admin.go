package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// The admin app's view of users. Everything here runs behind RequireAdmin.

// AdminUser is a user with their plan, status and how much they've made.
type AdminUser struct {
	ID              string      `json:"id"`
	Email           string      `json:"email"`
	Name            string      `json:"name"`
	DisplayName     *string     `json:"display_name"` // nil before onboarding
	AvatarURL       *string     `json:"avatar_url"`
	Role            string      `json:"role"`
	Plan            string      `json:"plan"` // the stored plan; see IsPro for an expired pro_until
	ProSource       *string     `json:"pro_source"`
	ProUntil        *time.Time  `json:"pro_until"`
	IsPro           bool        `json:"is_pro"`
	AdminEmail      bool        `json:"admin_email"` // in ADMIN_EMAILS (filled in by the handler)
	Onboarded       bool        `json:"onboarded"`
	InvitedBy       *Person     `json:"invited_by"`
	CreatedAt       time.Time   `json:"created_at"`
	LastLoginAt     *time.Time  `json:"last_login_at"`
	SuspendedAt     *time.Time  `json:"suspended_at"`
	SuspendedReason *string     `json:"suspended_reason"`
	Counts          AdminCounts `json:"counts"`
}

// AdminCounts are a user's live (not archived) things.
type AdminCounts struct {
	SavedMeals       int `json:"saved_meals"`
	Templates        int `json:"templates"`
	Routines         int `json:"routines"`
	SessionsFinished int `json:"sessions_finished"`
	Friends          int `json:"friends"`
	Referrals        int `json:"referrals"`
}

// AdminUserFilter narrows the users list. Empty fields match everything.
type AdminUserFilter struct {
	Q      string // email, Google name or display name
	Plan   string // free, pro (current Pro, so an expired pro_until is free)
	Role   string // admin, member
	Status string // active, suspended
	Limit  int
	Offset int
}

const adminUserSelect = `
	select u.id::text, u.email::text, u.name, p.display_name, u.avatar_url, u.role, u.plan, u.pro_source, u.pro_until,
	       p.user_id is not null, inv.id::text, coalesce(ip.display_name, inv.name), inv.avatar_url,
	       u.created_at, u.last_login_at, u.suspended_at, u.suspended_reason,
	       (select count(*) from saved_meals m where m.user_id = u.id and m.archived_at is null),
	       (select count(*) from templates t where t.user_id = u.id and t.archived_at is null),
	       (select count(*) from routines r where r.user_id = u.id and r.archived_at is null),
	       (select count(*) from sessions s where s.user_id = u.id and s.status = 'finished'),
	       (select count(*) from friendships f where f.user_a = u.id or f.user_b = u.id),
	       (select count(*) from users x where x.invited_by = u.id and x.referral_counted)
	from users u
	left join profiles p on p.user_id = u.id
	left join users inv on inv.id = u.invited_by
	left join profiles ip on ip.user_id = inv.id`

func scanAdminUser(r pgx.CollectableRow) (AdminUser, error) {
	var u AdminUser
	var invID, invName, invAvatar *string
	c := &u.Counts
	err := r.Scan(&u.ID, &u.Email, &u.Name, &u.DisplayName, &u.AvatarURL, &u.Role, &u.Plan, &u.ProSource, &u.ProUntil,
		&u.Onboarded, &invID, &invName, &invAvatar,
		&u.CreatedAt, &u.LastLoginAt, &u.SuspendedAt, &u.SuspendedReason,
		&c.SavedMeals, &c.Templates, &c.Routines, &c.SessionsFinished, &c.Friends, &c.Referrals)
	if err != nil {
		return u, err
	}
	u.IsPro = User{Plan: u.Plan, ProUntil: u.ProUntil}.IsPro(time.Now())
	if invID != nil {
		u.InvitedBy = &Person{ID: *invID, AvatarURL: invAvatar}
		if invName != nil {
			u.InvitedBy.Name = *invName
		}
	}
	return u, nil
}

// ListUsers returns a page of users, newest first, and how many match in all.
func (s *Store) ListUsers(ctx context.Context, f AdminUserFilter) ([]AdminUser, int, error) {
	where := `
		where ($1 = '' or u.email ilike $1 or u.name ilike $1 or p.display_name ilike $1)
		  and ($2 = '' or ($2 = 'pro') = (u.plan = 'pro' and (u.pro_until is null or u.pro_until > now())))
		  and ($3 = '' or u.role = $3)
		  and ($4 = '' or ($4 = 'suspended') = (u.suspended_at is not null))`
	args := []any{likePattern(f.Q), f.Plan, f.Role, f.Status}

	var total int
	if err := s.Pool.QueryRow(ctx, `select count(*) from users u left join profiles p on p.user_id = u.id `+where, args...).
		Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := s.Pool.Query(ctx, adminUserSelect+where+` order by u.created_at desc, u.id limit $5 offset $6`,
		append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	list, err := pgx.CollectRows(rows, scanAdminUser)
	if list == nil {
		list = []AdminUser{}
	}
	return list, total, err
}

// GetAdminUser loads one user for the admin app.
func (s *Store) GetAdminUser(ctx context.Context, id string) (AdminUser, error) {
	rows, err := s.Pool.Query(ctx, adminUserSelect+` where u.id = $1::uuid`, id)
	if err != nil {
		return AdminUser{}, err
	}
	u, err := pgx.CollectExactlyOneRow(rows, scanAdminUser)
	return u, notFound(err)
}

// SetAdminPro gives a user Pro from an admin, forever (nil) or until a time.
func (s *Store) SetAdminPro(ctx context.Context, id string, until *time.Time) error {
	return s.updateUser(ctx, `plan = 'pro', pro_source = 'admin', pro_until = $2`, id, until)
}

// RevokePro puts a user back on the free plan.
func (s *Store) RevokePro(ctx context.Context, id string) error {
	return s.updateUser(ctx, `plan = 'free', pro_source = null, pro_until = null`, id)
}

// SetRole makes a user an admin or a member.
func (s *Store) SetRole(ctx context.Context, id, role string) error {
	return s.updateUser(ctx, `role = $2`, id, role)
}

func (s *Store) updateUser(ctx context.Context, set, id string, args ...any) error {
	tag, err := s.Pool.Exec(ctx, `update users set `+set+` where id = $1::uuid`, append([]any{id}, args...)...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetSuspended suspends a user (revoking every refresh token, so no device can
// refresh again) or lifts the suspension. Access tokens already out keep
// working until they expire.
func (s *Store) SetSuspended(ctx context.Context, id string, suspended bool, reason *string) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update users set suspended_at = case when $2 then coalesce(suspended_at, now()) end,
			       suspended_reason = case when $2 then $3::text end
			where id = $1::uuid`, id, suspended, reason)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		if !suspended {
			return nil
		}
		_, err = tx.Exec(ctx, `update refresh_tokens set revoked_at = now() where user_id = $1::uuid and revoked_at is null`, id)
		return err
	})
}

// ListEntries returns a user's food log in [from, to], newest day first and
// in logging order within a day.
func (s *Store) ListEntries(ctx context.Context, userID string, from, to Date) ([]Entry, error) {
	rows, err := s.Pool.Query(ctx, `select `+entryCols+` from log_entries
		where user_id = $1::uuid and date between $2 and $3 order by date desc, logged_at`, userID, from.Time, to.Time)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Entry, error) {
		e, err := scanEntry(r)
		e.Photos = []MealPhoto{}
		return e, err
	})
	if list == nil {
		list = []Entry{}
	}
	return list, err
}
