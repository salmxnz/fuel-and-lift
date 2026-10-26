package handlers_test

import (
	"context"
	"crypto/rand"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// newUUID makes a random v4 uuid, as the PWA does for things made offline.
func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6], b[8] = b[6]&0x0f|0x40, b[8]&0x3f|0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func (e *env) count(sql string, args ...any) int {
	e.t.Helper()
	var n int
	if err := e.st.Pool.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func stamp(t *testing.T, v any) time.Time {
	t.Helper()
	s, _ := v.(string)
	at, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t.Fatalf("not a time: %v", v)
	}
	return at
}

// near fails unless got is within a few seconds of want.
func near(t *testing.T, what string, got, want time.Time) {
	t.Helper()
	if d := got.Sub(want); d < -5*time.Second || d > 5*time.Second {
		t.Fatalf("%s = %v, want about %v", what, got, want)
	}
}

func same(t *testing.T, what string, a, b any) {
	t.Helper()
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("%s differs on replay:\n%v\n%v", what, a, b)
	}
}

func TestOfflineSessions(t *testing.T) {
	e := setup(t)
	me, ravi := friends(t, e)
	today := store.LocalToday(time.Now(), "Indian/Mauritius").String()
	now := time.Now()
	lat := get(e.must(me, 200, "GET", "/v1/exercises?q=lat", nil), "exercises", 0, "id").(string)
	tm := get(e.must(me, 200, "GET", "/v1/exercises?q=treadmill", nil), "exercises", 0, "id").(string)
	tpl := e.must(me, 201, "POST", "/v1/templates", obj{"name": "Upper", "blocks": []obj{
		{"exercise_id": tm, "cardio": obj{"minutes": 5}},
		{"id": newUUID(), "exercise_id": lat, "sets": []obj{{"id": newUUID(), "target_kg": 50, "target_reps": 8}}},
	}})
	tplID := get(tpl, "template", "id").(string)
	e.must(me, 201, "POST", "/v1/gym/week-extras", obj{"template_id": tplID, "date": today, "blocks": []obj{{"exercise_id": lat}}})

	// Started offline with the client's own blocks: their ids are kept, the
	// template is still credited, and the week's extra is used up, not added.
	sid, b1, b2, s1, s2 := newUUID(), newUUID(), newUUID(), newUUID(), newUUID()
	body := obj{"id": sid, "date": today, "template_id": tplID, "started_at": now.Add(-2 * time.Hour).Format(time.RFC3339),
		"blocks": []obj{
			{"id": b1, "exercise_id": lat, "notes": "seat 4", "sets": []obj{
				{"id": s1, "warmup": true, "target_kg": 30, "target_reps": 10}, {"id": s2, "target_kg": 50, "target_reps": 8, "to_failure": true}}},
			{"id": b2, "exercise_id": tm, "cardio": obj{"minutes": 10}},
		}}
	first := e.must(me, 201, "POST", "/v1/sessions", body)
	s := get(first, "session").(obj)
	if s["id"] != sid || s["template_name"] != "Upper" || s["template_version"].(float64) != 1 ||
		len(s["blocks"].([]any)) != 2 || get(s, "blocks", 0, "id") != b1 || get(s, "blocks", 1, "id") != b2 ||
		get(s, "blocks", 0, "sets", 0, "id") != s1 || get(s, "blocks", 0, "sets", 1, "id") != s2 ||
		get(s, "blocks", 0, "sets", 1, "to_failure") != true || get(s, "blocks", 1, "cardio", "minutes").(float64) != 10 {
		t.Fatalf("explicit blocks: %v", s)
	}
	near(t, "started_at", stamp(t, s["started_at"]), now.Add(-2*time.Hour))
	if n := e.count(`select count(*) from week_extras where session_id is null`); n != 0 {
		t.Fatalf("%d week extras left pending", n)
	}

	// The replay changes nothing and answers 200 with the same session.
	again := e.must(me, 200, "POST", "/v1/sessions", body)
	same(t, "session", first["session"], again["session"])
	if n := e.count(`select count(*) from sessions where user_id = $1::uuid`, me.id); n != 1 {
		t.Fatalf("%d sessions after replay", n)
	}
	if n := e.count(`select count(*) from session_blocks where session_id = $1::uuid`, sid); n != 2 {
		t.Fatalf("%d blocks after replay", n)
	}
	// Someone else's id is not found; malformed or repeated ids are refused.
	e.must(ravi, 404, "POST", "/v1/sessions", obj{"id": sid})
	e.must(me, 400, "POST", "/v1/sessions", obj{"id": "nope"})
	e.must(me, 400, "POST", "/v1/sessions", obj{"blocks": []obj{{"id": "nope", "exercise_id": lat}}})
	dup := newUUID()
	e.must(me, 400, "POST", "/v1/sessions", obj{"blocks": []obj{{"id": dup, "exercise_id": lat, "sets": []obj{{"id": dup}}}}})
	e.must(me, 409, "POST", "/v1/sessions", obj{"blocks": []obj{{"id": b1, "exercise_id": lat}}}) // a block id already in use
	e.must(me, 400, "POST", "/v1/sessions", obj{"blocks": []obj{{"exercise_id": newUUID()}}})

	// started_at is kept within the last 24 hours.
	old := e.must(me, 201, "POST", "/v1/sessions", obj{"id": newUUID(), "started_at": now.Add(-72 * time.Hour).Format(time.RFC3339)})
	near(t, "old started_at", stamp(t, get(old, "session", "started_at")), now.Add(-24*time.Hour))
	future := e.must(me, 201, "POST", "/v1/sessions", obj{"started_at": now.Add(5 * time.Hour).Format(time.RFC3339)})
	near(t, "future started_at", stamp(t, get(future, "session", "started_at")), now)

	// Without blocks it's today's behaviour: the template's, then the week's extras.
	e.must(me, 201, "POST", "/v1/gym/week-extras", obj{"template_id": tplID, "date": today, "blocks": []obj{{"exercise_id": lat}}})
	plain := e.must(me, 201, "POST", "/v1/sessions", obj{"id": newUUID(), "date": today, "template_id": tplID})
	if n := len(get(plain, "session", "blocks").([]any)); n != 3 {
		t.Fatalf("template session has %d blocks, want 2 + 1 extra", n)
	}
	// Templates ignore client ids: their own block ids, no set ids.
	tb := get(e.must(me, 200, "GET", "/v1/templates/"+tplID, nil), "template", "blocks", 1).(obj)
	if _, has := get(tb, "sets", 0).(obj)["id"]; has || len(tb["id"].(string)) != 12 {
		t.Fatalf("template ids: %v", tb)
	}
	if _, has := get(plain, "session", "blocks", 2, "sets").([]any); !has {
		t.Fatal("extra has no sets list")
	}

	// Adding a block with an id twice adds it once.
	nb, ns := newUUID(), newUUID()
	add := obj{"id": nb, "exercise_id": lat, "sets": []obj{{"id": ns, "target_kg": 40, "target_reps": 10}}}
	a1 := e.must(me, 201, "POST", "/v1/sessions/"+sid+"/blocks", add)
	if get(a1, "session", "blocks", 2, "id") != nb || get(a1, "session", "blocks", 2, "sets", 0, "id") != ns {
		t.Fatalf("added block: %v", get(a1, "session", "blocks"))
	}
	a2 := e.must(me, 201, "POST", "/v1/sessions/"+sid+"/blocks", add)
	same(t, "session after block replay", a1["session"], a2["session"])
	if n := e.count(`select count(*) from session_blocks where session_id = $1::uuid`, sid); n != 3 {
		t.Fatalf("%d blocks after block replay", n)
	}
	otherSID := get(plain, "session", "id").(string)
	e.must(me, 404, "POST", "/v1/sessions/"+otherSID+"/blocks", add) // that block is in another session
	e.must(ravi, 404, "POST", "/v1/sessions/"+sid+"/blocks", add)
	e.must(me, 400, "POST", "/v1/sessions/"+sid+"/blocks", obj{"id": "nope", "exercise_id": lat})

	// Adding a set with an id twice adds it once.
	xs := newUUID()
	x1 := e.must(me, 201, "POST", "/v1/sessions/"+sid+"/blocks/"+b1+"/sets", obj{"id": xs, "target_kg": 50, "target_reps": 6})
	if get(x1, "session", "blocks", 0, "sets", 2, "id") != xs {
		t.Fatalf("added set: %v", get(x1, "session", "blocks", 0))
	}
	x2 := e.must(me, 201, "POST", "/v1/sessions/"+sid+"/blocks/"+b1+"/sets", obj{"id": xs, "target_kg": 50, "target_reps": 6})
	same(t, "session after set replay", x1["session"], x2["session"])
	if n := e.count(`select count(*) from session_sets where block_id = $1::uuid`, b1); n != 3 {
		t.Fatalf("%d sets after set replay", n)
	}
	e.must(me, 404, "POST", "/v1/sessions/"+sid+"/blocks/"+nb+"/sets", obj{"id": xs}) // that set is in another block
	e.must(ravi, 404, "POST", "/v1/sessions/"+sid+"/blocks/"+b1+"/sets", obj{"id": xs})
	e.must(me, 400, "POST", "/v1/sessions/"+sid+"/blocks/"+b1+"/sets", obj{"id": "nope"})

	// finished_at is kept within [started_at, now], and only the first finish counts.
	f := e.must(me, 200, "POST", "/v1/sessions/"+sid+"/finish", obj{"finished_at": now.Add(-time.Hour).Format(time.RFC3339)})
	near(t, "finished_at", stamp(t, get(f, "session", "finished_at")), now.Add(-time.Hour))
	f = e.must(me, 200, "POST", "/v1/sessions/"+sid+"/finish", obj{"finished_at": now.Add(-90 * time.Minute).Format(time.RFC3339)})
	near(t, "finished_at after a second finish", stamp(t, get(f, "session", "finished_at")), now.Add(-time.Hour))
	f = e.must(me, 200, "POST", "/v1/sessions/"+get(old, "session", "id").(string)+"/finish",
		obj{"finished_at": now.Add(-48 * time.Hour).Format(time.RFC3339)})
	if !stamp(t, get(f, "session", "finished_at")).Equal(stamp(t, get(old, "session", "started_at"))) {
		t.Fatalf("finished before it started: %v", get(f, "session"))
	}
	f = e.must(me, 200, "POST", "/v1/sessions/"+get(future, "session", "id").(string)+"/finish",
		obj{"finished_at": now.Add(3 * time.Hour).Format(time.RFC3339)})
	near(t, "future finished_at", stamp(t, get(f, "session", "finished_at")), now)
	f = e.must(me, 200, "POST", "/v1/sessions/"+otherSID+"/finish", obj{})
	near(t, "finished_at with {}", stamp(t, get(f, "session", "finished_at")), now)
}

func TestOfflineEntries(t *testing.T) {
	e := setup(t)
	me, ravi := friends(t, e)
	today := store.LocalToday(time.Now(), "Indian/Mauritius").String()
	now := time.Now()
	lunch := get(e.must(me, 200, "GET", "/v1/meal-slots", nil), "meal_slots", 1, "id").(string)

	// An entry logged offline: the replay answers 200 with the same entry
	// and day, and there's still one row.
	id := newUUID()
	body := obj{"id": id, "meal_slot_id": lunch, "name": "Rice and curry", "kcal": 600, "protein_g": 25,
		"logged_at": now.Add(-3 * time.Hour).Format(time.RFC3339)}
	first := e.must(me, 201, "POST", "/v1/days/"+today+"/entries", body)
	if get(first, "entry", "id") != id {
		t.Fatalf("entry id: %v", get(first, "entry"))
	}
	near(t, "logged_at", stamp(t, get(first, "entry", "logged_at")), now.Add(-3*time.Hour))
	again := e.must(me, 200, "POST", "/v1/days/"+today+"/entries", body)
	same(t, "entry", first["entry"], again["entry"])
	same(t, "day", first["day"], again["day"])
	if n := e.count(`select count(*) from log_entries where user_id = $1::uuid`, me.id); n != 1 {
		t.Fatalf("%d entries after replay", n)
	}
	e.must(ravi, 404, "POST", "/v1/days/"+today+"/entries", body)
	body["id"] = "nope"
	e.must(me, 400, "POST", "/v1/days/"+today+"/entries", body)

	// logged_at is kept within the last 7 days.
	old := e.must(me, 201, "POST", "/v1/days/"+today+"/entries", obj{"id": newUUID(), "meal_name": "Snack", "name": "Apple", "kcal": 80,
		"logged_at": now.Add(-10 * 24 * time.Hour).Format(time.RFC3339)})
	near(t, "old logged_at", stamp(t, get(old, "entry", "logged_at")), now.Add(-7*24*time.Hour))
	future := e.must(me, 201, "POST", "/v1/days/"+today+"/entries", obj{"meal_name": "Snack", "name": "Pear", "kcal": 60,
		"logged_at": now.Add(2 * time.Hour).Format(time.RFC3339)})
	near(t, "future logged_at", stamp(t, get(future, "entry", "logged_at")), now)

	// A saved meal logged offline, replayed even after the meal was removed.
	saved := e.must(me, 201, "POST", "/v1/saved-meals", obj{"name": "Oats", "items": []obj{{"name": "Oats", "kcal": 300, "protein_g": 10}}})
	mealID := get(saved, "saved_meal", "id").(string)
	sm := newUUID()
	smBody := obj{"id": sm, "meal_slot_id": lunch, "logged_at": now.Add(-time.Hour).Format(time.RFC3339)}
	l1 := e.must(me, 201, "POST", "/v1/days/"+today+"/saved-meals/"+mealID, smBody)
	if get(l1, "entry", "id") != sm || get(l1, "entry", "saved_meal_id") != mealID {
		t.Fatalf("logged saved meal: %v", get(l1, "entry"))
	}
	near(t, "saved meal logged_at", stamp(t, get(l1, "entry", "logged_at")), now.Add(-time.Hour))
	e.must(me, 204, "DELETE", "/v1/saved-meals/"+mealID, nil)
	l2 := e.must(me, 200, "POST", "/v1/days/"+today+"/saved-meals/"+mealID, smBody)
	same(t, "saved meal entry", l1["entry"], l2["entry"])
	same(t, "saved meal day", l1["day"], l2["day"])
	if n := e.count(`select count(*) from log_entries where id = $1::uuid`, sm); n != 1 {
		t.Fatalf("%d saved meal entries after replay", n)
	}
	e.must(me, 400, "POST", "/v1/days/"+today+"/saved-meals/"+mealID, obj{"id": "nope"})

	// Logging an entry again, offline.
	ag := newUUID()
	agBody := obj{"id": ag, "date": today, "logged_at": now.Add(-30 * time.Minute).Format(time.RFC3339)}
	g1 := e.must(me, 201, "POST", "/v1/entries/"+id+"/again", agBody)
	if get(g1, "entry", "id") != ag || get(g1, "entry", "name") != "Rice and curry" {
		t.Fatalf("again: %v", get(g1, "entry"))
	}
	near(t, "again logged_at", stamp(t, get(g1, "entry", "logged_at")), now.Add(-30*time.Minute))
	g2 := e.must(me, 200, "POST", "/v1/entries/"+id+"/again", agBody)
	same(t, "again entry", g1["entry"], g2["entry"])
	same(t, "again day", g1["day"], g2["day"])
	if n := e.count(`select count(*) from log_entries where id = $1::uuid`, ag); n != 1 {
		t.Fatalf("%d again entries after replay", n)
	}
	mine := get(e.must(ravi, 201, "POST", "/v1/days/"+today+"/entries", obj{"meal_name": "Snack", "name": "Banana", "kcal": 100}), "entry", "id").(string)
	e.must(ravi, 404, "POST", "/v1/entries/"+mine+"/again", obj{"id": ag})
	e.must(me, 400, "POST", "/v1/entries/"+id+"/again", obj{"id": "nope"})
}
