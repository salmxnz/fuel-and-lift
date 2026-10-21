// Package migrate applies the SQL migrations embedded in the binary.
//
// Files in ./migrations are named NNNNNN_name.up.sql and applied in order, each
// in its own transaction, under a Postgres advisory lock so two replicas
// starting at once cannot race. Applied versions are recorded in
// schema_migrations. Migrations are forward-only: fix a mistake with a new one.
package migrate

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

//go:embed migrations/*.sql
var files embed.FS

// lockKey is an arbitrary constant for pg_advisory_lock.
const lockKey = 724_001

type migration struct {
	version int
	name    string
	sql     string
}

func load() ([]migration, error) {
	entries, err := fs.ReadDir(files, "migrations")
	if err != nil {
		return nil, err
	}
	var out []migration
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".up.sql") {
			continue
		}
		num, _, ok := strings.Cut(name, "_")
		if !ok {
			return nil, fmt.Errorf("migration %s: name must be NNNNNN_name.up.sql", name)
		}
		v, err := strconv.Atoi(num)
		if err != nil {
			return nil, fmt.Errorf("migration %s: %w", name, err)
		}
		b, err := files.ReadFile("migrations/" + name)
		if err != nil {
			return nil, err
		}
		out = append(out, migration{version: v, name: name, sql: string(b)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].version < out[j].version })
	for i := 1; i < len(out); i++ {
		if out[i].version == out[i-1].version {
			return nil, fmt.Errorf("duplicate migration version %d", out[i].version)
		}
	}
	return out, nil
}

// Up applies every pending migration. It is safe to call on every start.
func Up(ctx context.Context, databaseURL string) (applied int, err error) {
	ms, err := load()
	if err != nil {
		return 0, err
	}
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return 0, fmt.Errorf("connect: %w", err)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, `select pg_advisory_lock($1)`, lockKey); err != nil {
		return 0, fmt.Errorf("lock: %w", err)
	}
	defer conn.Exec(context.Background(), `select pg_advisory_unlock($1)`, lockKey) //nolint:errcheck

	if _, err := conn.Exec(ctx, `create table if not exists schema_migrations (
		version int primary key,
		name text not null,
		applied_at timestamptz not null default now())`); err != nil {
		return 0, fmt.Errorf("schema_migrations: %w", err)
	}

	done := map[int]bool{}
	rows, err := conn.Query(ctx, `select version from schema_migrations`)
	if err != nil {
		return 0, err
	}
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return 0, err
		}
		done[v] = true
	}
	rows.Close()

	for _, m := range ms {
		if done[m.version] {
			continue
		}
		tx, err := conn.Begin(ctx)
		if err != nil {
			return applied, err
		}
		if _, err := tx.Exec(ctx, m.sql); err != nil {
			_ = tx.Rollback(ctx)
			return applied, fmt.Errorf("apply %s: %w", m.name, err)
		}
		if _, err := tx.Exec(ctx, `insert into schema_migrations (version, name) values ($1, $2)`, m.version, m.name); err != nil {
			_ = tx.Rollback(ctx)
			return applied, err
		}
		if err := tx.Commit(ctx); err != nil {
			return applied, err
		}
		applied++
	}
	return applied, nil
}
