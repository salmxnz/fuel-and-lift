package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// Feedback from Me → Feedback, with its screenshots in R2.

// FeedbackKinds and FeedbackStatuses are the allowed values.
var (
	FeedbackKinds    = map[string]bool{"bug": true, "idea": true, "other": true}
	FeedbackStatuses = map[string]bool{"new": true, "seen": true, "done": true}
)

// FeedbackPhoto is a screenshot; URL is a short-lived signed link.
type FeedbackPhoto struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	ObjectKey   string `json:"-"`
	ContentType string `json:"content_type"`
}

// Feedback is one message. User is set for admins only.
type Feedback struct {
	ID        int64           `json:"id"`
	User      *Person         `json:"user,omitempty"`
	Kind      string          `json:"kind"`
	Message   string          `json:"message"`
	Page      *string         `json:"page"`
	UserAgent *string         `json:"user_agent,omitempty"`
	Status    string          `json:"status"` // new | seen | done
	AdminNote *string         `json:"admin_note"`
	Photos    []FeedbackPhoto `json:"photos"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// NewFeedbackPhoto is a stored screenshot to attach.
type NewFeedbackPhoto struct {
	ObjectKey   string
	ContentType string
	Bytes       int
}

// AddFeedback saves a message and its screenshots.
func (s *Store) AddFeedback(ctx context.Context, userID string, f Feedback, photos []NewFeedbackPhoto) (int64, error) {
	var id int64
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `insert into feedback (user_id, kind, message, page, user_agent)
			values ($1::uuid, $2, $3, $4, $5) returning id`, userID, f.Kind, f.Message, f.Page, f.UserAgent).Scan(&id); err != nil {
			return err
		}
		for i, p := range photos {
			if _, err := tx.Exec(ctx, `insert into feedback_photos (feedback_id, position, object_key, content_type, bytes)
				values ($1, $2, $3, $4, $5)`, id, i, p.ObjectKey, p.ContentType, p.Bytes); err != nil {
				return err
			}
		}
		return nil
	})
	return id, err
}

// FeedbackFilter narrows the admin list.
type FeedbackFilter struct {
	UserID string // "" = everyone
	Status string // "" = any
	Kind   string // "" = any
	Before int64  // id cursor, 0 = newest
	Limit  int
}

// ListFeedback lists feedback newest first, with who sent it.
func (s *Store) ListFeedback(ctx context.Context, f FeedbackFilter) ([]Feedback, error) {
	rows, err := s.Pool.Query(ctx, `
		select f.id, u.id::text, coalesce(p.display_name, u.name), u.avatar_url, f.kind, f.message, f.page, f.user_agent,
		       f.status, f.admin_note, f.created_at, f.updated_at
		from feedback f join users u on u.id = f.user_id left join profiles p on p.user_id = u.id
		where ($1 = '' or f.user_id = nullif($1, '')::uuid)
		  and ($2 = '' or f.status = $2)
		  and ($3 = '' or f.kind = $3)
		  and ($4 = 0 or f.id < $4)
		order by f.id desc limit $5`, f.UserID, f.Status, f.Kind, f.Before, f.Limit)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Feedback, error) {
		var x Feedback
		var uid, uname, uavatar *string
		err := r.Scan(&x.ID, &uid, &uname, &uavatar, &x.Kind, &x.Message, &x.Page, &x.UserAgent,
			&x.Status, &x.AdminNote, &x.CreatedAt, &x.UpdatedAt)
		x.User = personOf(uid, uname, uavatar)
		x.Photos = []FeedbackPhoto{}
		return x, err
	})
	if err != nil {
		return nil, err
	}
	if list == nil {
		return []Feedback{}, nil
	}
	return list, s.feedbackPhotos(ctx, list)
}

func (s *Store) feedbackPhotos(ctx context.Context, list []Feedback) error {
	ids := make([]int64, len(list))
	at := map[int64]int{}
	for i, f := range list {
		ids[i] = f.ID
		at[f.ID] = i
	}
	rows, err := s.Pool.Query(ctx, `select feedback_id, id::text, object_key, content_type from feedback_photos
		where feedback_id = any($1) order by feedback_id, position`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var fid int64
		var p FeedbackPhoto
		if err := rows.Scan(&fid, &p.ID, &p.ObjectKey, &p.ContentType); err != nil {
			return err
		}
		list[at[fid]].Photos = append(list[at[fid]].Photos, p)
	}
	return rows.Err()
}

// GetFeedback returns one message; userID "" for an admin (anyone's).
func (s *Store) GetFeedback(ctx context.Context, userID string, id int64) (Feedback, error) {
	list, err := s.ListFeedback(ctx, FeedbackFilter{UserID: userID, Before: id + 1, Limit: 1})
	if err != nil {
		return Feedback{}, err
	}
	if len(list) == 0 || list[0].ID != id {
		return Feedback{}, ErrNotFound
	}
	return list[0], nil
}

// UpdateFeedback sets an admin's status and note (nil leaves either as is).
func (s *Store) UpdateFeedback(ctx context.Context, id int64, status, note *string) error {
	ct, err := s.Pool.Exec(ctx, `update feedback set status = coalesce($2, status),
		admin_note = case when $3::text is null then admin_note else nullif($3, '') end, updated_at = now()
		where id = $1`, id, status, note)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// FeedbackCounts is how much feedback is in each status.
func (s *Store) FeedbackCounts(ctx context.Context) (map[string]int, error) {
	out := map[string]int{"new": 0, "seen": 0, "done": 0}
	rows, err := s.Pool.Query(ctx, `select status, count(*)::int from feedback group by status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var st string
		var n int
		if err := rows.Scan(&st, &n); err != nil {
			return nil, err
		}
		out[st] = n
	}
	return out, rows.Err()
}

// AdminIDs lists the admins (to tell them about new feedback).
func (s *Store) AdminIDs(ctx context.Context) ([]string, error) {
	rows, err := s.Pool.Query(ctx, `select id::text from users where role = 'admin' and suspended_at is null`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
