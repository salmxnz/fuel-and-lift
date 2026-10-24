package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// Avatar is an uploaded profile photo.
type Avatar struct {
	MediaType string
	Data      []byte
	UpdatedAt time.Time
}

// SetAvatar stores the user's photo and points avatar_url at it. url gets a
// version suffix so browsers fetch the new one.
func (s *Store) SetAvatar(ctx context.Context, userID, mediaType string, data []byte, url string) (User, error) {
	var u User
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			insert into user_avatars (user_id, media_type, data) values ($1::uuid, $2, $3)
			on conflict (user_id) do update set media_type = excluded.media_type, data = excluded.data, updated_at = now()`,
			userID, mediaType, data); err != nil {
			return err
		}
		var err error
		u, err = scanUser(tx.QueryRow(ctx, `update users set avatar_url = $2 where id = $1::uuid returning `+userCols, userID, url))
		return err
	})
	return u, err
}

// DeleteAvatar removes the user's photo and goes back to the Google picture.
func (s *Store) DeleteAvatar(ctx context.Context, userID string) (User, error) {
	var u User
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `delete from user_avatars where user_id = $1::uuid`, userID); err != nil {
			return err
		}
		var err error
		u, err = scanUser(tx.QueryRow(ctx, `update users set avatar_url = google_avatar_url where id = $1::uuid returning `+userCols, userID))
		return err
	})
	return u, err
}

// GetAvatar returns a user's uploaded photo.
func (s *Store) GetAvatar(ctx context.Context, userID string) (Avatar, error) {
	var a Avatar
	err := s.Pool.QueryRow(ctx, `select media_type, data, updated_at from user_avatars where user_id = $1::uuid`, userID).
		Scan(&a.MediaType, &a.Data, &a.UpdatedAt)
	return a, notFound(err)
}
