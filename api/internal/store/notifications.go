package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// The admin app's record of every push and email the server tried to send.

// NotificationRecord is one push to one user, or one email.
type NotificationRecord struct {
	Channel   string // push, email
	UserID    *string
	Recipient *string // email address
	Kind      string
	Title     string
	Body      *string
	URL       *string
	Status    string // sent, partial, failed, no_devices, quiet_hours, disabled
	Devices   int
	Delivered int
	Error     *string
}

// LogNotifications stores a batch of records.
func (s *Store) LogNotifications(ctx context.Context, recs []NotificationRecord) error {
	if len(recs) == 0 {
		return nil
	}
	rows := make([][]any, len(recs))
	for i, r := range recs {
		rows[i] = []any{r.Channel, r.UserID, r.Recipient, r.Kind, r.Title, r.Body, r.URL, r.Status, r.Devices, r.Delivered, r.Error}
	}
	_, err := s.Pool.CopyFrom(ctx, pgx.Identifier{"sent_notifications"},
		[]string{"channel", "user_id", "recipient", "kind", "title", "body", "url", "status", "devices", "delivered", "error"},
		pgx.CopyFromRows(rows))
	return err
}

// UserIDByEmail finds a user by email address (nil when there is none).
func (s *Store) UserIDByEmail(ctx context.Context, email string) (*string, error) {
	var id string
	err := s.Pool.QueryRow(ctx, `select id::text from users where email = $1`, email).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// SentNotification is a stored record as the admin app shows it.
type SentNotification struct {
	ID        int64     `json:"id"`
	Channel   string    `json:"channel"`
	User      *Person   `json:"user"`
	Recipient *string   `json:"recipient"`
	Kind      string    `json:"kind"`
	Title     string    `json:"title"`
	Body      *string   `json:"body"`
	URL       *string   `json:"url"`
	Status    string    `json:"status"`
	Devices   int       `json:"devices"`
	Delivered int       `json:"delivered"`
	Error     *string   `json:"error"`
	CreatedAt time.Time `json:"created_at"`
}

// NotificationFilter narrows the list. Empty fields match everything; Before
// is an id cursor (0 = newest).
type NotificationFilter struct {
	Channel, Status, Kind, UserID, Q string
	Before                           int64
	Limit                            int
}

// ListNotifications returns records newest first.
func (s *Store) ListNotifications(ctx context.Context, f NotificationFilter) ([]SentNotification, error) {
	rows, err := s.Pool.Query(ctx, `
		select n.id, n.channel, u.id::text, coalesce(p.display_name, u.name), u.avatar_url, n.recipient, n.kind, n.title,
		       n.body, n.url, n.status, n.devices, n.delivered, n.error, n.created_at
		from sent_notifications n
		left join users u on u.id = n.user_id
		left join profiles p on p.user_id = u.id
		where ($1 = '' or n.channel = $1)
		  and ($2 = '' or n.status = $2)
		  and ($3 = '' or n.kind = $3)
		  and ($4 = '' or n.user_id = nullif($4, '')::uuid)
		  and ($5 = '' or n.title ilike $5 or n.body ilike $5 or n.recipient ilike $5)
		  and ($6 = 0 or n.id < $6)
		order by n.id desc limit $7`,
		f.Channel, f.Status, f.Kind, f.UserID, likePattern(f.Q), f.Before, f.Limit)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (SentNotification, error) {
		var n SentNotification
		var uid, uname, uavatar *string
		err := r.Scan(&n.ID, &n.Channel, &uid, &uname, &uavatar, &n.Recipient, &n.Kind, &n.Title,
			&n.Body, &n.URL, &n.Status, &n.Devices, &n.Delivered, &n.Error, &n.CreatedAt)
		n.User = personOf(uid, uname, uavatar)
		return n, err
	})
	if list == nil {
		list = []SentNotification{}
	}
	return list, err
}

// personOf builds a Person from a left join (nil when there was no row).
func personOf(id, name, avatar *string) *Person {
	if id == nil {
		return nil
	}
	p := &Person{ID: *id, AvatarURL: avatar}
	if name != nil {
		p.Name = *name
	}
	return p
}

// NotificationStats counts records since a time by channel and status.
func (s *Store) NotificationStats(ctx context.Context, since time.Time) (map[string]map[string]int, error) {
	out := map[string]map[string]int{}
	for _, ch := range []string{"push", "email"} {
		out[ch] = map[string]int{}
		for _, st := range []string{"sent", "partial", "failed", "no_devices", "quiet_hours", "disabled"} {
			out[ch][st] = 0
		}
	}
	rows, err := s.Pool.Query(ctx, `
		select channel, status, count(*) from sent_notifications where created_at >= $1 group by 1, 2`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var ch, st string
		var n int
		if err := rows.Scan(&ch, &st, &n); err != nil {
			return nil, err
		}
		out[ch][st] = n
	}
	return out, rows.Err()
}

// PruneNotifications deletes records older than before, in batches.
func (s *Store) PruneNotifications(ctx context.Context, before time.Time) (int64, error) {
	return s.pruneBatches(ctx, `delete from sent_notifications where id in
		(select id from sent_notifications where created_at < $1 limit 10000)`, before)
}

func (s *Store) pruneBatches(ctx context.Context, sql string, before time.Time) (int64, error) {
	var total int64
	for {
		tag, err := s.Pool.Exec(ctx, sql, before)
		if err != nil {
			return total, err
		}
		total += tag.RowsAffected()
		if tag.RowsAffected() < 10000 {
			return total, nil
		}
	}
}
