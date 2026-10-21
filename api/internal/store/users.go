package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// User is an account.
type User struct {
	ID        string     `json:"id"`
	Email     string     `json:"email"`
	Name      string     `json:"name"`
	AvatarURL *string    `json:"avatar_url"`
	Role      string     `json:"role"`
	Plan      string     `json:"-"`
	ProSource *string    `json:"-"`
	ProUntil  *time.Time `json:"-"`
	InvitedBy *string    `json:"-"`
}

const userCols = `id::text, email::text, name, avatar_url, role, plan, pro_source, pro_until, invited_by::text`

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.Role, &u.Plan, &u.ProSource, &u.ProUntil, &u.InvitedBy)
	return u, notFound(err)
}

// IsPro reports whether the user currently has Pro.
func (u User) IsPro(now time.Time) bool {
	return u.Plan == "pro" && (u.ProUntil == nil || u.ProUntil.After(now))
}

// GetUser loads a user by id.
func (s *Store) GetUser(ctx context.Context, id string) (User, error) {
	return scanUser(s.Pool.QueryRow(ctx, `select `+userCols+` from users where id = $1::uuid`, id))
}

// GoogleSignIn is what a sign-in knows about the person.
type GoogleSignIn struct {
	Subject   string
	Email     string
	Name      string
	AvatarURL string
	// MakeAdmin is set when the email is in ADMIN_EMAILS.
	MakeAdmin bool
	// InviteTokenHash, when set, is a friend link the person arrived with.
	InviteTokenHash string
}

// ErrInviteOnly is returned when a new person has no way in.
var ErrInviteOnly = errors.New("this app is invite-only")

// ErrInviteInvalid is returned for a friend link that is used, revoked or expired.
var ErrInviteInvalid = errors.New("this invite link has expired or was already used")

// SignInWithGoogle finds or creates the user for a verified Google identity.
// An existing user (matched by Google subject, else by email) always gets in.
// A new user needs ADMIN_EMAILS, an email invite, or a valid friend link. A
// friend link also makes the two people friends, for new and existing users.
func (s *Store) SignInWithGoogle(ctx context.Context, in GoogleSignIn) (User, bool, error) {
	var user User
	created := false
	err := s.tx(ctx, func(tx pgx.Tx) error {
		u, err := scanUser(tx.QueryRow(ctx,
			`select `+userCols+` from users where google_sub = $1 or email = $2 order by (google_sub = $1) desc limit 1`,
			in.Subject, in.Email))
		switch {
		case err == nil:
			// Existing account: refresh profile fields from Google.
			role := u.Role
			if in.MakeAdmin {
				role = "admin"
			}
			u, err = scanUser(tx.QueryRow(ctx, `
				update users set google_sub = $2, email = $3, avatar_url = nullif($4, ''),
				       name = case when name = '' then $5 else name end,
				       role = $6, last_login_at = now(),
				       pro_source = case when $6 = 'admin' and plan <> 'pro' then 'admin' else pro_source end,
				       plan = case when $6 = 'admin' then 'pro' else plan end
				where id = $1::uuid returning `+userCols,
				u.ID, in.Subject, in.Email, in.AvatarURL, in.Name, role))
			if err != nil {
				return err
			}
		case errors.Is(err, ErrNotFound):
			var link *inviteLinkRow
			if in.InviteTokenHash != "" {
				l, err := lockOpenLink(ctx, tx, in.InviteTokenHash)
				if err != nil {
					return err
				}
				link = &l
			}
			var emailInvite bool
			if !in.MakeAdmin && link == nil {
				err := tx.QueryRow(ctx, `select true from email_invites where email = $1 and accepted_at is null`, in.Email).Scan(&emailInvite)
				if err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return err
				}
				if !emailInvite {
					return ErrInviteOnly
				}
			}
			role, plan := "member", "free"
			var proSource *string
			if in.MakeAdmin {
				role, plan = "admin", "pro"
				src := "admin"
				proSource = &src
			}
			var invitedBy *string
			if link != nil {
				invitedBy = &link.CreatedBy
			}
			u, err = scanUser(tx.QueryRow(ctx, `
				insert into users (google_sub, email, name, avatar_url, role, plan, pro_source, invited_by, last_login_at)
				values ($1, $2, $3, nullif($4, ''), $5, $6, $7, $8::uuid, now())
				returning `+userCols,
				in.Subject, in.Email, in.Name, in.AvatarURL, role, plan, proSource, invitedBy))
			if err != nil {
				return err
			}
			created = true
			if emailInvite {
				if _, err := tx.Exec(ctx, `update email_invites set accepted_at = now() where email = $1`, in.Email); err != nil {
					return err
				}
			}
		default:
			return err
		}
		user = u

		if in.InviteTokenHash != "" {
			if err := acceptLink(ctx, tx, in.InviteTokenHash, u.ID, created); err != nil {
				// An existing user with a stale link still signs in; only new
				// users depend on the link being valid (checked above).
				if !created && (errors.Is(err, ErrInviteInvalid) || errors.Is(err, ErrConflict)) {
					return nil
				}
				return err
			}
		}
		return nil
	})
	return user, created, err
}

// --- refresh tokens ---------------------------------------------------------

// CreateRefreshToken stores a hashed refresh token.
func (s *Store) CreateRefreshToken(ctx context.Context, userID, hash, userAgent, ip string, expires time.Time) error {
	var ipv any
	if ip != "" {
		ipv = ip
	}
	_, err := s.Pool.Exec(ctx, `
		insert into refresh_tokens (user_id, token_hash, user_agent, ip, expires_at)
		values ($1::uuid, $2, nullif($3, ''), $4::inet, $5)`, userID, hash, userAgent, ipv, expires)
	return err
}

// ConsumeRefreshToken revokes a live token and returns its user, in one
// statement so a token can only ever be used once.
func (s *Store) ConsumeRefreshToken(ctx context.Context, hash string) (string, error) {
	var userID string
	err := s.Pool.QueryRow(ctx, `
		update refresh_tokens set revoked_at = now()
		where token_hash = $1 and revoked_at is null and expires_at > now()
		returning user_id::text`, hash).Scan(&userID)
	return userID, notFound(err)
}

// RevokeRefreshToken revokes by hash (logout). Idempotent.
func (s *Store) RevokeRefreshToken(ctx context.Context, hash string) error {
	_, err := s.Pool.Exec(ctx, `update refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null`, hash)
	return err
}

// --- email invites (admin) -------------------------------------------------

// EmailInvite is a pre-approved email.
type EmailInvite struct {
	ID         string     `json:"id"`
	Email      string     `json:"email"`
	CreatedAt  time.Time  `json:"created_at"`
	AcceptedAt *time.Time `json:"accepted_at"`
}

// ListEmailInvites returns every email invite, newest first.
func (s *Store) ListEmailInvites(ctx context.Context) ([]EmailInvite, error) {
	rows, err := s.Pool.Query(ctx, `select id::text, email::text, created_at, accepted_at from email_invites order by created_at desc`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (EmailInvite, error) {
		var i EmailInvite
		return i, r.Scan(&i.ID, &i.Email, &i.CreatedAt, &i.AcceptedAt)
	})
}

// CreateEmailInvite pre-approves an email.
func (s *Store) CreateEmailInvite(ctx context.Context, email, by string) (EmailInvite, error) {
	var i EmailInvite
	err := s.Pool.QueryRow(ctx, `
		insert into email_invites (email, invited_by) values ($1, $2::uuid)
		on conflict (email) do update set email = excluded.email
		returning id::text, email::text, created_at, accepted_at`, email, by).
		Scan(&i.ID, &i.Email, &i.CreatedAt, &i.AcceptedAt)
	return i, err
}

// DeleteEmailInvite removes one.
func (s *Store) DeleteEmailInvite(ctx context.Context, id string) error {
	ct, err := s.Pool.Exec(ctx, `delete from email_invites where id = $1::uuid`, id)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}
