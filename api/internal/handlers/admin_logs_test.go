package handlers_test

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/config"
	"github.com/salmxnz/fuel-and-lift/api/internal/email"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// auditFor flushes the audit buffer and lists requests matching query.
func (e *env) auditFor(admin user, query string) []any {
	e.t.Helper()
	e.h.Audit.Flush()
	return get(e.must(admin, 200, "GET", "/v1/admin/audit?"+query, nil), "entries").([]any)
}

// eventually polls the notifications log until want is true (pushes and
// emails are recorded off the request path).
func (e *env) eventually(admin user, query string, want func([]any) bool) []any {
	e.t.Helper()
	var list []any
	for i := 0; i < 50; i++ {
		list = get(e.must(admin, 200, "GET", "/v1/admin/notifications?"+query, nil), "notifications").([]any)
		if want(list) {
			return list
		}
		time.Sleep(20 * time.Millisecond)
	}
	e.t.Fatalf("notifications?%s never matched: %v", query, list)
	return nil
}

func TestAdminLogs(t *testing.T) {
	e := setup(t)
	admin, _ := e.signIn("boss@x.test", true, "")
	ana, _ := e.signIn("ana@x.test", false, "")

	e.must(ana, 403, "GET", "/v1/admin/audit", nil)
	e.must(ana, 403, "GET", "/v1/admin/notifications", nil)
	e.must(ana, 403, "GET", "/v1/admin/notifications/stats", nil)

	// --- the audit log ---------------------------------------------------------------
	e.must(ana, 200, "GET", "/v1/billing", nil)
	e.must(ana, 404, "GET", "/v1/templates/00000000-0000-4000-8000-000000000000", nil)
	e.must(user{}, 404, "GET", "/v1/invite-links/preview/secret-token-1234", nil)

	mine := e.auditFor(admin, "user_id="+ana.id)
	if len(mine) < 2 {
		t.Fatalf("Ana's two requests are logged: %v", mine)
	}
	notFound, billing := mine[0], mine[1]
	if get(billing, "route") != "GET /v1/billing" || get(billing, "status") != 200.0 || get(billing, "user", "id") != ana.id ||
		get(billing, "role") != "member" || get(billing, "error") != nil {
		t.Fatalf("billing request: %v", billing)
	}
	if get(notFound, "status") != 404.0 || get(notFound, "error") != "not found" || get(notFound, "route") != "GET /v1/templates/{id}" {
		t.Fatalf("a 404 keeps its message: %v", notFound)
	}

	errs := e.auditFor(admin, "status=4xx")
	for _, a := range errs {
		if s := get(a, "status").(float64); s < 400 || s > 499 {
			t.Fatalf("status=4xx returned %v", s)
		}
	}
	preview := e.auditFor(admin, "q=invite-links")
	if len(preview) != 1 || get(preview[0], "path") != "/v1/invite-links/preview/{token}" || get(preview[0], "user") != nil {
		t.Fatalf("the invite token stays out of the log: %v", preview)
	}
	if n := len(e.auditFor(admin, "status=404&method=GET")); n != 2 {
		t.Fatalf("two GET 404s, got %d", n)
	}
	if n := len(e.auditFor(admin, "q=/v1/admin/audit")); n != 0 {
		t.Fatalf("reading the log isn't logged, got %d", n)
	}
	e.must(admin, 400, "GET", "/v1/admin/audit?status=9xx", nil)
	e.must(admin, 400, "GET", "/v1/admin/audit?user_id=nope", nil)

	// Pages go back with the before cursor.
	e.h.Audit.Flush()
	first := e.must(admin, 200, "GET", "/v1/admin/audit?limit=2", nil)
	next := get(first, "next_before").(float64)
	second := e.must(admin, 200, "GET", fmt.Sprintf("/v1/admin/audit?limit=2&before=%.0f", next), nil)
	if a, b := get(first, "entries", 1, "id").(float64), get(second, "entries", 0, "id").(float64); b >= a {
		t.Fatalf("the second page is older: %v then %v", a, b)
	}

	// Old requests are pruned.
	ctx := context.Background()
	if err := e.st.InsertAudit(ctx, []store.AuditRecord{{At: time.Now().AddDate(0, 0, -40), Method: "GET", Path: "/old", Status: 200}}); err != nil {
		t.Fatal(err)
	}
	if n, err := e.st.PruneAudit(ctx, time.Now().AddDate(0, 0, -30)); err != nil || n != 1 {
		t.Fatalf("pruned %d, %v", n, err)
	}

	// --- notifications ---------------------------------------------------------------
	// Pushes without VAPID keys are recorded as disabled.
	meal := get(e.must(ana, 201, "POST", "/v1/saved-meals", obj{"name": "Oats", "visibility": "public", "items": []obj{
		{"name": "Oats", "grams": 80, "kcal": 300, "protein_g": 10, "carbs_g": 54, "fat_g": 5},
	}}), "saved_meal", "id").(string)
	e.must(admin, 200, "POST", "/v1/admin/shop/meal/"+meal+"/hide", nil)
	pushes := e.eventually(admin, "channel=push&user_id="+ana.id, func(l []any) bool { return len(l) == 1 })
	if get(pushes[0], "kind") != "shop_hidden" || get(pushes[0], "status") != "disabled" || get(pushes[0], "user", "id") != ana.id {
		t.Fatalf("the hide push: %v", pushes[0])
	}

	// Emails without SMTP too.
	mail := email.New(email.Config{AppURL: "http://app.test"}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	mail.Record = e.h.RecordEmail
	e.h.Mail = mail
	e.must(ana, 201, "POST", "/v1/onboarding", onboarding("Ana"))
	emails := e.eventually(admin, "channel=email", func(l []any) bool { return len(l) == 1 })
	if get(emails[0], "kind") != "welcome" || get(emails[0], "status") != "disabled" ||
		get(emails[0], "recipient") != "ana@x.test" || get(emails[0], "user", "id") != ana.id {
		t.Fatalf("the welcome email: %v", emails[0])
	}

	e.eventually(admin, "status=disabled", func(l []any) bool { return len(l) == 2 })
	if n := len(e.eventually(admin, "status=sent", func(l []any) bool { return true })); n != 0 {
		t.Fatalf("nothing was actually sent, got %d", n)
	}
	stats := e.must(admin, 200, "GET", "/v1/admin/notifications/stats", nil)
	if get(stats, "counts", "push", "disabled") != 1.0 || get(stats, "counts", "email", "disabled") != 1.0 {
		t.Fatalf("stats: %v", stats)
	}
	e.must(admin, 400, "GET", "/v1/admin/notifications?channel=sms", nil)

	// Retention runs from config.
	e.h.Cfg = config.Config{AuditRetentionDays: 30, NotificationRetentionDays: 90}
	e.h.CleanupOnce(ctx)
}
