# Fuel & Lift — notes for Claude

- `api/` is Go 1.24 with only stdlib `net/http`, pgx, golang-jwt, godotenv and
  x/crypto. Don't add frameworks or ORMs; SQL lives in `internal/store/*.go`.
- Migrations are embedded SQL in `api/internal/migrate/migrations`
  (`NNNNNN_name.up.sql`); never edit an applied one, add a new file.
- Handlers: validate input, call the store, write JSON via `httpx`. Map store
  errors with `h.storeError`. Error bodies are `{"error": {"message", "code"?}}`.
- `docs/api.md` is the contract the web app codes against: update it in the same
  change as any endpoint.
- DB tests reset the schema: run `go test -p 1 ./...` with `TEST_DATABASE_URL`.
- Pro rules: free = 10 photo estimates per month; Pro = unlimited; Pro comes
  from admin, 8 referrals (for the inviter only) or a future subscription.
  Never add a way to gift Pro.
