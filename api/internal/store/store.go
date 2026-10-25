// Package store is the data-access layer: hand-written SQL over a pgx pool,
// one file per subject, as in nex-dash-forecast.
package store

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store wraps a pgx pool.
type Store struct {
	Pool *pgxpool.Pool
}

// Errors handlers translate into HTTP statuses.
var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
	// ErrBadOrder: a new exercise order must list each of the workout's exercises once.
	ErrBadOrder = errors.New("send every exercise of the workout exactly once")
)

// New opens a pool and checks connectivity.
func New(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 10
	cfg.MaxConnIdleTime = 5 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{Pool: pool}, nil
}

// Close releases the pool.
func (s *Store) Close() { s.Pool.Close() }

// tx runs fn in a transaction, committing when it returns nil.
func (s *Store) tx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// notFound maps pgx.ErrNoRows to ErrNotFound.
func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// isUniqueViolation reports a unique constraint failure.
func isUniqueViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

// Date is a calendar day (no time zone) that marshals as YYYY-MM-DD.
type Date struct{ time.Time }

// ParseDate parses YYYY-MM-DD.
func ParseDate(s string) (Date, error) {
	t, err := time.Parse(time.DateOnly, s)
	return Date{t}, err
}

// DateOf returns the calendar day of t.
func DateOf(t time.Time) Date {
	return Date{time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)}
}

// String formats as YYYY-MM-DD.
func (d Date) String() string { return d.Format(time.DateOnly) }

// MarshalJSON writes "YYYY-MM-DD".
func (d Date) MarshalJSON() ([]byte, error) { return []byte(`"` + d.String() + `"`), nil }

// UnmarshalJSON reads "YYYY-MM-DD".
func (d *Date) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		return nil
	}
	if len(b) < 2 {
		return errors.New("invalid date")
	}
	t, err := time.Parse(time.DateOnly, string(b[1:len(b)-1]))
	if err != nil {
		return errors.New("dates must be YYYY-MM-DD")
	}
	d.Time = t
	return nil
}

// Weekday returns 0 for Monday … 6 for Sunday.
func (d Date) Weekday0() int { return (int(d.Weekday()) + 6) % 7 }

// Macros are energy and macronutrients.
type Macros struct {
	Kcal     float64 `json:"kcal"`
	ProteinG float64 `json:"protein_g"`
	CarbsG   float64 `json:"carbs_g"`
	FatG     float64 `json:"fat_g"`
}

// Add returns m + o.
func (m Macros) Add(o Macros) Macros {
	return Macros{m.Kcal + o.Kcal, m.ProteinG + o.ProteinG, m.CarbsG + o.CarbsG, m.FatG + o.FatG}
}

// Rounded rounds kcal to whole numbers and grams to one decimal.
func (m Macros) Rounded() Macros {
	r := func(v, step float64) float64 { return math.Round(v/step) * step }
	return Macros{r(m.Kcal, 1), r(m.ProteinG, 0.1), r(m.CarbsG, 0.1), r(m.FatG, 0.1)}
}

// LocalToday returns today's date in the IANA zone (UTC if unknown).
func LocalToday(now time.Time, tz string) Date {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	return DateOf(now.In(loc))
}

// MonthStart returns the first instant of now's month in tz, and the first
// day of the next month (when the allowance resets).
func MonthStart(now time.Time, tz string) (time.Time, Date) {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	l := now.In(loc)
	start := time.Date(l.Year(), l.Month(), 1, 0, 0, 0, 0, loc)
	return start, DateOf(start.AddDate(0, 1, 0))
}
