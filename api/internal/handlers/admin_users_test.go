package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// refresh replays a refresh cookie the way the BFF does, returning the status
// and the error code.
func (e *env) refresh(raw string) (int, string) {
	e.t.Helper()
	req, _ := http.NewRequest("POST", e.srv.URL+"/v1/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: auth.RefreshCookie, Value: raw})
	req.AddCookie(&http.Cookie{Name: auth.CSRFCookie, Value: "csrf"})
	req.Header.Set("X-CSRF-Token", "csrf")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	var out struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out.Error.Code
}

func (e *env) refreshToken(userID, raw string) {
	e.t.Helper()
	if err := e.st.CreateRefreshToken(context.Background(), userID, auth.HashToken(raw), "", "", time.Now().Add(time.Hour)); err != nil {
		e.t.Fatal(err)
	}
}

func TestAdminUsers(t *testing.T) {
	e := setup(t)
	today := store.LocalToday(time.Now(), "Indian/Mauritius").String()

	admin, err := e.signIn("boss@x.test", true, "")
	if err != nil {
		t.Fatal(err)
	}
	ana, err := e.signIn("ana@x.test", false, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.signIn("ben@x.test", false, ""); err != nil {
		t.Fatal(err)
	}
	e.must(ana, 201, "POST", "/v1/onboarding", onboarding("Ana"))

	// Members can't see any of it.
	e.must(ana, 403, "GET", "/v1/admin/users", nil)
	e.must(ana, 403, "PUT", "/v1/admin/users/"+ana.id+"/pro", obj{"until": nil})

	// --- list and search -------------------------------------------------------------
	list := e.must(admin, 200, "GET", "/v1/admin/users", nil)
	if get(list, "total") != 3.0 || len(get(list, "users").([]any)) != 3 {
		t.Fatalf("everyone is listed: %v", list)
	}
	if get(list, "users", 0, "email") != "ben@x.test" {
		t.Fatalf("newest first: %v", get(list, "users", 0))
	}
	found := e.must(admin, 200, "GET", "/v1/admin/users?q=ANA", nil)
	if get(found, "total") != 1.0 || get(found, "users", 0, "display_name") != "Ana" || get(found, "users", 0, "onboarded") != true {
		t.Fatalf("search matches email, case-insensitively: %v", found)
	}
	if get(e.must(admin, 200, "GET", "/v1/admin/users?q=%25", nil), "total") != 0.0 {
		t.Fatal("a % in the search is a literal, not a wildcard")
	}
	if get(e.must(admin, 200, "GET", "/v1/admin/users?plan=pro", nil), "total") != 1.0 {
		t.Fatal("only the admin has Pro")
	}
	e.must(admin, 400, "GET", "/v1/admin/users?plan=gold", nil)
	e.must(admin, 400, "GET", "/v1/admin/users?limit=500", nil)
	e.must(admin, 404, "GET", "/v1/admin/users/00000000-0000-0000-0000-000000000000", nil)

	detail := e.must(admin, 200, "GET", "/v1/admin/users/"+ana.id, nil)
	if get(detail, "user", "is_pro") != false || get(detail, "billing", "plan") != "free" ||
		get(detail, "profile", "display_name") != "Ana" || get(detail, "goal", "mode") != "gain" {
		t.Fatalf("detail: %v", detail)
	}

	// --- Pro -------------------------------------------------------------------------
	e.must(admin, 400, "PUT", "/v1/admin/users/"+ana.id+"/pro", obj{"until": time.Now().Add(-time.Hour)})
	until := time.Now().Add(30 * 24 * time.Hour).UTC().Truncate(time.Second)
	u := e.must(admin, 200, "PUT", "/v1/admin/users/"+ana.id+"/pro", obj{"until": until})
	if get(u, "user", "is_pro") != true || get(u, "user", "pro_source") != "admin" {
		t.Fatalf("granted: %v", u)
	}
	b := e.must(ana, 200, "GET", "/v1/billing", nil)
	if get(b, "billing", "plan") != "pro" || get(b, "billing", "pro_source") != "admin" || get(b, "billing", "pro_until") == nil {
		t.Fatalf("Ana sees Pro from an admin: %v", b)
	}
	e.must(admin, 200, "DELETE", "/v1/admin/users/"+ana.id+"/pro", nil)
	if get(e.must(ana, 200, "GET", "/v1/billing", nil), "billing", "plan") != "free" {
		t.Fatal("revoked Pro is free again")
	}

	// --- role ------------------------------------------------------------------------
	e.must(admin, 400, "PUT", "/v1/admin/users/"+admin.id+"/role", obj{"role": "member"})
	e.must(admin, 400, "PUT", "/v1/admin/users/"+ana.id+"/role", obj{"role": "owner"})
	if get(e.must(admin, 200, "PUT", "/v1/admin/users/"+ana.id+"/role", obj{"role": "admin"}), "user", "role") != "admin" {
		t.Fatal("Ana is an admin")
	}
	if get(e.must(admin, 200, "GET", "/v1/admin/users?role=admin", nil), "total") != 2.0 {
		t.Fatal("two admins now")
	}
	e.must(admin, 200, "PUT", "/v1/admin/users/"+ana.id+"/role", obj{"role": "member"})

	// --- what they've made -----------------------------------------------------------
	e.must(ana, 201, "POST", "/v1/days/"+today+"/entries", obj{"meal_name": "Snack", "name": "Banana", "kcal": 105, "carbs_g": 27})
	e.must(ana, 201, "POST", "/v1/saved-meals", obj{"name": "Usual breakfast", "items": []obj{
		{"name": "Oats", "grams": 80, "kcal": 300, "protein_g": 10, "carbs_g": 54, "fat_g": 5},
	}})
	entries := e.must(admin, 200, "GET", "/v1/admin/users/"+ana.id+"/entries", nil)
	if len(get(entries, "entries").([]any)) != 1 || get(entries, "entries", 0, "name") != "Banana" {
		t.Fatalf("diary: %v", entries)
	}
	e.must(admin, 400, "GET", "/v1/admin/users/"+ana.id+"/entries?from=2025-01-01&to=2025-12-31", nil)
	meals := e.must(admin, 200, "GET", "/v1/admin/users/"+ana.id+"/saved-meals", nil)
	if len(get(meals, "saved_meals").([]any)) != 1 || get(meals, "saved_meals", 0, "visibility") != "private" {
		t.Fatalf("saved meals: %v", meals)
	}
	if n := len(get(e.must(admin, 200, "GET", "/v1/admin/users/"+ana.id+"/templates", nil), "templates").([]any)); n != 2 {
		t.Fatalf("Ana has the two starter templates, got %d", n)
	}
	e.must(admin, 200, "GET", "/v1/admin/users/"+ana.id+"/routines", nil)
	e.must(admin, 200, "GET", "/v1/admin/users/"+ana.id+"/sessions", nil)
	e.must(admin, 200, "GET", "/v1/admin/users/"+ana.id+"/friends", nil)
	counts := get(e.must(admin, 200, "GET", "/v1/admin/users/"+ana.id, nil), "user", "counts")
	if get(counts, "saved_meals") != 1.0 || get(counts, "templates") != 2.0 {
		t.Fatalf("counts: %v", counts)
	}

	// --- suspension ------------------------------------------------------------------
	e.must(admin, 400, "POST", "/v1/admin/users/"+admin.id+"/suspend", obj{})
	e.refreshToken(ana.id, "ana-refresh")
	s := e.must(admin, 200, "POST", "/v1/admin/users/"+ana.id+"/suspend", obj{"reason": "  spam  "})
	if get(s, "user", "suspended_at") == nil || get(s, "user", "suspended_reason") != "spam" {
		t.Fatalf("suspended: %v", s)
	}
	if status, _ := e.refresh("ana-refresh"); status != 401 {
		t.Fatalf("Ana's refresh token is revoked, got %d", status)
	}
	if _, err := e.signIn("ana@x.test", false, ""); !errors.Is(err, store.ErrSuspended) {
		t.Fatalf("Ana can't sign in: %v", err)
	}
	e.refreshToken(ana.id, "ana-late")
	if status, code := e.refresh("ana-late"); status != 401 || code != "suspended" {
		t.Fatalf("a token made after suspending doesn't refresh either: %d %q", status, code)
	}
	if get(e.must(admin, 200, "GET", "/v1/admin/users?status=suspended", nil), "total") != 1.0 {
		t.Fatal("one suspended user")
	}
	e.must(admin, 200, "DELETE", "/v1/admin/users/"+ana.id+"/suspend", nil)
	if _, err := e.signIn("ana@x.test", false, ""); err != nil {
		t.Fatalf("Ana can sign in again: %v", err)
	}
	e.refreshToken(ana.id, "ana-back")
	if status, _ := e.refresh("ana-back"); status != 200 {
		t.Fatalf("Ana refreshes again, got %d", status)
	}
}
