package migrate

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
)

// TestUp applies the migrations to a scratch schema twice: the second run must
// be a no-op. Needs TEST_DATABASE_URL; skipped otherwise.
func TestUp(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	if _, err := conn.Exec(ctx, `drop schema public cascade; create schema public`); err != nil {
		t.Fatal(err)
	}
	n, err := Up(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	if n == 0 {
		t.Fatal("expected migrations to apply")
	}
	n, err = Up(ctx, url)
	if err != nil || n != 0 {
		t.Fatalf("second run applied %d (err %v), want 0", n, err)
	}
	var count int
	if err := conn.QueryRow(ctx, `select count(*) from exercises where owner_id is null`).Scan(&count); err != nil || count < 40 {
		t.Fatalf("exercise library: %d rows, err %v", count, err)
	}
}
