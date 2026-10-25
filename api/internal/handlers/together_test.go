package handlers_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// friends signs up two onboarded users who are friends.
func friends(t *testing.T, e *env) (user, user) {
	t.Helper()
	me, _ := e.signIn("bhavish@x.test", false, "")
	e.must(me, 201, "POST", "/v1/onboarding", onboarding("Bhavish"))
	link := e.must(me, 201, "POST", "/v1/invite-links", obj{})
	token := strings.TrimPrefix(get(link, "invite_link", "url").(string), "http://app.test/join/")
	ravi, _ := e.signIn("ravi@x.test", false, token)
	e.must(ravi, 201, "POST", "/v1/onboarding", onboarding("Ravi"))
	return me, ravi
}

func TestSharingDefaults(t *testing.T) {
	e := setup(t)
	me, ravi := friends(t, e)

	sh := e.must(me, 200, "GET", "/v1/sharing", nil)
	if get(sh, "sharing", "default_visibility") != "private" || get(sh, "sharing", "training_now") != true || get(sh, "sharing", "meals") != false {
		t.Fatalf("defaults: %v", sh)
	}
	e.must(me, 400, "PUT", "/v1/sharing", obj{"default_visibility": "everyone"})

	// A private meal, then sharing by default with apply_to_existing opens it up.
	meal := e.must(me, 201, "POST", "/v1/saved-meals", obj{"name": "Usual breakfast", "items": []obj{{"name": "Oats", "grams": 80, "kcal": 300}}})
	if get(meal, "saved_meal", "visibility") != "private" {
		t.Fatalf("new meal before defaults: %v", meal)
	}
	put := e.must(me, 200, "PUT", "/v1/sharing", obj{"default_visibility": "friends", "apply_to_existing": true, "meals": true})
	if get(put, "opened", "meals").(float64) != 1 || get(put, "sharing", "workouts") != true {
		t.Fatalf("apply to existing: %v", put)
	}
	// Left-out fields kept their values.
	if get(e.must(me, 200, "GET", "/v1/sharing", nil), "sharing", "records") != true {
		t.Fatal("records switched off by a PUT that didn't mention it")
	}
	// New items start as friends-only.
	next := e.must(me, 201, "POST", "/v1/saved-meals", obj{"name": "Protein shake", "items": []obj{{"name": "Whey", "grams": 30, "kcal": 120}}})
	if get(next, "saved_meal", "visibility") != "friends" {
		t.Fatalf("new meal after defaults: %v", next)
	}
	// Ravi's feed hears about it.
	found := false
	for _, it := range get(e.must(ravi, 200, "GET", "/v1/feed", nil), "items").([]any) {
		if get(it, "kind") == "shared_item" {
			found = true
		}
	}
	if !found {
		t.Fatal("no shared_item in the friend's feed")
	}

	// Meals today on Bhavish's profile, for Ravi.
	today := store.LocalToday(time.Now(), "Indian/Mauritius").String()
	slot := get(e.must(me, 200, "GET", "/v1/meal-slots", nil), "meal_slots", 0, "id").(string)
	e.must(me, 201, "POST", "/v1/days/"+today+"/entries", obj{"meal_slot_id": slot, "name": "Chicken briyani", "origin": "manual", "kcal": 780})
	pv := e.must(ravi, 200, "GET", "/v1/people/"+me.id, nil)
	if get(pv, "meals_today", 0, "name") != "Chicken briyani" {
		t.Fatalf("meals_today: %v", get(pv, "meals_today"))
	}
	if _, has := get(pv, "meals_today", 0).(map[string]any)["kcal"]; has {
		t.Fatal("friends see calories")
	}
}

func TestTrainTogether(t *testing.T) {
	e := setup(t)
	me, ravi := friends(t, e)
	lat := get(e.must(me, 200, "GET", "/v1/exercises?q=lat%20pulldown", nil), "exercises", 0, "id").(string)
	tpl := e.must(ravi, 201, "POST", "/v1/templates", obj{"name": "Pull day", "blocks": []obj{
		{"exercise_id": lat, "sets": []obj{{"target_kg": 50, "target_reps": 8}, {"target_kg": 50, "target_reps": 8}}},
	}})
	tplID := get(tpl, "template", "id").(string)

	// Nobody's training: nothing to join.
	e.must(me, 404, "POST", "/v1/people/"+ravi.id+"/join-workout", nil)

	s := e.must(ravi, 201, "POST", "/v1/sessions", obj{"template_id": tplID})
	sid := get(s, "session", "id").(string)
	pv := e.must(me, 200, "GET", "/v1/people/"+ravi.id, nil)
	if get(pv, "training", "template_name") != "Pull day" || get(pv, "training", "exercises_total").(float64) != 1 {
		t.Fatalf("training now: %v", get(pv, "training"))
	}
	inFeed := false
	for _, it := range get(e.must(me, 200, "GET", "/v1/feed", nil), "items").([]any) {
		if get(it, "kind") == "workout_started" {
			inFeed = true
		}
	}
	if !inFeed {
		t.Fatal("training now isn't in the feed")
	}

	// Ravi does a set; Bhavish joins and sees it, without weights (details off).
	set := get(e.must(ravi, 200, "GET", "/v1/sessions/"+sid, nil), "session", "blocks", 0, "sets", 0, "id").(string)
	e.must(ravi, 200, "PATCH", "/v1/sessions/"+sid+"/sets/"+set, obj{"actual_kg": 52.5, "actual_reps": 8, "done": true})
	joined := e.must(me, 201, "POST", "/v1/people/"+ravi.id+"/join-workout", nil)
	mine := get(joined, "session", "id").(string)
	if get(joined, "session", "template_name") != "Pull day" || len(get(joined, "session", "blocks").([]any)) != 1 {
		t.Fatalf("joined session: %v", joined)
	}
	e.must(me, 409, "POST", "/v1/people/"+ravi.id+"/join-workout", nil)
	parts := get(e.must(me, 200, "GET", "/v1/sessions/"+mine+"/partners", nil), "partners").([]any)
	if len(parts) != 1 || get(parts, 0, "sets_done").(float64) != 1 || get(parts, 0, "current") != "Lat pulldown" {
		t.Fatalf("partners: %v", parts)
	}
	if get(parts, 0, "last_set", "kg") != nil {
		t.Fatal("weights shown without workout details sharing")
	}
	// It works both ways, and only for the owner.
	if len(get(e.must(ravi, 200, "GET", "/v1/sessions/"+sid+"/partners", nil), "partners").([]any)) != 1 {
		t.Fatal("Ravi doesn't see Bhavish")
	}
	e.must(ravi, 404, "GET", "/v1/sessions/"+mine+"/partners", nil)

	// Finishing clears "training now".
	e.must(ravi, 200, "POST", "/v1/sessions/"+sid+"/finish", nil)
	if get(e.must(me, 200, "GET", "/v1/people/"+ravi.id, nil), "training") != nil {
		t.Fatal("still training after finishing")
	}
	for _, it := range get(e.must(me, 200, "GET", "/v1/feed", nil), "items").([]any) {
		if get(it, "kind") == "workout_started" && get(it, "actor", "name") == "Ravi" {
			t.Fatal("finished workout still shows as training now")
		}
	}

	// Switching training_now off hides it.
	e.must(ravi, 200, "PUT", "/v1/sharing", obj{"training_now": false})
	e.must(ravi, 201, "POST", "/v1/sessions", obj{"template_id": tplID})
	if get(e.must(me, 200, "GET", "/v1/people/"+ravi.id, nil), "training") != nil {
		t.Fatal("training shown with training_now off")
	}
}

// 20:30: a friend is on target today and you've still got plenty to eat.
func TestFriendDayNudge(t *testing.T) {
	e := setup(t)
	mru, _ := time.LoadLocation("Indian/Mauritius")
	clock := time.Date(2026, 10, 26, 20, 35, 0, 0, mru)
	e.h.Now = func() time.Time { return clock }
	me, _ := e.signIn("bhavish@x.test", false, "")
	e.must(me, 201, "POST", "/v1/onboarding", onboarding("Bhavish"))
	ravi := e.friends(me, "ravi@x.test", "Ravi")
	plan := get(e.must(ravi, 200, "GET", "/v1/goal", nil), "goal", "plan").(obj)
	e.must(ravi, 201, "POST", "/v1/days/2026-10-26/entries", obj{"meal_name": "Plate", "name": "Plan",
		"kcal": plan["target_kcal"], "protein_g": get(plan, "macros", "protein_g")})
	e.must(me, 201, "POST", "/v1/days/2026-10-26/entries", obj{"meal_name": "Plate", "name": "Toast", "kcal": 300})
	for _, u := range []user{me, ravi} {
		if err := e.st.SavePushSubscription(context.Background(), u.id, "https://push.test/"+u.id, "p256", "auth", ""); err != nil {
			t.Fatal(err)
		}
	}
	e.h.RemindOnce(context.Background())
	e.h.RemindOnce(context.Background())
	if e.sentCount(me, "friend_day") != 1 || e.sentCount(ravi, "friend_day") != 0 {
		t.Fatalf("friend day: me %d, ravi %d", e.sentCount(me, "friend_day"), e.sentCount(ravi, "friend_day"))
	}
}
