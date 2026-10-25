package handlers_test

import (
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

func TestSaveEntryAndCategories(t *testing.T) {
	e := setup(t)
	me, ravi := friends(t, e)
	today := store.LocalToday(time.Now(), "Indian/Mauritius")
	yesterday := store.Date{Time: today.AddDate(0, 0, -1)}.String()
	lunch := get(e.must(me, 200, "GET", "/v1/meal-slots", nil), "meal_slots", 1, "id").(string)

	// A category on a new entry; unknown ones are refused.
	e.must(me, 400, "POST", "/v1/days/"+yesterday+"/entries", obj{"meal_slot_id": lunch, "name": "Burger", "kcal": 700, "category": "junk"})
	r := e.must(me, 201, "POST", "/v1/days/"+yesterday+"/entries", obj{"meal_slot_id": lunch, "name": "Chicken burger", "origin": "restaurant",
		"category": "takeaway", "items": []obj{{"name": "Chicken burger", "kcal": 520, "protein_g": 30}, {"name": "Fries", "kcal": 300}}})
	id := get(r, "entry", "id").(string)
	if get(r, "entry", "category") != "takeaway" {
		t.Fatalf("category: %v", get(r, "entry"))
	}

	// Yesterday's meal, saved: its items, picture and category come along and the entry links to it.
	e.must(ravi, 404, "POST", "/v1/entries/"+id+"/save", obj{})
	s := e.must(me, 201, "POST", "/v1/entries/"+id+"/save", obj{"name": "Burger night"})
	if get(s, "saved_meal", "name") != "Burger night" || get(s, "saved_meal", "category") != "takeaway" ||
		len(get(s, "saved_meal", "items").([]any)) != 2 || get(s, "saved_meal", "base", "kcal").(float64) != 820 ||
		get(s, "saved_meal", "default_meal_slot_id") != lunch {
		t.Fatalf("saved: %v", get(s, "saved_meal"))
	}
	mealID := get(s, "saved_meal", "id").(string)
	if get(s, "entry", "saved_meal_id") != mealID || get(s, "day", "date") != yesterday {
		t.Fatalf("entry not linked: %v", get(s, "entry"))
	}

	// Change the category, then clear it.
	p := e.must(me, 200, "PATCH", "/v1/entries/"+id, obj{"category": "eating_out"})
	if get(p, "entry", "category") != "eating_out" {
		t.Fatalf("patch: %v", get(p, "entry"))
	}
	p = e.must(me, 200, "PATCH", "/v1/entries/"+id, obj{"category": "none"})
	if get(p, "entry", "category") != nil {
		t.Fatalf("cleared: %v", get(p, "entry"))
	}

	// Logging the saved meal carries its category; so does logging an entry again.
	l := e.must(me, 201, "POST", "/v1/days/"+today.String()+"/saved-meals/"+mealID, obj{})
	if get(l, "entry", "category") != "takeaway" {
		t.Fatalf("logged saved meal: %v", get(l, "entry"))
	}
	a := e.must(me, 201, "POST", "/v1/entries/"+get(l, "entry", "id").(string)+"/again", obj{"date": today.String()})
	if get(a, "entry", "category") != "takeaway" {
		t.Fatalf("again: %v", get(a, "entry"))
	}

	// Saved meals keep a category of their own; left out keeps it.
	u := e.must(me, 200, "PUT", "/v1/saved-meals/"+mealID, obj{"name": "Burger night", "category": "sweet",
		"items": []obj{{"name": "Chicken burger", "kcal": 520, "protein_g": 30}}})
	if get(u, "saved_meal", "category") != "sweet" {
		t.Fatalf("put category: %v", get(u, "saved_meal"))
	}
	u = e.must(me, 200, "PUT", "/v1/saved-meals/"+mealID, obj{"name": "Burger night", "items": []obj{{"name": "Chicken burger", "kcal": 520}}})
	if get(u, "saved_meal", "category") != "sweet" {
		t.Fatalf("category dropped: %v", get(u, "saved_meal"))
	}

	// An entry logged as plain totals saves as one item.
	m := e.must(me, 201, "POST", "/v1/days/"+today.String()+"/entries", obj{"meal_slot_id": lunch, "name": "Protein shake", "kcal": 160, "protein_g": 30})
	ms := e.must(me, 201, "POST", "/v1/entries/"+get(m, "entry", "id").(string)+"/save", obj{"category": "protein"})
	if n := len(get(ms, "saved_meal", "items").([]any)); n != 1 || get(ms, "saved_meal", "base", "protein_g").(float64) != 30 ||
		get(ms, "saved_meal", "category") != "protein" || get(ms, "entry", "category") != "protein" {
		t.Fatalf("totals saved: %v", ms)
	}
}
