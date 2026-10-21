package handlers_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

func TestMealPhotos(t *testing.T) {
	e := setup(t)
	today := store.LocalToday(time.Now(), "Indian/Mauritius").String()
	u, err := e.signIn("photos@x.test", false, "")
	if err != nil {
		t.Fatal(err)
	}
	e.must(u, 201, "POST", "/v1/onboarding", onboarding("Ana"))
	img := obj{"media_type": "image/jpeg", "data": "aGVsbG8="}

	// A photo estimate stores the photo as pending; logging the meal (even
	// from a refined estimate) keeps it on the entry.
	est := e.must(u, 200, "POST", "/v1/ai/meal-estimate", obj{"image": img})
	if e.ph.count() != 1 {
		t.Fatalf("objects after estimate: %d", e.ph.count())
	}
	refined := e.must(u, 200, "POST", "/v1/ai/meal-estimate", obj{"previous_estimate_id": get(est, "estimate_id"), "answers": obj{"rice_portion": "small"}})
	logMeal := func(estimateID any) obj {
		return e.must(u, 201, "POST", "/v1/days/"+today+"/entries", obj{
			"meal_name": "Lunch", "name": "Fish curry", "origin": "ai", "ai_estimate_id": estimateID,
			"items": []obj{{"name": "Fish curry", "kcal": 400, "protein_g": 30, "carbs_g": 40, "fat_g": 12}},
		})
	}
	first := logMeal(get(refined, "estimate_id"))
	if n := len(get(first, "entry", "photos").([]any)); n != 1 || get(first, "photos_skipped").(float64) != 0 {
		t.Fatalf("logged entry photos: %v", first)
	}
	if url := get(first, "entry", "photos", 0, "url").(string); !strings.HasPrefix(url, "https://photos.test/photos/"+u.id+"/") {
		t.Fatalf("photo url: %s", url)
	}

	// Free users keep 2 here (FreePhotosStored); the third photo is dropped.
	logMeal(get(e.must(u, 200, "POST", "/v1/ai/meal-estimate", obj{"image": img}), "estimate_id"))
	third := logMeal(get(e.must(u, 200, "POST", "/v1/ai/meal-estimate", obj{"image": img}), "estimate_id"))
	if get(third, "photos_skipped").(float64) != 1 || len(get(third, "entry", "photos").([]any)) != 0 {
		t.Fatalf("over the limit: %v", third)
	}
	if e.ph.count() != 2 {
		t.Fatalf("objects kept: %d, want 2", e.ph.count())
	}
	bill := e.must(u, 200, "GET", "/v1/billing", nil)
	if get(bill, "billing", "photos_stored").(float64) != 2 || get(bill, "billing", "photos_limit").(float64) != 2 {
		t.Fatalf("billing: %v", bill)
	}

	// The photo list, then deleting a photo (the meal stays) and an entry.
	list := e.must(u, 200, "GET", "/v1/photos", nil)
	photos := get(list, "photos").([]any)
	if len(photos) != 2 || get(list, "stored").(float64) != 2 || get(photos, 0, "entry", "name") != "Fish curry" {
		t.Fatalf("photos: %v", list)
	}
	e.must(u, 204, "DELETE", "/v1/photos/"+get(photos, 0, "id").(string), nil)
	e.must(u, 404, "DELETE", "/v1/photos/"+get(photos, 0, "id").(string), nil)
	e.must(u, 200, "DELETE", "/v1/entries/"+get(first, "entry", "id").(string), nil)
	if e.ph.count() != 0 || get(e.must(u, 200, "GET", "/v1/photos", nil), "stored").(float64) != 0 {
		t.Fatalf("after deletes: %d objects", e.ph.count())
	}

	// Someone else can't delete your photos.
	other, _ := e.signIn("other-photos@x.test", false, "")
	again := logMeal(get(e.must(u, 200, "POST", "/v1/ai/meal-estimate", obj{"image": img}), "estimate_id"))
	e.must(other, 404, "DELETE", "/v1/photos/"+get(again, "entry", "photos", 0, "id").(string), nil)

	// Up to 3 photos per estimate; it counts once toward the monthly limit,
	// and each photo counts toward storage.
	e.must(u, 400, "POST", "/v1/ai/meal-estimate", obj{"images": []obj{img, img, img, img}})
	used := func() float64 {
		return get(e.must(u, 200, "GET", "/v1/billing", nil), "billing", "photo_estimates", "used_this_month").(float64)
	}
	before := used()
	objects := e.ph.count()
	multi := e.must(u, 200, "POST", "/v1/ai/meal-estimate", obj{"images": []obj{img, img, img}, "text": "rice and curry"})
	if used() != before+1 || e.ph.count() != objects+3 {
		t.Fatalf("multi-photo estimate: used %v→%v, objects %d→%d", before, used(), objects, e.ph.count())
	}
	if last := e.ai.last.Load(); len(last.Images) != 3 {
		t.Fatalf("AI got %d images", len(last.Images))
	}
	// One slot left of 2: one photo kept, two dropped.
	mlog := logMeal(get(multi, "estimate_id"))
	if len(get(mlog, "entry", "photos").([]any)) != 1 || get(mlog, "photos_skipped").(float64) != 2 {
		t.Fatalf("multi-photo log: %v", mlog)
	}

	// Never-logged estimates are cleaned up after a day.
	e.must(u, 200, "POST", "/v1/ai/meal-estimate", obj{"image": img})
	keys, err := e.st.TakeStalePendingPhotos(context.Background(), time.Now().Add(time.Hour), 100)
	if err != nil || len(keys) != 1 {
		t.Fatalf("stale pending: %v %v", keys, err)
	}
}
