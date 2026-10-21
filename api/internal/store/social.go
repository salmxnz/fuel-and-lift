package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// InviteLinkTTL is how long a friend link stays valid.
const InviteLinkTTL = 14 * 24 * time.Hour

// --- invite links ------------------------------------------------------------

// InviteLink is a friend link as its creator sees it.
type InviteLink struct {
	ID               string     `json:"id"`
	URL              string     `json:"url,omitempty"` // set only right after creation
	Status           string     `json:"status"`        // open, accepted, revoked, expired
	AcceptedBy       *Person    `json:"accepted_by"`
	CountsAsReferral bool       `json:"counts_as_referral"`
	ExpiresAt        time.Time  `json:"expires_at"`
	CreatedAt        time.Time  `json:"created_at"`
	acceptedAt       *time.Time // internal
}

// Person is a small public view of a user.
type Person struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	AvatarURL *string `json:"avatar_url"`
}

type inviteLinkRow struct {
	ID         string
	CreatedBy  string
	ExpiresAt  time.Time
	RevokedAt  *time.Time
	AcceptedBy *string
}

func lockOpenLink(ctx context.Context, tx pgx.Tx, hash string) (inviteLinkRow, error) {
	var l inviteLinkRow
	err := tx.QueryRow(ctx, `
		select id::text, created_by::text, expires_at, revoked_at, accepted_by::text
		from invite_links where token_hash = $1 for update`, hash).
		Scan(&l.ID, &l.CreatedBy, &l.ExpiresAt, &l.RevokedAt, &l.AcceptedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return l, ErrInviteInvalid
	}
	if err != nil {
		return l, err
	}
	if l.RevokedAt != nil || l.AcceptedBy != nil || time.Now().After(l.ExpiresAt) {
		return l, ErrInviteInvalid
	}
	return l, nil
}

// acceptLink consumes a link for userID and makes them friends with its creator.
func acceptLink(ctx context.Context, tx pgx.Tx, hash, userID string, newUser bool) error {
	l, err := lockOpenLink(ctx, tx, hash)
	if err != nil {
		return err
	}
	if l.CreatedBy == userID {
		return ErrConflict
	}
	if _, err := tx.Exec(ctx, `update invite_links set accepted_by = $2::uuid, accepted_at = now(), new_user = $3 where id = $1::uuid`,
		l.ID, userID, newUser); err != nil {
		return err
	}
	return befriend(ctx, tx, l.CreatedBy, userID)
}

func befriend(ctx context.Context, tx pgx.Tx, a, b string) error {
	if a > b {
		a, b = b, a
	}
	if _, err := tx.Exec(ctx, `insert into friendships (user_a, user_b) values ($1::uuid, $2::uuid) on conflict do nothing`, a, b); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		insert into friend_settings (user_id, friend_id) values ($1::uuid, $2::uuid), ($2::uuid, $1::uuid)
		on conflict do nothing`, a, b)
	return err
}

// CreateInviteLink stores a new link and returns it with its status.
func (s *Store) CreateInviteLink(ctx context.Context, userID, tokenHash string) (InviteLink, error) {
	var l InviteLink
	err := s.Pool.QueryRow(ctx, `
		insert into invite_links (token_hash, created_by, expires_at) values ($1, $2::uuid, $3)
		returning id::text, expires_at, created_at`, tokenHash, userID, time.Now().Add(InviteLinkTTL)).
		Scan(&l.ID, &l.ExpiresAt, &l.CreatedAt)
	l.Status = "open"
	return l, err
}

// ListInviteLinks returns a user's links, newest first.
func (s *Store) ListInviteLinks(ctx context.Context, userID string) ([]InviteLink, error) {
	rows, err := s.Pool.Query(ctx, `
		select l.id::text, l.expires_at, l.created_at, l.revoked_at, l.accepted_at,
		       u.id::text, u.name, u.avatar_url, coalesce(l.new_user and u.referral_counted, false)
		from invite_links l left join users u on u.id = l.accepted_by
		where l.created_by = $1::uuid order by l.created_at desc limit 100`, userID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (InviteLink, error) {
		var l InviteLink
		var revoked *time.Time
		var aid, aname *string
		var avatar *string
		if err := r.Scan(&l.ID, &l.ExpiresAt, &l.CreatedAt, &revoked, &l.acceptedAt, &aid, &aname, &avatar, &l.CountsAsReferral); err != nil {
			return l, err
		}
		switch {
		case l.acceptedAt != nil:
			l.Status = "accepted"
			if aid != nil {
				l.AcceptedBy = &Person{ID: *aid, Name: deref(aname), AvatarURL: avatar}
			}
		case revoked != nil:
			l.Status = "revoked"
		case now.After(l.ExpiresAt):
			l.Status = "expired"
		default:
			l.Status = "open"
		}
		return l, nil
	})
}

// RevokeInviteLink revokes an open link the user owns.
func (s *Store) RevokeInviteLink(ctx context.Context, userID, id string) error {
	ct, err := s.Pool.Exec(ctx, `
		update invite_links set revoked_at = now()
		where id = $1::uuid and created_by = $2::uuid and accepted_at is null and revoked_at is null`, id, userID)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// InvitePreview is what the join page shows before sign-in.
type InvitePreview struct {
	Inviter Person `json:"inviter"`
	Valid   bool   `json:"valid"`
}

// PreviewInviteLink describes a link without consuming it.
func (s *Store) PreviewInviteLink(ctx context.Context, hash string) (InvitePreview, error) {
	var p InvitePreview
	var expires time.Time
	var revoked, accepted *time.Time
	err := s.Pool.QueryRow(ctx, `
		select u.id::text, u.name, u.avatar_url, l.expires_at, l.revoked_at, l.accepted_at
		from invite_links l join users u on u.id = l.created_by where l.token_hash = $1`, hash).
		Scan(&p.Inviter.ID, &p.Inviter.Name, &p.Inviter.AvatarURL, &expires, &revoked, &accepted)
	if err != nil {
		return p, notFound(err)
	}
	p.Valid = revoked == nil && accepted == nil && time.Now().Before(expires)
	return p, nil
}

// AcceptInviteLink is a signed-in user opening a friend link.
func (s *Store) AcceptInviteLink(ctx context.Context, hash, userID string) (Person, error) {
	var inviter Person
	err := s.tx(ctx, func(tx pgx.Tx) error {
		var creator string
		if err := tx.QueryRow(ctx, `select created_by::text from invite_links where token_hash = $1`, hash).Scan(&creator); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrInviteInvalid
			}
			return err
		}
		if err := acceptLink(ctx, tx, hash, userID, false); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `select id::text, name, avatar_url from users where id = $1::uuid`, creator).
			Scan(&inviter.ID, &inviter.Name, &inviter.AvatarURL)
	})
	return inviter, err
}

// creditReferral counts a new user towards their inviter once they finish
// onboarding, and upgrades the inviter to Pro forever at `needed` referrals.
// Returns the inviter's id when they were just upgraded.
func creditReferral(ctx context.Context, tx pgx.Tx, userID string, needed int) (upgraded string, err error) {
	var inviter *string
	err = tx.QueryRow(ctx, `
		update users set referral_counted = true
		where id = $1::uuid and invited_by is not null and not referral_counted
		returning invited_by::text`, userID).Scan(&inviter)
	if errors.Is(err, pgx.ErrNoRows) || inviter == nil {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	var count int
	if err := tx.QueryRow(ctx, `select count(*) from users where invited_by = $1::uuid and referral_counted`, *inviter).Scan(&count); err != nil {
		return "", err
	}
	if count < needed {
		return "", nil
	}
	ct, err := tx.Exec(ctx, `
		update users set plan = 'pro', pro_source = 'referrals', pro_until = null
		where id = $1::uuid and not (plan = 'pro' and pro_until is null)`, *inviter)
	if err != nil {
		return "", err
	}
	if ct.RowsAffected() > 0 {
		return *inviter, nil
	}
	return "", nil
}

// ReferralCount returns how many friends joined through the user's links.
func (s *Store) ReferralCount(ctx context.Context, userID string) (int, error) {
	var n int
	err := s.Pool.QueryRow(ctx, `select count(*) from users where invited_by = $1::uuid and referral_counted`, userID).Scan(&n)
	return n, err
}

// --- friends -----------------------------------------------------------------

// Friend is someone the user is friends with.
type Friend struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	AvatarURL      *string `json:"avatar_url"`
	Since          Date    `json:"since"`
	LastWorkoutOn  *Date   `json:"last_workout_on"`
	NotifyWorkouts bool    `json:"notify_workouts"`
}

// friendIDsSQL selects the ids of $1's friends.
const friendIDsSQL = `select case when user_a = $1::uuid then user_b else user_a end from friendships where user_a = $1::uuid or user_b = $1::uuid`

// ListFriends returns the user's friends, most recently active first.
func (s *Store) ListFriends(ctx context.Context, userID string) ([]Friend, error) {
	rows, err := s.Pool.Query(ctx, `
		with f as (
		  select case when user_a = $1::uuid then user_b else user_a end as id, created_at
		  from friendships where user_a = $1::uuid or user_b = $1::uuid
		)
		select u.id::text, coalesce(p.display_name, u.name), u.avatar_url, f.created_at,
		       case when sh.workouts then (select max(date) from sessions s where s.user_id = u.id and s.status = 'finished') end,
		       coalesce(fs.notify_workouts, true)
		from f join users u on u.id = f.id
		left join profiles p on p.user_id = u.id
		left join sharing_settings sh on sh.user_id = u.id
		left join friend_settings fs on fs.user_id = $1::uuid and fs.friend_id = u.id
		order by 5 desc nulls last, 2`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Friend, error) {
		var f Friend
		var since time.Time
		var last *time.Time
		if err := r.Scan(&f.ID, &f.Name, &f.AvatarURL, &since, &last, &f.NotifyWorkouts); err != nil {
			return f, err
		}
		f.Since = DateOf(since)
		if last != nil {
			d := DateOf(*last)
			f.LastWorkoutOn = &d
		}
		return f, nil
	})
}

// AreFriends reports whether a and b are friends.
func (s *Store) AreFriends(ctx context.Context, a, b string) (bool, error) {
	if a > b {
		a, b = b, a
	}
	var ok bool
	err := s.Pool.QueryRow(ctx, `select exists(select 1 from friendships where user_a = $1::uuid and user_b = $2::uuid)`, a, b).Scan(&ok)
	return ok, err
}

// RemoveFriend ends a friendship both ways.
func (s *Store) RemoveFriend(ctx context.Context, userID, friendID string) error {
	a, b := userID, friendID
	if a > b {
		a, b = b, a
	}
	return s.tx(ctx, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx, `delete from friendships where user_a = $1::uuid and user_b = $2::uuid`, a, b)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx, `delete from friend_settings where (user_id = $1::uuid and friend_id = $2::uuid) or (user_id = $2::uuid and friend_id = $1::uuid)`, a, b)
		return err
	})
}

// SetFriendNotify sets whether userID gets pushes about friendID's workouts.
func (s *Store) SetFriendNotify(ctx context.Context, userID, friendID string, notify bool) error {
	ok, err := s.AreFriends(ctx, userID, friendID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	_, err = s.Pool.Exec(ctx, `
		insert into friend_settings (user_id, friend_id, notify_workouts) values ($1::uuid, $2::uuid, $3)
		on conflict (user_id, friend_id) do update set notify_workouts = excluded.notify_workouts`, userID, friendID, notify)
	return err
}

// --- sharing -----------------------------------------------------------------

// Sharing is what a user's friends may see.
type Sharing struct {
	Workouts       bool `json:"workouts"`
	WorkoutDetails bool `json:"workout_details"`
	Records        bool `json:"records"`
	WeightTrend    bool `json:"weight_trend"`
	FoodStreaks    bool `json:"food_streaks"`
}

// DefaultSharing is used until the user changes anything.
var DefaultSharing = Sharing{Workouts: true, Records: true, FoodStreaks: true}

// GetSharing returns the user's sharing settings.
func (s *Store) GetSharing(ctx context.Context, userID string) (Sharing, error) {
	sh := DefaultSharing
	err := s.Pool.QueryRow(ctx, `select workouts, workout_details, records, weight_trend, food_streaks from sharing_settings where user_id = $1::uuid`, userID).
		Scan(&sh.Workouts, &sh.WorkoutDetails, &sh.Records, &sh.WeightTrend, &sh.FoodStreaks)
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultSharing, nil
	}
	return sh, err
}

// PutSharing saves sharing settings.
func (s *Store) PutSharing(ctx context.Context, userID string, sh Sharing) error {
	_, err := s.Pool.Exec(ctx, `
		insert into sharing_settings (user_id, workouts, workout_details, records, weight_trend, food_streaks)
		values ($1::uuid, $2, $3, $4, $5, $6)
		on conflict (user_id) do update set workouts = $2, workout_details = $3, records = $4,
		  weight_trend = $5, food_streaks = $6, updated_at = now()`,
		userID, sh.Workouts, sh.WorkoutDetails, sh.Records, sh.WeightTrend, sh.FoodStreaks)
	return err
}

// --- activity feed -----------------------------------------------------------

// FeedItem is one activity as a friend sees it.
type FeedItem struct {
	ID          string         `json:"id"`
	Actor       Person         `json:"actor"`
	Kind        string         `json:"kind"`
	Text        string         `json:"text"`
	Data        map[string]any `json:"data"`
	CreatedAt   time.Time      `json:"created_at"`
	Cheers      int            `json:"cheers"`
	CheeredByMe bool           `json:"cheered_by_me"`
}

// AddActivity records something a user did. Visibility is decided at read
// time from the actor's current sharing settings.
func (s *Store) AddActivity(ctx context.Context, userID, kind, text string, data map[string]any, sessionID *string) (string, error) {
	if data == nil {
		data = map[string]any{}
	}
	b, _ := json.Marshal(data)
	var id string
	err := s.Pool.QueryRow(ctx, `
		insert into activities (user_id, kind, text, data, session_id) values ($1::uuid, $2, $3, $4, $5::uuid)
		returning id::text`, userID, kind, text, b, sessionID).Scan(&id)
	return id, err
}

// feedSelect returns visible activity: the user's own plus friends', filtered
// by each actor's sharing switches.
const feedSelect = `
	select a.id::text, u.id::text, coalesce(p.display_name, u.name), u.avatar_url, a.kind, a.text, a.data, a.created_at,
	       (select count(*) from cheers c where c.activity_id = a.id),
	       exists(select 1 from cheers c where c.activity_id = a.id and c.user_id = $1::uuid)
	from activities a
	join users u on u.id = a.user_id
	left join profiles p on p.user_id = u.id
	left join sharing_settings sh on sh.user_id = a.user_id
	where (a.user_id = $1::uuid or a.user_id in (` + friendIDsSQL + `))
	  and (a.user_id = $1::uuid or case a.kind
	        when 'workout_finished' then coalesce(sh.workouts, true)
	        when 'record'           then coalesce(sh.records, true)
	        when 'weight_milestone' then coalesce(sh.weight_trend, false)
	        when 'streak'           then coalesce(sh.food_streaks, true)
	        else false end)`

func scanFeed(r pgx.CollectableRow) (FeedItem, error) {
	var f FeedItem
	var raw []byte
	if err := r.Scan(&f.ID, &f.Actor.ID, &f.Actor.Name, &f.Actor.AvatarURL, &f.Kind, &f.Text, &raw, &f.CreatedAt, &f.Cheers, &f.CheeredByMe); err != nil {
		return f, err
	}
	_ = json.Unmarshal(raw, &f.Data)
	if f.Data == nil {
		f.Data = map[string]any{}
	}
	return f, nil
}

// Feed returns up to 30 items older than before (zero = newest).
func (s *Store) Feed(ctx context.Context, userID string, before time.Time) ([]FeedItem, error) {
	if before.IsZero() {
		before = time.Now().Add(time.Hour)
	}
	rows, err := s.Pool.Query(ctx, feedSelect+` and a.created_at < $2 order by a.created_at desc limit 30`, userID, before)
	if err != nil {
		return nil, err
	}
	items, err := pgx.CollectRows(rows, scanFeed)
	if items == nil {
		items = []FeedItem{}
	}
	return items, err
}

// FeedItemFor returns one item if the user may see it.
func (s *Store) FeedItemFor(ctx context.Context, userID, id string) (FeedItem, error) {
	rows, err := s.Pool.Query(ctx, feedSelect+` and a.id = $2::uuid`, userID, id)
	if err != nil {
		return FeedItem{}, err
	}
	item, err := pgx.CollectExactlyOneRow(rows, scanFeed)
	return item, notFound(err)
}

// SetCheer adds or removes the user's cheer on an activity they can see.
// Returns the activity owner when a new cheer was added (to notify them).
func (s *Store) SetCheer(ctx context.Context, userID, activityID string, on bool) (FeedItem, string, error) {
	item, err := s.FeedItemFor(ctx, userID, activityID)
	if err != nil {
		return item, "", err
	}
	notify := ""
	if on {
		ct, err := s.Pool.Exec(ctx, `insert into cheers (activity_id, user_id) values ($1::uuid, $2::uuid) on conflict do nothing`, activityID, userID)
		if err != nil {
			return item, "", err
		}
		if ct.RowsAffected() > 0 && item.Actor.ID != userID {
			notify = item.Actor.ID
		}
	} else if _, err := s.Pool.Exec(ctx, `delete from cheers where activity_id = $1::uuid and user_id = $2::uuid`, activityID, userID); err != nil {
		return item, "", err
	}
	item, err = s.FeedItemFor(ctx, userID, activityID)
	return item, notify, err
}

// FriendsToNotifyOfWorkout returns friends who want pushes about userID's
// workouts (per-friend switch and their own friend_workouts preference).
func (s *Store) FriendsToNotifyOfWorkout(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.Pool.Query(ctx, `
		select f.id::text from (`+friendIDsSQL+`) as f(id)
		left join friend_settings fs on fs.user_id = f.id and fs.friend_id = $1::uuid
		left join notification_prefs np on np.user_id = f.id
		where coalesce(fs.notify_workouts, true) and coalesce(np.friend_workouts, true)`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
