package handlers_test

import (
	"strings"
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

func TestFoodIcons(t *testing.T) {
	e := setup(t)
	today := store.LocalToday(time.Now(), "Indian/Mauritius").String()

	me, _ := e.signIn("bhavish@x.test", false, "")
	e.must(me, 201, "POST", "/v1/onboarding", onboarding("Bhavish"))
	link := e.must(me, 201, "POST", "/v1/invite-links", obj{})
	token := strings.TrimPrefix(get(link, "invite_link", "url").(string), "http://app.test/join/")
	ravi, _ := e.signIn("ravi@x.test", false, token)
	e.must(ravi, 201, "POST", "/v1/onboarding", onboarding("Ravi"))
	slot := get(e.must(me, 200, "GET", "/v1/meal-slots", nil), "meal_slots", 0, "id").(string)
	raviSlot := get(e.must(ravi, 200, "GET", "/v1/meal-slots", nil), "meal_slots", 0, "id").(string)

	pizza := obj{"name": "Pizza", "grams": 300, "kcal": 800, "protein_g": 30, "carbs_g": 90, "fat_g": 30}
	e.must(me, 400, "POST", "/v1/days/"+today+"/entries", obj{"meal_slot_id": slot, "name": "Pizza", "icon": "spaceship", "items": []obj{pizza}})
	created := e.must(me, 201, "POST", "/v1/days/"+today+"/entries", obj{"meal_slot_id": slot, "name": "Pizza", "icon": "pizza", "items": []obj{pizza}})
	if get(created, "entry", "icon") != "pizza" {
		t.Fatalf("created icon: %v", get(created, "entry", "icon"))
	}
	id := get(created, "entry", "id").(string)
	if plain := e.must(me, 201, "POST", "/v1/days/"+today+"/entries", obj{"meal_slot_id": slot, "name": "Toast", "icon": "none", "items": []obj{pizza}}); get(plain, "entry", "icon") != nil {
		t.Fatalf(`"none" should store no icon: %v`, get(plain, "entry", "icon"))
	}

	// PATCH: left out keeps it, a key changes it, "none" removes it.
	if p := e.must(me, 200, "PATCH", "/v1/entries/"+id, obj{"name": "Margherita"}); get(p, "entry", "icon") != "pizza" {
		t.Fatalf("icon after a rename: %v", get(p, "entry", "icon"))
	}
	e.must(me, 400, "PATCH", "/v1/entries/"+id, obj{"icon": "spaceship"})
	if p := e.must(me, 200, "PATCH", "/v1/entries/"+id, obj{"icon": "bread"}); get(p, "entry", "icon") != "bread" {
		t.Fatalf("changed icon: %v", get(p, "entry", "icon"))
	}
	if p := e.must(me, 200, "PATCH", "/v1/entries/"+id, obj{"icon": "none"}); get(p, "entry", "icon") != nil {
		t.Fatalf("removed icon: %v", get(p, "entry", "icon"))
	}
	e.must(me, 200, "PATCH", "/v1/entries/"+id, obj{"icon": "pizza"})

	// A saved meal keeps its icon, and logging it carries it over.
	saved := e.must(me, 201, "POST", "/v1/saved-meals", obj{"name": "Friday pizza", "icon": "pizza", "items": []obj{pizza}})
	savedID := get(saved, "saved_meal", "id").(string)
	if p := e.must(me, 200, "PUT", "/v1/saved-meals/"+savedID, obj{"name": "Friday pizza", "items": []obj{pizza}}); get(p, "saved_meal", "icon") != "pizza" {
		t.Fatalf("saved icon after an edit without it: %v", get(p, "saved_meal", "icon"))
	}
	logged := e.must(me, 201, "POST", "/v1/days/"+today+"/saved-meals/"+savedID, obj{"meal_slot_id": slot})
	if get(logged, "entry", "icon") != "pizza" {
		t.Fatalf("logged saved meal icon: %v", get(logged, "entry", "icon"))
	}

	// A shared meal arrives with its icon.
	e.must(me, 201, "POST", "/v1/entries/"+id+"/share", obj{"friend_ids": []string{ravi.id}})
	inbox := get(e.must(ravi, 200, "GET", "/v1/shares", nil), "shares").([]any)
	acc := e.must(ravi, 201, "POST", "/v1/shares/"+get(inbox, 0, "id").(string)+"/accept", obj{"meal_slot_id": raviSlot})
	if get(acc, "entry", "icon") != "pizza" {
		t.Fatalf("accepted share icon: %v", get(acc, "entry", "icon"))
	}
}
