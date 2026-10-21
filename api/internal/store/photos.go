package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// MealPhoto is a stored meal photo. URL is filled in by the handler (a
// short-lived signed link), never stored.
type MealPhoto struct {
	ID          string    `json:"id"`
	EntryID     *string   `json:"-"`
	Position    int       `json:"position"`
	ObjectKey   string    `json:"-"`
	ContentType string    `json:"-"`
	Bytes       int       `json:"bytes"`
	CreatedAt   time.Time `json:"created_at"`
	URL         string    `json:"url"`
	// Entry is set when listing photos: the meal it belongs to.
	Entry *PhotoEntry `json:"entry,omitempty"`
}

// PhotoEntry is the meal a photo belongs to.
type PhotoEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Date Date   `json:"date"`
}

const photoCols = `p.id::text, p.entry_id::text, p.position, p.object_key, p.content_type, p.bytes, p.created_at`

func scanPhoto(r pgx.CollectableRow) (MealPhoto, error) {
	var p MealPhoto
	return p, r.Scan(&p.ID, &p.EntryID, &p.Position, &p.ObjectKey, &p.ContentType, &p.Bytes, &p.CreatedAt)
}

// AddPendingPhoto records an uploaded photo for an estimate, not yet logged.
func (s *Store) AddPendingPhoto(ctx context.Context, userID, estimateID, key, contentType string, position, bytes int) error {
	_, err := s.Pool.Exec(ctx, `
		insert into meal_photos (user_id, estimate_id, position, object_key, content_type, bytes)
		values ($1::uuid, $2::uuid, $3, $4, $5, $6)`, userID, estimateID, position, key, contentType, bytes)
	return err
}

// StoredPhotoCount is how many photos the user keeps (attached to meals).
func (s *Store) StoredPhotoCount(ctx context.Context, userID string) (int, error) {
	var n int
	err := s.Pool.QueryRow(ctx, `select count(*) from meal_photos where user_id = $1::uuid and entry_id is not null`, userID).Scan(&n)
	return n, err
}

// AttachPhotos moves the pending photos of an estimate (or any estimate it
// refined) onto a logged entry, in order, while the user is under limit
// (nil = no limit). Photos that don't fit are deleted; their object keys are
// returned so the caller can remove them from storage.
func (s *Store) AttachPhotos(ctx context.Context, userID, estimateID, entryID string, limit *int) (attached int, dropped []string, err error) {
	err = s.tx(ctx, func(tx pgx.Tx) error {
		// One attach at a time per user, so two quick logs can't both squeeze in.
		if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtext('meal_photos:' || $1))`, userID); err != nil {
			return err
		}
		var stored int
		if err := tx.QueryRow(ctx, `select count(*) from meal_photos where user_id = $1::uuid and entry_id is not null`, userID).Scan(&stored); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			with recursive chain(id) as (
			  select id from ai_estimates where id = $2::uuid and user_id = $1::uuid
			  union
			  select e.previous_id from ai_estimates e join chain c on e.id = c.id where e.previous_id is not null
			)
			select `+photoCols+` from meal_photos p
			where p.user_id = $1::uuid and p.entry_id is null and p.estimate_id in (select id from chain)
			order by p.created_at, p.position`, userID, estimateID)
		if err != nil {
			return err
		}
		pending, err := pgx.CollectRows(rows, scanPhoto)
		if err != nil {
			return err
		}
		for _, p := range pending {
			if limit == nil || stored < *limit {
				if _, err := tx.Exec(ctx, `update meal_photos set entry_id = $2::uuid where id = $1::uuid`, p.ID, entryID); err != nil {
					return err
				}
				stored++
				attached++
				continue
			}
			if _, err := tx.Exec(ctx, `delete from meal_photos where id = $1::uuid`, p.ID); err != nil {
				return err
			}
			dropped = append(dropped, p.ObjectKey)
		}
		return nil
	})
	return attached, dropped, err
}

// PhotosForEntries returns the photos of the given entries, by entry id.
func (s *Store) PhotosForEntries(ctx context.Context, userID string, entryIDs []string) (map[string][]MealPhoto, error) {
	out := map[string][]MealPhoto{}
	if len(entryIDs) == 0 {
		return out, nil
	}
	rows, err := s.Pool.Query(ctx, `select `+photoCols+` from meal_photos p
		where p.user_id = $1::uuid and p.entry_id = any($2::uuid[]) order by p.position, p.created_at`, userID, entryIDs)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, scanPhoto)
	for _, p := range list {
		out[*p.EntryID] = append(out[*p.EntryID], p)
	}
	return out, err
}

// ListPhotos returns the user's kept photos, newest first, before a time.
func (s *Store) ListPhotos(ctx context.Context, userID string, before *time.Time, limit int) ([]MealPhoto, error) {
	rows, err := s.Pool.Query(ctx, `select `+photoCols+`, e.id::text, e.name, e.date::text from meal_photos p
		join log_entries e on e.id = p.entry_id
		where p.user_id = $1::uuid and ($2::timestamptz is null or p.created_at < $2)
		order by p.created_at desc, p.position limit $3`, userID, before, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (MealPhoto, error) {
		var p MealPhoto
		var e PhotoEntry
		var d string
		if err := r.Scan(&p.ID, &p.EntryID, &p.Position, &p.ObjectKey, &p.ContentType, &p.Bytes, &p.CreatedAt, &e.ID, &e.Name, &d); err != nil {
			return p, err
		}
		e.Date, _ = ParseDate(d)
		p.Entry = &e
		return p, nil
	})
}

// DeletePhoto removes one of the user's photos and returns its object key.
func (s *Store) DeletePhoto(ctx context.Context, userID, id string) (string, error) {
	var key string
	err := s.Pool.QueryRow(ctx, `delete from meal_photos where id = $1::uuid and user_id = $2::uuid returning object_key`, id, userID).Scan(&key)
	return key, notFound(err)
}

// DeleteEntryPhotos removes the photos of an entry (before the entry goes) and
// returns their object keys.
func (s *Store) DeleteEntryPhotos(ctx context.Context, userID, entryID string) ([]string, error) {
	rows, err := s.Pool.Query(ctx, `delete from meal_photos where entry_id = $1::uuid and user_id = $2::uuid returning object_key`, entryID, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// TakeStalePendingPhotos deletes pending photos (never logged) older than
// `before`, up to limit, and returns their object keys.
func (s *Store) TakeStalePendingPhotos(ctx context.Context, before time.Time, limit int) ([]string, error) {
	rows, err := s.Pool.Query(ctx, `
		delete from meal_photos where id in (
		  select id from meal_photos where entry_id is null and created_at < $1 order by created_at limit $2
		) returning object_key`, before, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
