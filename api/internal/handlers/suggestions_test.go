package handlers_test

import (
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

func TestSuggestions(t *testing.T) {
	e := setup(t)
	me, ravi := friends(t, e)
	today := store.LocalToday(time.Now(), "Indian/Mauritius")
	yesterday := store.Date{Time: today.AddDate(0, 0, -1)}.String()
	twoAgo := store.Date{Time: today.AddDate(0, 0, -2)}.String()
	breakfast := get(e.must(me, 200, "GET", "/v1/meal-slots", nil), "meal_slots", 0, "id").(string)
	snacks := get(e.must(me, 200, "GET", "/v1/meal-slots", nil), "meal_slots", 3, "id").(string)

	add := func(date, slot, name string, kcal, protein float64) string {
		r := e.must(me, 201, "POST", "/v1/days/"+date+"/entries", obj{"meal_slot_id": slot, "name": name, "origin": "restaurant",
			"items": []obj{{"name": name, "kcal": kcal, "protein_g": protein}}})
		return get(r, "entry", "id").(string)
	}
	add(twoAgo, breakfast, "Oats", 300, 10)
	add(yesterday, breakfast, "Oats", 300, 10)
	eggs := add(yesterday, breakfast, "Eggs on toast", 420, 24)
	add(twoAgo, snacks, "Greek yoghurt", 150, 15)

	s := e.must(me, 200, "GET", "/v1/suggestions?date="+today.String()+"&meal_slot_id="+breakfast, nil)
	if len(get(s, "again").([]any)) != 2 || get(s, "again_date") != yesterday {
		t.Fatalf("again: %v", s)
	}
	if len(get(s, "usual").([]any)) != 0 { // Oats is already in "again"
		t.Fatalf("usual repeats again: %v", get(s, "usual"))
	}
	// Nothing eaten today: short on protein, and the yoghurt is the best fit.
	if get(s, "gap", "nutrient") != "protein" || get(s, "gap", "picks", 0, "name") != "Greek yoghurt" {
		t.Fatalf("gap: %v", get(s, "gap"))
	}

	again := e.must(me, 201, "POST", "/v1/entries/"+eggs+"/again", obj{"date": today.String()})
	if get(again, "entry", "name") != "Eggs on toast" || get(again, "entry", "origin") != "restaurant" ||
		get(again, "entry", "meal_slot_id") != breakfast || get(again, "day", "totals", "kcal").(float64) != 420 {
		t.Fatalf("again: %v", again)
	}
	e.must(ravi, 404, "POST", "/v1/entries/"+eggs+"/again", obj{})

	// Ravi sees Bhavish's meals only once Bhavish shares them.
	if n := len(get(e.must(ravi, 200, "GET", "/v1/suggestions", nil), "friends").([]any)); n != 0 {
		t.Fatalf("friends' meals without sharing: %d", n)
	}
	e.must(me, 200, "PUT", "/v1/sharing", obj{"meals": true})
	fr := get(e.must(ravi, 200, "GET", "/v1/suggestions", nil), "friends").([]any)
	if len(fr) != 1 || get(fr, 0, "name") != "Eggs on toast" || get(fr, 0, "person", "name") != "Bhavish" {
		t.Fatalf("friends' meals: %v", fr)
	}
}
