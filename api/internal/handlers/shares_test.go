package handlers_test

import (
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

func TestShares(t *testing.T) {
	e := setup(t)
	today := store.LocalToday(time.Now(), "Indian/Mauritius").String()

	me, _ := e.signIn("bhavish@x.test", false, "")
	e.must(me, 201, "POST", "/v1/onboarding", onboarding("Bhavish"))
	link := e.must(me, 201, "POST", "/v1/invite-links", obj{})
	token := strings.TrimPrefix(get(link, "invite_link", "url").(string), "http://app.test/join/")
	ravi, _ := e.signIn("ravi@x.test", false, token)
	e.must(ravi, 201, "POST", "/v1/onboarding", onboarding("Ravi"))
	stranger, _ := e.signIn("stranger@x.test", false, "")
	e.must(stranger, 201, "POST", "/v1/onboarding", onboarding("Stranger"))

	mySlot := get(e.must(me, 200, "GET", "/v1/meal-slots", nil), "meal_slots", 2, "id").(string)
	raviSlot := get(e.must(ravi, 200, "GET", "/v1/meal-slots", nil), "meal_slots", 2, "id").(string)

	// --- split a meal ------------------------------------------------------------
	pizza := e.must(me, 201, "POST", "/v1/days/"+today+"/entries", obj{
		"meal_slot_id": mySlot, "name": "Pizza", "origin": "manual",
		"items": []obj{{"name": "Pizza", "grams": 600, "kcal": 1500, "protein_g": 60, "carbs_g": 180, "fat_g": 60}},
	})
	pizzaID := get(pizza, "entry", "id").(string)

	e.must(me, 403, "POST", "/v1/entries/"+pizzaID+"/share", obj{"friend_ids": []string{stranger.id}, "split": true})
	e.must(me, 400, "POST", "/v1/entries/"+pizzaID+"/share", obj{"friend_ids": []string{}})
	e.must(ravi, 404, "POST", "/v1/entries/"+pizzaID+"/share", obj{"friend_ids": []string{me.id}})

	sp := e.must(me, 201, "POST", "/v1/entries/"+pizzaID+"/share", obj{"friend_ids": []string{ravi.id}, "split": true})
	if get(sp, "entry", "kcal").(float64) != 750 || get(sp, "entry", "items", 0, "grams").(float64) != 300 {
		t.Fatalf("my half: %v", get(sp, "entry"))
	}
	if get(sp, "day", "totals", "kcal").(float64) != 750 {
		t.Fatalf("day after split: %v", get(sp, "day", "totals"))
	}
	e.must(me, 409, "POST", "/v1/entries/"+pizzaID+"/share", obj{"friend_ids": []string{ravi.id}, "split": true})

	inbox := get(e.must(ravi, 200, "GET", "/v1/shares?kind=meal", nil), "shares").([]any)
	if len(inbox) != 1 || get(inbox, 0, "split_ways").(float64) != 2 || get(inbox, 0, "meal", "kcal").(float64) != 750 ||
		get(inbox, 0, "from", "name") != "Bhavish" {
		t.Fatalf("ravi's inbox: %v", inbox)
	}
	shareID := get(inbox, 0, "id").(string)
	e.must(me, 404, "POST", "/v1/shares/"+shareID+"/accept", obj{"meal_slot_id": mySlot})
	acc := e.must(ravi, 201, "POST", "/v1/shares/"+shareID+"/accept", obj{"meal_slot_id": raviSlot, "date": "2999-01-01"})
	if get(acc, "entry", "origin") != "shared" || get(acc, "entry", "kcal").(float64) != 750 || get(acc, "entry", "date") != today {
		t.Fatalf("accepted entry: %v", get(acc, "entry"))
	}
	e.must(ravi, 404, "POST", "/v1/shares/"+shareID+"/accept", obj{"meal_slot_id": raviSlot})

	// The sender's entry says who it went to and how it was split.
	mine := func() obj {
		meals := get(e.must(me, 200, "GET", "/v1/days/"+today, nil), "day", "meals").([]any)
		for _, m := range meals {
			for _, en := range m.(obj)["entries"].([]any) {
				if en.(obj)["id"] == pizzaID {
					return en.(obj)
				}
			}
		}
		t.Fatal("pizza not in my day")
		return nil
	}
	if p := mine(); get(p, "split_ways").(float64) != 2 || len(p["shared_with"].([]any)) != 1 ||
		get(p, "shared_with", 0, "name") != "Ravi" || get(p, "shared_with", 0, "status") != "accepted" {
		t.Fatalf("my pizza after the split: %v", p)
	}
	if got := get(acc, "entry", "shared_with").([]any); len(got) != 0 {
		t.Fatalf("ravi's copy has shares: %v", got)
	}

	// --- share a whole meal, then decline ---------------------------------------
	link = e.must(me, 201, "POST", "/v1/invite-links", obj{})
	token = strings.TrimPrefix(get(link, "invite_link", "url").(string), "http://app.test/join/")
	sam, _ := e.signIn("sam@x.test", false, token)
	e.must(sam, 201, "POST", "/v1/onboarding", onboarding("Sam"))

	// Ravi already added it: sending it again doesn't offer it twice.
	e.must(me, 201, "POST", "/v1/entries/"+pizzaID+"/share", obj{"friend_ids": []string{ravi.id}})
	if n := len(get(e.must(ravi, 200, "GET", "/v1/shares", nil), "shares").([]any)); n != 0 {
		t.Fatalf("re-sent to someone who added it: %d waiting", n)
	}
	e.must(me, 201, "POST", "/v1/entries/"+pizzaID+"/share", obj{"friend_ids": []string{sam.id, sam.id}})
	e.must(me, 201, "POST", "/v1/entries/"+pizzaID+"/share", obj{"friend_ids": []string{sam.id}}) // still waiting: no duplicate
	inbox = get(e.must(sam, 200, "GET", "/v1/shares", nil), "shares").([]any)
	if len(inbox) != 1 || get(inbox, 0, "split_ways") != nil || get(inbox, 0, "meal", "kcal").(float64) != 750 {
		t.Fatalf("whole share: %v", inbox)
	}
	if p := mine(); len(p["shared_with"].([]any)) != 2 || get(p, "shared_with", 1, "name") != "Sam" ||
		get(p, "shared_with", 1, "status") != "pending" || get(p, "split_ways").(float64) != 2 {
		t.Fatalf("my pizza with sam waiting: %v", p)
	}
	e.must(sam, 204, "DELETE", "/v1/shares/"+get(inbox, 0, "id").(string), nil)
	if n := len(get(e.must(sam, 200, "GET", "/v1/shares", nil), "shares").([]any)); n != 0 {
		t.Fatalf("declined share still listed: %d", n)
	}
	if p := mine(); get(p, "shared_with", 1, "status") != "declined" {
		t.Fatalf("sam's answer: %v", p["shared_with"])
	}

	// --- history ------------------------------------------------------------------
	got := get(e.must(ravi, 200, "GET", "/v1/shares/history", nil), "items").([]any)
	if len(got) != 1 || get(got, 0, "kind") != "meal" || get(got, 0, "name") != "Pizza" || get(got, 0, "kcal").(float64) != 750 ||
		get(got, 0, "split_ways").(float64) != 2 || get(got, 0, "from", "name") != "Bhavish" ||
		get(got, 0, "recipients", 0, "id") != ravi.id || get(got, 0, "recipients", 0, "status") != "accepted" ||
		get(got, 0, "recipients", 0, "responded_at") == nil {
		t.Fatalf("ravi's history: %v", got)
	}
	sent := get(e.must(me, 200, "GET", "/v1/shares/history?direction=sent", nil), "items").([]any)
	if len(sent) != 2 || get(sent, 0, "recipients", 0, "name") != "Sam" || get(sent, 0, "split_ways") != nil ||
		get(sent, 1, "recipients", 0, "name") != "Ravi" || get(sent, 1, "split_ways").(float64) != 2 ||
		get(sent, 0, "from", "id") != me.id {
		t.Fatalf("my sent history: %v", sent)
	}
	older := get(e.must(me, 200, "GET", "/v1/shares/history?direction=sent&before="+url.QueryEscape(get(sent, 0, "created_at").(string)), nil), "items").([]any)
	if len(older) != 1 || get(older, 0, "id") != get(sent, 1, "id") {
		t.Fatalf("sent history before the newest: %v", older)
	}
	e.must(me, 400, "GET", "/v1/shares/history?direction=sideways", nil)
	e.must(me, 400, "GET", "/v1/shares/history?before=yesterday", nil)

	// --- share a template with a custom exercise ---------------------------------
	lib := get(e.must(me, 200, "GET", "/v1/exercises?q=bench", nil), "exercises", 0, "id").(string)
	own := get(e.must(me, 201, "POST", "/v1/exercises", obj{"name": "Banded pull-apart", "kind": "strength"}), "exercise", "id").(string)
	tpl := e.must(me, 201, "POST", "/v1/templates", obj{"name": "Upper-1", "blocks": []obj{
		{"exercise_id": lib, "sets": []obj{{"target_kg": 60, "target_reps": 8}}},
		{"exercise_id": own, "sets": []obj{{"target_reps": 15}}},
	}})
	tplID := get(tpl, "template", "id").(string)
	e.must(ravi, 404, "POST", "/v1/templates/"+tplID+"/share", obj{"friend_ids": []string{me.id}})
	e.must(me, 201, "POST", "/v1/templates/"+tplID+"/share", obj{"friend_ids": []string{ravi.id}})

	inbox = get(e.must(ravi, 200, "GET", "/v1/shares?kind=template", nil), "shares").([]any)
	if len(inbox) != 1 || get(inbox, 0, "template", "name") != "Upper-1" || len(get(inbox, 0, "template", "exercises").([]any)) != 2 {
		t.Fatalf("template inbox: %v", inbox)
	}
	if _, ok := get(inbox, 0, "template").(obj)["blocks"]; ok {
		t.Fatal("the list should not carry blocks")
	}
	copied := e.must(ravi, 201, "POST", "/v1/shares/"+get(inbox, 0, "id").(string)+"/accept", obj{})
	// Ravi already has a starter "Upper-1", so the copy says whose it is.
	if n := get(copied, "template", "name"); n != "Upper-1 (Bhavish)" {
		t.Fatalf("copied name: %v", n)
	}
	blocks := get(copied, "template", "blocks").([]any)
	if len(blocks) != 2 || get(blocks, 0, "exercise", "id") != lib || get(blocks, 0, "sets", 0, "target_kg").(float64) != 60 {
		t.Fatalf("copied template: %v", copied)
	}
	if id := get(blocks, 1, "exercise", "id"); id == own || get(blocks, 1, "exercise", "name") != "Banded pull-apart" {
		t.Fatalf("custom exercise should be Ravi's own copy: %v", get(blocks, 1, "exercise"))
	}
	// My later edits stay mine.
	e.must(me, 200, "PUT", "/v1/templates/"+tplID, obj{"name": "Upper-1", "blocks": []obj{{"exercise_id": lib, "sets": []obj{}}}})
	if n := len(get(e.must(ravi, 200, "GET", "/v1/templates/"+get(copied, "template", "id").(string), nil), "template", "blocks").([]any)); n != 2 {
		t.Fatalf("ravi's copy changed: %d blocks", n)
	}

	// --- after unfriending, nothing waits -----------------------------------------
	e.must(me, 201, "POST", "/v1/templates/"+tplID+"/share", obj{"friend_ids": []string{ravi.id}})
	e.must(me, 204, "DELETE", "/v1/friends/"+ravi.id, nil)
	if n := len(get(e.must(ravi, 200, "GET", "/v1/shares", nil), "shares").([]any)); n != 0 {
		t.Fatalf("shares from an ex-friend: %d", n)
	}
}
