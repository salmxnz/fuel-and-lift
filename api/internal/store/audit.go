package store

import (
	"context"
	"net/netip"
	"time"

	"github.com/jackc/pgx/v5"
)

// The request audit log: one row per API request, metadata only.

// AuditRecord is one request as the middleware saw it.
type AuditRecord struct {
	At         time.Time
	UserID     string // "" when signed out
	Role       string
	Method     string
	Path       string
	Route      string
	Query      string
	Status     int
	DurationMs int
	IP         string
	UserAgent  string
	Error      string
}

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// InsertAudit stores a batch of records.
func (s *Store) InsertAudit(ctx context.Context, recs []AuditRecord) error {
	if len(recs) == 0 {
		return nil
	}
	rows := make([][]any, len(recs))
	for i, r := range recs {
		var ip *netip.Addr
		if a, err := netip.ParseAddr(r.IP); err == nil {
			ip = &a
		}
		rows[i] = []any{r.At, nullable(r.UserID), nullable(r.Role), r.Method, r.Path, nullable(r.Route), nullable(r.Query),
			r.Status, r.DurationMs, ip, nullable(r.UserAgent), nullable(r.Error)}
	}
	_, err := s.Pool.CopyFrom(ctx, pgx.Identifier{"audit_log"},
		[]string{"at", "user_id", "role", "method", "path", "route", "query", "status", "duration_ms", "ip", "user_agent", "error"},
		pgx.CopyFromRows(rows))
	return err
}

// AuditEntry is a stored request as the admin app shows it.
type AuditEntry struct {
	ID         int64     `json:"id"`
	At         time.Time `json:"at"`
	User       *Person   `json:"user"`
	Role       *string   `json:"role"`
	Method     string    `json:"method"`
	Path       string    `json:"path"`
	Route      *string   `json:"route"`
	Query      *string   `json:"query"`
	Status     int       `json:"status"`
	DurationMs int       `json:"duration_ms"`
	IP         *string   `json:"ip"`
	UserAgent  *string   `json:"user_agent"`
	Error      *string   `json:"error"`
}

// AuditFilter narrows the log. Status is a class ("4xx") or an exact code
// (404), 0/"" for all; Before is an id cursor (0 = newest).
type AuditFilter struct {
	UserID, Method, Q string
	StatusMin         int // inclusive
	StatusMax         int // inclusive; 0 = no status filter
	Before            int64
	Limit             int
}

// ListAudit returns requests newest first.
func (s *Store) ListAudit(ctx context.Context, f AuditFilter) ([]AuditEntry, error) {
	rows, err := s.Pool.Query(ctx, `
		select a.id, a.at, u.id::text, coalesce(p.display_name, u.name), u.avatar_url, a.role, a.method, a.path, a.route,
		       a.query, a.status, a.duration_ms, host(a.ip), a.user_agent, a.error
		from audit_log a
		left join users u on u.id = a.user_id
		left join profiles p on p.user_id = u.id
		where ($1 = '' or a.user_id = nullif($1, '')::uuid)
		  and ($2 = '' or a.method = $2)
		  and ($3 = '' or a.path ilike $3)
		  and ($4 = 0 or a.status between $4 and $5)
		  and ($6 = 0 or a.id < $6)
		order by a.id desc limit $7`,
		f.UserID, f.Method, likePattern(f.Q), f.StatusMin, f.StatusMax, f.Before, f.Limit)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (AuditEntry, error) {
		var a AuditEntry
		var uid, uname, uavatar *string
		err := r.Scan(&a.ID, &a.At, &uid, &uname, &uavatar, &a.Role, &a.Method, &a.Path, &a.Route,
			&a.Query, &a.Status, &a.DurationMs, &a.IP, &a.UserAgent, &a.Error)
		a.User = personOf(uid, uname, uavatar)
		return a, err
	})
	if list == nil {
		list = []AuditEntry{}
	}
	return list, err
}

// PruneAudit deletes requests older than before, in batches.
func (s *Store) PruneAudit(ctx context.Context, before time.Time) (int64, error) {
	return s.pruneBatches(ctx, `delete from audit_log where id in
		(select id from audit_log where at < $1 limit 10000)`, before)
}
