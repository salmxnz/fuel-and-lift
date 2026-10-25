package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// MaxProgressPhotos is how many progress photos one person keeps.
const MaxProgressPhotos = 500

// ProgressPhoto is a photo of the user, for comparing over time. Only its
// owner ever sees it; URL is a short-lived signed link.
type ProgressPhoto struct {
	ID          string `json:"id"`
	TakenOn     Date   `json:"taken_on"`
	Pose        string `json:"pose"` // front | side | back | other
	URL         string `json:"url"`
	ObjectKey   string `json:"-"`
	ContentType string `json:"content_type"`
	// WeightKg is the user's latest weigh-in on or before that day.
	WeightKg  *float64  `json:"weight_kg"`
	CreatedAt time.Time `json:"created_at"`
}

// ProgressPoses are the allowed poses.
var ProgressPoses = map[string]bool{"front": true, "side": true, "back": true, "other": true}

const progressPhotoCols = `p.id::text, p.taken_on, p.pose, p.object_key, p.content_type, p.created_at,
	(select w.weight_kg::float8 from weigh_ins w where w.user_id = p.user_id and w.date <= p.taken_on order by w.date desc limit 1)`

func scanProgressPhoto(r pgx.CollectableRow) (ProgressPhoto, error) {
	var p ProgressPhoto
	var d time.Time
	err := r.Scan(&p.ID, &d, &p.Pose, &p.ObjectKey, &p.ContentType, &p.CreatedAt, &p.WeightKg)
	p.TakenOn = DateOf(d)
	return p, err
}

// ProgressPhotoCount is how many progress photos the user keeps.
func (s *Store) ProgressPhotoCount(ctx context.Context, userID string) (int, error) {
	var n int
	err := s.Pool.QueryRow(ctx, `select count(*) from progress_photos where user_id = $1::uuid`, userID).Scan(&n)
	return n, err
}

// AddProgressPhoto records an uploaded progress photo.
func (s *Store) AddProgressPhoto(ctx context.Context, userID string, takenOn Date, pose, key, contentType string, bytes int) (ProgressPhoto, error) {
	rows, err := s.Pool.Query(ctx, `
		with p as (insert into progress_photos (user_id, taken_on, pose, object_key, content_type, bytes)
			values ($1::uuid, $2, $3, $4, $5, $6) returning *)
		select `+progressPhotoCols+` from p`, userID, takenOn.Time, pose, key, contentType, bytes)
	if err != nil {
		return ProgressPhoto{}, err
	}
	return pgx.CollectExactlyOneRow(rows, scanProgressPhoto)
}

// ListProgressPhotos returns the user's progress photos, newest first.
func (s *Store) ListProgressPhotos(ctx context.Context, userID string) ([]ProgressPhoto, error) {
	rows, err := s.Pool.Query(ctx, `select `+progressPhotoCols+` from progress_photos p
		where p.user_id = $1::uuid order by p.taken_on desc, p.created_at desc limit $2`, userID, MaxProgressPhotos)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, scanProgressPhoto)
	if list == nil {
		list = []ProgressPhoto{}
	}
	return list, err
}

// DeleteProgressPhoto removes one of the user's progress photos and returns
// its object key.
func (s *Store) DeleteProgressPhoto(ctx context.Context, userID, id string) (string, error) {
	var key string
	err := s.Pool.QueryRow(ctx, `delete from progress_photos where id = $1::uuid and user_id = $2::uuid returning object_key`, id, userID).Scan(&key)
	return key, notFound(err)
}
