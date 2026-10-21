package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/salmxnz/fuel-and-lift/api/internal/ai"
	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/config"
	"github.com/salmxnz/fuel-and-lift/api/internal/handlers"
	"github.com/salmxnz/fuel-and-lift/api/internal/migrate"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/server"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// These tests drive the real router against a scratch database. They reset
// the public schema, so packages must not run in parallel: `go test -p 1`.

const secret = "test-secret-test-secret-test-secret-123"

type fakeAI struct{ calls atomic.Int32 }

func (f *fakeAI) Name() string  { return "fake" }
func (f *fakeAI) Model() string { return "fake-1" }
func (f *fakeAI) Estimate(ctx context.Context, req ai.Request) (ai.Estimate, ai.Usage, error) {
	f.calls.Add(1)
	g := 250.0
	e := ai.Estimate{Title: "Fish curry with rice", Items: []ai.Item{
		{Name: "White rice", Grams: &g, Kcal: 325, ProteinG: 6, CarbsG: 71, FatG: 1, Assumption: "normal plate", Confidence: 0.7, Source: "ai"},
		{Name: "Fish curry", Kcal: 160, ProteinG: 16, CarbsG: 4, FatG: 8, Confidence: 0.6, Source: "ai"},
	}}
	if len(req.Answers) == 0 {
		e.Questions = []ai.Question{{ID: "rice_portion", Text: "How much rice?", Options: []ai.Option{{ID: "small", Label: "Small"}, {ID: "normal", Label: "Normal"}}}}
	}
	return e, ai.Usage{InputTokens: 100, OutputTokens: 50, CostUSD: 0.0001}, nil
}

type env struct {
	t   *testing.T
	srv *httptest.Server
	st  *store.Store
	ai  *fakeAI
}

func setup(t *testing.T) *env {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `drop schema public cascade; create schema public`); err != nil {
		t.Fatal(err)
	}
	conn.Close(ctx)
	if _, err := migrate.Up(ctx, url); err != nil {
		t.Fatal(err)
	}
	st, err := store.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	fake := &fakeAI{}
	var lookups atomic.Int32
	h := &handlers.Handler{
		Store: st,
		Cfg: config.Config{
			AppURL: "http://app.test", JWTSecret: secret, AccessTTL: time.Hour, RefreshTTLDays: 30,
			AIPerMinute: 100, AIPerDay: 100, FreePhotosMonthly: 10, ReferralsForPro: 8,
		},
		AI:       &ai.Gateway{Providers: []ai.Provider{fake}},
		Notifier: &push.Notifier{Store: st},
		Log:      slog.New(slog.NewTextHandler(io.Discard, nil)),
		FoodLookup: func(ctx context.Context, code string) (store.Food, error) {
			if lookups.Add(1) > 1 {
				return store.Food{}, fmt.Errorf("looked up twice, cache missed")
			}
			if code != "5000159484695" {
				return store.Food{}, store.ErrNotFound
			}
			s := 45.0
			return store.Food{Name: "Oat bar", Source: "openfoodfacts", Barcode: &code, ServingGrams: &s,
				Per100g: store.Macros{Kcal: 420, ProteinG: 8, CarbsG: 60, FatG: 15}}, nil
		},
	}
	srv := httptest.NewServer(server.NewRouter(h))
	t.Cleanup(func() { srv.Close(); st.Close() })
	return &env{t: t, srv: srv, st: st, ai: fake}
}

type user struct {
	id, token string
}

// signIn creates (or finds) a user the way Google sign-in would.
func (e *env) signIn(email string, admin bool, inviteToken string) (user, error) {
	in := store.GoogleSignIn{Subject: "sub-" + email, Email: email, Name: strings.Split(email, "@")[0], MakeAdmin: admin}
	if inviteToken != "" {
		in.InviteTokenHash = auth.HashToken(inviteToken)
	}
	u, _, err := e.st.SignInWithGoogle(context.Background(), in)
	if err != nil {
		return user{}, err
	}
	tok, err := auth.SignAccess(u.ID, u.Role, secret, time.Hour)
	if err != nil {
		e.t.Fatal(err)
	}
	return user{u.ID, tok}, nil
}

type obj = map[string]any

func (e *env) do(u user, method, path string, body any) (int, obj) {
	e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, e.srv.URL+path, rd)
	if u.token != "" {
		req.Header.Set("Authorization", "Bearer "+u.token)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	out := obj{}
	raw, _ := io.ReadAll(res.Body)
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			e.t.Fatalf("%s %s: bad json %q", method, path, raw)
		}
	}
	return res.StatusCode, out
}

// must runs a request and fails unless the status matches.
func (e *env) must(u user, want int, method, path string, body any) obj {
	e.t.Helper()
	got, out := e.do(u, method, path, body)
	if got != want {
		e.t.Fatalf("%s %s = %d, want %d: %v", method, path, got, want, out)
	}
	return out
}

func get(o any, path ...any) any {
	for _, p := range path {
		switch k := p.(type) {
		case string:
			o = o.(obj)[k]
		case int:
			o = o.([]any)[k]
		}
	}
	return o
}

func onboarding(name string) obj {
	return obj{
		"display_name": name, "sex": "male", "date_of_birth": "2002-03-10", "height_cm": 175, "weight_kg": 53,
		"activity_level": 3, "mode": "gain", "goal_weight_kg": 60, "pace": "standard", "timezone": "Indian/Mauritius",
	}
}

func TestAPI(t *testing.T) {
	e := setup(t)
	today := store.LocalToday(time.Now(), "Indian/Mauritius").String()

	// --- who gets in ---------------------------------------------------------------
	// Anyone can sign up: no link, no invite.
	stranger, err := e.signIn("stranger@x.test", false, "")
	if err != nil {
		t.Fatalf("stranger sign-in: %v", err)
	}
	if get(e.must(stranger, 200, "GET", "/v1/billing", nil), "billing", "plan") != "free" {
		t.Fatal("a stranger starts on the free plan")
	}
	me, err := e.signIn("bhavish@x.test", true, "")
	if err != nil {
		t.Fatal(err)
	}
	// An admin whose Pro had an old end date gets Pro back on sign-in.
	if _, err := e.st.Pool.Exec(context.Background(), `update users set pro_until = now() - interval '1 day' where id = $1::uuid`, me.id); err != nil {
		t.Fatal(err)
	}
	if me, err = e.signIn("bhavish@x.test", true, ""); err != nil {
		t.Fatal(err)
	}
	if u, _ := e.st.GetUser(context.Background(), me.id); !u.IsPro(time.Now()) {
		t.Fatal("admin should be Pro after sign-in")
	}
	e.must(user{}, 401, "GET", "/v1/auth/me", nil)
	if get(e.must(me, 200, "GET", "/v1/auth/me", nil), "onboarded") != false {
		t.Fatal("new user should not be onboarded")
	}

	// --- plan and onboarding -------------------------------------------------------
	prev := e.must(me, 200, "POST", "/v1/plan/preview", obj{"sex": "male", "date_of_birth": "2002-03-10", "height_cm": 175,
		"weight_kg": 53, "activity_level": 3, "mode": "gain", "goal_weight_kg": 60})
	if len(get(prev, "paces").(obj)) != 3 {
		t.Fatalf("expected 3 paces: %v", prev)
	}
	e.must(me, 400, "POST", "/v1/plan/preview", obj{"sex": "male", "date_of_birth": "2002-03-10", "height_cm": 175,
		"weight_kg": 53, "activity_level": 3, "mode": "lose", "goal_weight_kg": 45})
	ob := e.must(me, 201, "POST", "/v1/onboarding", onboarding("Bhavish"))
	target := get(ob, "goal", "plan", "target_kcal").(float64)
	if target < 2000 || target > 3500 {
		t.Fatalf("odd target %v", target)
	}
	e.must(me, 409, "POST", "/v1/onboarding", onboarding("Bhavish"))
	starters := get(e.must(me, 200, "GET", "/v1/templates", nil), "templates").([]any)
	if len(starters) != 2 || len(get(starters, 0, "blocks").([]any)) < 6 {
		t.Fatalf("starter templates: %v", starters)
	}

	// --- meals ---------------------------------------------------------------------
	slots := get(e.must(me, 200, "GET", "/v1/meal-slots", nil), "meal_slots").([]any)
	if len(slots) != 4 {
		t.Fatalf("want 4 default meals, got %d", len(slots))
	}
	pre := e.must(me, 201, "POST", "/v1/meal-slots", obj{"name": "Pre-workout", "schedule": "gym_days"})
	preID := get(pre, "meal_slot", "id").(string)
	ids := []string{preID}
	for _, s := range slots {
		ids = append(ids, get(s, "id").(string))
	}
	order := e.must(me, 200, "PUT", "/v1/meal-slots/order", obj{"ids": ids})
	if get(order, "meal_slots", 0, "name") != "Pre-workout" {
		t.Fatalf("reorder: %v", order)
	}
	e.must(me, 400, "PUT", "/v1/meal-slots/order", obj{"ids": ids[1:]})

	breakfast := ids[1]
	added := e.must(me, 201, "POST", "/v1/days/"+today+"/entries", obj{
		"meal_slot_id": breakfast, "name": "Fried eggs", "origin": "manual",
		"items": []obj{{"name": "Egg, fried", "grams": 138, "kcal": 270, "protein_g": 18, "carbs_g": 1, "fat_g": 21}},
	})
	if get(added, "day", "totals", "kcal").(float64) != 270 {
		t.Fatalf("day totals: %v", get(added, "day", "totals"))
	}
	entryID := get(added, "entry", "id").(string)
	upd := e.must(me, 200, "PATCH", "/v1/entries/"+entryID, obj{"items": []obj{
		{"name": "Egg, fried", "kcal": 270, "protein_g": 18, "carbs_g": 1, "fat_g": 21},
		{"name": "Cheddar", "kcal": 80, "protein_g": 5, "carbs_g": 0, "fat_g": 7},
	}})
	if get(upd, "day", "totals", "kcal").(float64) != 350 {
		t.Fatalf("after patch: %v", get(upd, "day", "totals"))
	}
	// A one-off meal just for today.
	oneOff := e.must(me, 201, "POST", "/v1/days/"+today+"/entries", obj{"meal_name": "Late snack", "name": "Banana", "kcal": 105, "carbs_g": 27})
	names := []string{}
	for _, m := range get(oneOff, "day", "meals").([]any) {
		names = append(names, get(m, "name").(string))
	}
	if !strings.Contains(strings.Join(names, ","), "Late snack") {
		t.Fatalf("one-off meal missing: %v", names)
	}
	e.must(me, 200, "DELETE", "/v1/entries/"+get(oneOff, "entry", "id").(string), nil)
	e.must(me, 400, "POST", "/v1/days/"+today+"/entries", obj{"name": "", "kcal": 1})

	// Saved meal with an add-on.
	saved := e.must(me, 201, "POST", "/v1/saved-meals", obj{"name": "3 fried eggs", "default_meal_slot_id": breakfast, "items": []obj{
		{"name": "Egg, fried ×3", "kcal": 270, "protein_g": 18, "carbs_g": 1, "fat_g": 21},
		{"name": "Cheese slice", "kcal": 80, "protein_g": 5, "fat_g": 7, "is_addon": true},
	}})
	savedID := get(saved, "saved_meal", "id").(string)
	addon := get(saved, "saved_meal", "items", 1, "id").(string)
	logged := e.must(me, 201, "POST", "/v1/days/"+today+"/saved-meals/"+savedID, obj{"addon_ids": []string{addon}})
	if get(logged, "entry", "kcal").(float64) != 350 {
		t.Fatalf("saved meal with cheese: %v", get(logged, "entry"))
	}
	plain := e.must(me, 201, "POST", "/v1/days/"+today+"/saved-meals/"+savedID, obj{})
	if get(plain, "entry", "kcal").(float64) != 270 {
		t.Fatalf("saved meal without cheese: %v", get(plain, "entry"))
	}

	// Barcode: looked up once, then served from the cache.
	b1 := e.must(me, 200, "GET", "/v1/foods/barcode/5000159484695", nil)
	b2 := e.must(me, 200, "GET", "/v1/foods/barcode/5000159484695", nil)
	if get(b1, "food", "id") != get(b2, "food", "id") {
		t.Fatal("barcode not cached")
	}
	e.must(me, 400, "GET", "/v1/foods/barcode/abc", nil)

	// --- invite links and friends ------------------------------------------------
	link := e.must(me, 201, "POST", "/v1/invite-links", obj{})
	url := get(link, "invite_link", "url").(string)
	token := strings.TrimPrefix(url, "http://app.test/join/")
	pv := e.must(user{}, 200, "GET", "/v1/invite-links/preview/"+token, nil)
	if get(pv, "valid") != true || get(pv, "inviter", "name") != "Bhavish" {
		t.Fatalf("preview: %v", pv)
	}
	e.must(user{}, 404, "GET", "/v1/invite-links/preview/nope-nope-nope-nope", nil)
	e.must(me, 409, "POST", "/v1/invite-links/accept", obj{"token": token})

	ravi, err := e.signIn("ravi@x.test", false, token)
	if err != nil {
		t.Fatal(err)
	}
	// A used link no longer blocks sign-up; it just doesn't add a friend.
	if _, err := e.signIn("other@x.test", false, token); err != nil {
		t.Fatalf("reused link: %v", err)
	}
	e.must(ravi, 201, "POST", "/v1/onboarding", onboarding("Ravi"))
	friends := get(e.must(me, 200, "GET", "/v1/friends", nil), "friends").([]any)
	if len(friends) != 1 || get(friends, 0, "name") != "Ravi" {
		t.Fatalf("friends: %v", friends)
	}
	links := e.must(me, 200, "GET", "/v1/invite-links", nil)
	if get(links, "invite_links", 0, "status") != "accepted" || get(links, "invite_links", 0, "counts_as_referral") != true ||
		get(links, "referrals", "joined").(float64) != 1 {
		t.Fatalf("links: %v", links)
	}

	// --- AI: free users get 10 photos a month, then the paywall -------------------
	img := obj{"media_type": "image/jpeg", "data": "aGVsbG8="}
	est := e.must(ravi, 200, "POST", "/v1/ai/meal-estimate", obj{"image": img, "text": "fish with rice"})
	if get(est, "totals", "kcal").(float64) != 485 || len(get(est, "questions").([]any)) != 1 {
		t.Fatalf("estimate: %v", est)
	}
	refined := e.must(ravi, 200, "POST", "/v1/ai/meal-estimate", obj{
		"previous_estimate_id": get(est, "estimate_id"), "answers": obj{"rice_portion": "normal"}})
	if len(get(refined, "questions").([]any)) != 0 || get(refined, "usage", "photos_this_month").(float64) != 1 {
		t.Fatalf("refined: %v", refined)
	}
	for i := 0; i < 9; i++ {
		e.must(ravi, 200, "POST", "/v1/ai/meal-estimate", obj{"image": img})
	}
	_, body := e.do(ravi, "POST", "/v1/ai/meal-estimate", obj{"image": img})
	if get(body, "error", "code") != "photo_limit" {
		t.Fatalf("11th photo: %v", body)
	}
	e.must(ravi, 402, "POST", "/v1/ai/meal-estimate", obj{"image": img})
	e.must(ravi, 200, "POST", "/v1/ai/meal-estimate", obj{"text": "2 rotis with dal"}) // text isn't capped
	e.must(me, 200, "POST", "/v1/ai/meal-estimate", obj{"image": img})                 // admin is Pro
	bill := e.must(ravi, 200, "GET", "/v1/billing", nil)
	if get(bill, "billing", "plan") != "free" || get(bill, "billing", "photo_estimates", "used_this_month").(float64) != 10 {
		t.Fatalf("billing: %v", bill)
	}
	e.must(ravi, 501, "POST", "/v1/billing/checkout", nil)

	// --- 8 referrals: Pro forever for the inviter --------------------------------
	for i := 0; i < 8; i++ {
		l := e.must(ravi, 201, "POST", "/v1/invite-links", obj{})
		tok := strings.TrimPrefix(get(l, "invite_link", "url").(string), "http://app.test/join/")
		f, err := e.signIn(fmt.Sprintf("friend%d@x.test", i), false, tok)
		if err != nil {
			t.Fatal(err)
		}
		if i < 7 {
			if get(e.must(ravi, 200, "GET", "/v1/billing", nil), "billing", "plan") != "free" {
				t.Fatal("pro before onboarding of the 8th friend")
			}
		}
		e.must(f, 201, "POST", "/v1/onboarding", onboarding(fmt.Sprintf("Friend %d", i)))
	}
	bill = e.must(ravi, 200, "GET", "/v1/billing", nil)
	if get(bill, "billing", "plan") != "pro" || get(bill, "billing", "pro_source") != "referrals" ||
		get(bill, "billing", "referrals", "joined").(float64) != 8 || get(bill, "billing", "photo_estimates", "limit_this_month") != nil {
		t.Fatalf("after 8 referrals: %v", bill)
	}
	e.must(ravi, 200, "POST", "/v1/ai/meal-estimate", obj{"image": img})

	// --- gym ---------------------------------------------------------------------
	exs := get(e.must(me, 200, "GET", "/v1/exercises?q=lat", nil), "exercises").([]any)
	if len(exs) == 0 {
		t.Fatal("no lat pulldown in the library")
	}
	lat := get(exs, 0, "id").(string)
	tm := get(e.must(me, 200, "GET", "/v1/exercises?q=treadmill", nil), "exercises", 0, "id").(string)
	tpl := e.must(me, 201, "POST", "/v1/templates", obj{"name": "Upper-1", "blocks": []obj{
		{"exercise_id": tm, "cardio": obj{"minutes": 5}},
		{"exercise_id": lat, "sets": []obj{{"warmup": true, "target_kg": 30, "target_reps": 10}, {"target_kg": 50, "target_reps": 8}, {"target_kg": 50, "target_reps": 8}}},
	}})
	tplID := get(tpl, "template", "id").(string)
	e.must(me, 200, "PUT", "/v1/weekly-plan", obj{"days": obj{"mon": tplID, "thu": tplID}})
	if get(e.must(me, 200, "GET", "/v1/weekly-plan", nil), "days", "thu") != tplID {
		t.Fatal("weekly plan not saved")
	}
	sess := e.must(me, 201, "POST", "/v1/sessions", obj{"date": today, "template_id": tplID})
	sid := get(sess, "session", "id").(string)
	treadBlock := get(sess, "session", "blocks", 0, "id").(string)
	latBlock := get(sess, "session", "blocks", 1)
	// Skip the treadmill today only.
	s := e.must(me, 200, "PATCH", "/v1/sessions/"+sid+"/blocks/"+treadBlock, obj{"skipped": true})
	if get(s, "session", "blocks", 0, "skipped") != true {
		t.Fatal("skip failed")
	}
	sets := get(latBlock, "sets").([]any)
	e.must(me, 200, "PATCH", "/v1/sessions/"+sid+"/sets/"+get(sets, 1, "id").(string), obj{"actual_kg": 55, "actual_reps": 8, "done": true})
	e.must(me, 200, "PATCH", "/v1/sessions/"+sid+"/sets/"+get(sets, 2, "id").(string), obj{"actual_kg": 55, "done": true})
	s = e.must(me, 200, "POST", "/v1/sessions/"+sid+"/accept-all", nil)
	if get(s, "session", "blocks", 1, "sets", 0, "done") != true {
		t.Fatal("accept-all didn't tick the warm-up")
	}
	fin := e.must(me, 200, "POST", "/v1/sessions/"+sid+"/finish", nil)
	props := get(fin, "proposals").([]any)
	if len(props) != 1 || get(props, 0, "to_kg").(float64) != 55 {
		t.Fatalf("proposals: %v", props)
	}
	e.must(me, 200, "POST", "/v1/sessions/"+sid+"/finish", nil) // twice is harmless
	applied := e.must(me, 200, "POST", "/v1/sessions/"+sid+"/apply", obj{"exercise_ids": []string{lat}})
	if get(applied, "template", "version").(float64) != 2 || get(applied, "template", "blocks", 1, "sets", 1, "target_kg").(float64) != 55 ||
		get(applied, "template", "blocks", 0, "cardio", "minutes").(float64) != 5 {
		t.Fatalf("applied: %v", applied)
	}
	if v := get(e.must(me, 200, "GET", "/v1/templates/"+tplID, nil), "versions").([]any); len(v) != 2 {
		t.Fatalf("versions: %v", v)
	}
	hist := e.must(me, 200, "GET", "/v1/progress/exercises/"+lat, nil)
	if len(get(hist, "points").([]any)) != 1 {
		t.Fatalf("history: %v", hist)
	}

	// --- feed, cheers, sharing ---------------------------------------------------
	feed := get(e.must(ravi, 200, "GET", "/v1/feed", nil), "items").([]any)
	var workout obj
	for _, it := range feed {
		if get(it, "kind") == "workout_finished" && get(it, "actor", "name") == "Bhavish" {
			workout = it.(obj)
		}
	}
	if workout == nil {
		t.Fatalf("Ravi can't see Bhavish's workout: %v", feed)
	}
	if !strings.HasPrefix(workout["text"].(string), "Upper-1 done: 1 exercise") {
		t.Fatalf("workout text %q", workout["text"])
	}
	n := 0
	for _, it := range feed {
		if get(it, "kind") == "workout_finished" && get(it, "actor", "name") == "Bhavish" {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("finishing twice made %d activities", n)
	}
	ch := e.must(ravi, 200, "POST", "/v1/feed/"+workout["id"].(string)+"/cheer", nil)
	if get(ch, "item", "cheers").(float64) != 1 || get(ch, "item", "cheered_by_me") != true {
		t.Fatalf("cheer: %v", ch)
	}
	e.must(ravi, 200, "DELETE", "/v1/feed/"+workout["id"].(string)+"/cheer", nil)
	outsider, _ := e.signIn("friend0@x.test", false, "")
	e.must(outsider, 404, "POST", "/v1/feed/"+workout["id"].(string)+"/cheer", nil)

	e.must(me, 200, "PUT", "/v1/sharing", obj{"workouts": false, "records": false})
	for _, it := range get(e.must(ravi, 200, "GET", "/v1/feed", nil), "items").([]any) {
		if get(it, "actor", "name") == "Bhavish" {
			t.Fatal("workout still visible after sharing was switched off")
		}
	}
	e.must(ravi, 200, "PATCH", "/v1/friends/"+me.id, obj{"notify_workouts": false})

	// --- weight and progress -----------------------------------------------------
	e.must(me, 400, "POST", "/v1/weigh-ins", obj{"weight_kg": 5})
	e.must(me, 400, "POST", "/v1/weigh-ins", obj{"weight_kg": 54, "date": "2999-01-01"})
	e.must(me, 201, "POST", "/v1/weigh-ins", obj{"weight_kg": 54.2})
	wp := e.must(me, 200, "GET", "/v1/progress/weight", nil)
	if len(get(wp, "weigh_ins").([]any)) != 1 || len(get(wp, "plan").([]any)) != 2 {
		t.Fatalf("weight progress: %v", wp)
	}
	cp := e.must(me, 200, "GET", "/v1/progress/calories", nil)
	if days := get(cp, "days").([]any); len(days) != 7 || get(days, 6, "logged") != true {
		t.Fatalf("calories progress: %v", cp)
	}

	// --- notifications ----------------------------------------------------------
	e.must(me, 400, "PUT", "/v1/notification-prefs", obj{"quiet_from": "22:00"})
	e.must(me, 200, "PUT", "/v1/notification-prefs", obj{"friend_workouts": true, "cheers": true, "quiet_from": "22:00", "quiet_to": "07:00"})
	e.must(me, 201, "POST", "/v1/push/subscriptions", obj{"endpoint": "https://push.example/abc", "keys": obj{"p256dh": "x", "auth": "y"}})
	e.must(me, 204, "DELETE", "/v1/push/subscriptions", obj{"endpoint": "https://push.example/abc"})
}
