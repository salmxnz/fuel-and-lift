package handlers_test

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// exerciseID finds a library exercise by its exact name.
func (e *env) exerciseID(u user, name string) string {
	e.t.Helper()
	list := get(e.must(u, 200, "GET", "/v1/exercises?q="+strings.ReplaceAll(name, " ", "+"), nil), "exercises").([]any)
	for _, x := range list {
		if get(x, "name") == name {
			return get(x, "id").(string)
		}
	}
	e.t.Fatalf("no exercise %q", name)
	return ""
}

func TestExerciseAI(t *testing.T) {
	e := setup(t)
	me, _ := friends(t, e)
	pic := obj{"media_type": "image/jpeg", "data": "aGVsbG8="}

	// A photo of a machine: the library exercise, its picture, the weight on the pin, 3 sets.
	got := e.must(me, 200, "POST", "/v1/ai/exercise", obj{"images": []obj{pic}})
	opt := get(got, "options", 0)
	if get(opt, "match", "name") != "Pec deck" || get(opt, "media_url") != "/exercises/butterfly.jpg" ||
		get(got, "weight_kg").(float64) != 40 || get(got, "sets").(float64) != 3 || get(opt, "muscles", 0) != "mid chest" {
		t.Fatalf("photo: %v", got)
	}
	// "rear delt" gets three variations; one not in the library borrows a picture.
	got = e.must(me, 200, "POST", "/v1/ai/exercise", obj{"text": "rear delt"})
	if opts := get(got, "options").([]any); len(opts) != 3 || get(opts[1], "match") != nil || get(opts[1], "picture_from") != e.exerciseID(me, "Face pull") ||
		get(opts[2], "match", "name") != "Face pull" {
		t.Fatalf("variations: %v", got)
	}
	e.must(me, 400, "POST", "/v1/ai/exercise", obj{})
	e.must(me, 400, "POST", "/v1/ai/exercise", obj{"images": []obj{pic, pic, pic}})

	// A cardio screen.
	got = e.must(me, 200, "POST", "/v1/ai/cardio-screen", obj{"image": pic, "exercise": "Treadmill"})
	if get(got, "reading", "minutes").(float64) != 25.5 || get(got, "reading", "kcal").(float64) != 310 {
		t.Fatalf("screen: %v", got)
	}
	// Gym photos aren't meal photo estimates.
	if n := get(e.must(me, 200, "GET", "/v1/billing", nil), "billing", "photo_estimates", "used_this_month").(float64); n != 0 {
		t.Fatalf("gym photos counted as photo estimates: %v", n)
	}
}

func TestSharedExercises(t *testing.T) {
	e := setup(t)
	me, ravi := friends(t, e)
	stranger, _ := e.signIn("stranger@x.test", false, "")
	e.must(stranger, 201, "POST", "/v1/onboarding", onboarding("Stranger"))

	// My own machine, with the closest library picture and my photo of it.
	created := e.must(me, 201, "POST", "/v1/exercises", obj{"name": "N933 Pec Deck", "kind": "strength", "muscle_group": "chest",
		"equipment": "machine", "muscles": []string{"mid chest"}, "picture_from": e.exerciseID(me, "Pec deck")})
	id := get(created, "exercise", "id").(string)
	if get(created, "exercise", "media_url") != "/exercises/butterfly.jpg" || get(created, "exercise", "mine") != true ||
		get(created, "exercise", "visibility") != "private" {
		t.Fatalf("created: %v", created)
	}
	e.must(me, 400, "POST", "/v1/exercises", obj{"name": "Thing", "muscles": []string{"pecs"}})
	pic := tinyPNG(t)
	withPhoto := e.must(me, 200, "PUT", "/v1/exercises/"+id+"/photo", obj{"media_type": "image/jpeg", "data": base64.StdEncoding.EncodeToString(pic)})
	photoURL := get(withPhoto, "exercise", "gym_photo_url").(string)
	if !strings.HasPrefix(photoURL, "/exercise-photos/") {
		t.Fatalf("photo url %q", photoURL)
	}
	res, err := http.Get(e.srv.URL + "/v1" + strings.Split(photoURL, "?")[0])
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/png" || !bytes.Equal(body, pic) {
		t.Fatalf("photo: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	// A photo of a library machine is mine only.
	lib := e.exerciseID(me, "Leg press")
	e.must(me, 200, "PUT", "/v1/exercises/"+lib+"/photo", obj{"media_type": "image/png", "data": base64.StdEncoding.EncodeToString(pic)})
	for _, x := range get(e.must(ravi, 200, "GET", "/v1/exercises?q=leg+press", nil), "exercises").([]any) {
		if get(x, "gym_photo_url") != nil {
			t.Fatalf("someone else's photo leaked: %v", x)
		}
	}

	// Private: nobody sees it.
	if n := len(get(e.must(ravi, 200, "GET", "/v1/exercises/shared?scope=friends", nil), "exercises").([]any)); n != 0 {
		t.Fatalf("private exercise shared: %d", n)
	}
	e.must(ravi, 404, "POST", "/v1/exercises/"+id+"/add", nil)
	e.must(ravi, 404, "PUT", "/v1/exercises/"+id+"/visibility", obj{"visibility": "public"})
	e.must(me, 400, "PUT", "/v1/exercises/"+id+"/visibility", obj{"visibility": "everyone"})

	// Friends: my friend sees it with my photo; a stranger doesn't.
	e.must(me, 200, "PUT", "/v1/exercises/"+id+"/visibility", obj{"visibility": "friends"})
	list := get(e.must(ravi, 200, "GET", "/v1/exercises/shared?scope=friends", nil), "exercises").([]any)
	if len(list) != 1 || get(list[0], "owner", "name") != "Bhavish" || get(list[0], "gym_photo_url") == nil {
		t.Fatalf("friends list: %v", list)
	}
	if n := len(get(e.must(stranger, 200, "GET", "/v1/exercises/shared?scope=public", nil), "exercises").([]any)); n != 0 {
		t.Fatalf("friends-only exercise in the Shop: %d", n)
	}
	e.must(stranger, 404, "POST", "/v1/exercises/"+id+"/add", nil)

	// Adding copies it, photo and all, once.
	added := e.must(ravi, 200, "POST", "/v1/exercises/"+id+"/add", nil)
	copyID := get(added, "exercise", "id").(string)
	if copyID == id || get(added, "exercise", "mine") != true || get(added, "exercise", "media_url") != "/exercises/butterfly.jpg" ||
		get(added, "exercise", "gym_photo_url") == nil || get(added, "exercise", "muscles", 0) != "mid chest" {
		t.Fatalf("added: %v", added)
	}
	if again := e.must(ravi, 200, "POST", "/v1/exercises/"+id+"/add", nil); get(again, "exercise", "id") != copyID {
		t.Fatalf("added twice: %v", again)
	}
	if list := get(e.must(ravi, 200, "GET", "/v1/exercises/shared?scope=friends", nil), "exercises").([]any); get(list[0], "added_id") != copyID {
		t.Fatalf("added_id: %v", list)
	}

	// Public: in the Shop, without the photo; a stranger's copy has none.
	e.must(me, 200, "PUT", "/v1/exercises/"+id+"/visibility", obj{"visibility": "public"})
	shop := get(e.must(stranger, 200, "GET", "/v1/exercises/shared?scope=public&q=pec", nil), "exercises").([]any)
	if len(shop) != 1 || get(shop[0], "gym_photo_url") != nil {
		t.Fatalf("shop: %v", shop)
	}
	if got := e.must(stranger, 200, "POST", "/v1/exercises/"+id+"/add", nil); get(got, "exercise", "gym_photo_url") != nil {
		t.Fatalf("stranger got the photo: %v", got)
	}
}

func TestSessionOrderCardioAndRest(t *testing.T) {
	e := setup(t)
	me, _ := friends(t, e)
	s := e.must(me, 201, "POST", "/v1/sessions", obj{})
	sid := get(s, "session", "id").(string)
	path := "/v1/sessions/" + sid

	// A block with planned sets (what a machine photo fills in), then two more.
	got := e.must(me, 201, "POST", path+"/blocks", obj{"exercise_id": e.exerciseID(me, "Pec deck"),
		"sets": []obj{{"target_kg": 40, "target_reps": 10}, {"target_kg": 40, "target_reps": 10}, {"target_kg": 40, "target_reps": 10}}})
	if sets := get(got, "session", "blocks", 0, "sets").([]any); len(sets) != 3 || get(sets[0], "target_kg").(float64) != 40 {
		t.Fatalf("planned sets: %v", got)
	}
	e.must(me, 400, "POST", path+"/blocks", obj{"exercise_id": e.exerciseID(me, "Pec deck"), "sets": []obj{{"target_kg": 4000}}})
	e.must(me, 201, "POST", path+"/blocks", obj{"exercise_id": e.exerciseID(me, "Lat pulldown")})
	got = e.must(me, 201, "POST", path+"/blocks", obj{"exercise_id": e.exerciseID(me, "Treadmill"), "cardio": obj{"minutes": 20, "incline": 6, "speed": 6}})
	blocks := get(got, "session", "blocks").([]any)
	ids := []string{get(blocks[0], "id").(string), get(blocks[1], "id").(string), get(blocks[2], "id").(string)}

	// The pec deck's taken: do it after the pulldown.
	got = e.must(me, 200, "PUT", path+"/order", obj{"block_ids": []string{ids[1], ids[0], ids[2]}})
	if get(got, "session", "blocks", 0, "exercise", "name") != "Lat pulldown" || get(got, "session", "blocks", 1, "position").(float64) != 1 {
		t.Fatalf("order: %v", got)
	}
	e.must(me, 400, "PUT", path+"/order", obj{"block_ids": []string{ids[1], ids[0]}})
	e.must(me, 400, "PUT", path+"/order", obj{"block_ids": []string{ids[1], ids[1], ids[2]}})

	// What the treadmill's screen said.
	got = e.must(me, 200, "PATCH", path+"/blocks/"+ids[2], obj{"cardio_done": true, "cardio_actual": obj{"minutes": 25.5, "distance_km": 3.2, "kcal": 310}})
	b := get(got, "session", "blocks", 2)
	if get(b, "cardio_done") != true || get(b, "cardio_actual", "distance_km").(float64) != 3.2 || get(b, "cardio", "minutes").(float64) != 20 {
		t.Fatalf("cardio actual: %v", b)
	}
	e.must(me, 400, "PATCH", path+"/blocks/"+ids[2], obj{"cardio_actual": obj{"minutes": 25, "speed": 900}})
	got = e.must(me, 200, "PATCH", path+"/blocks/"+ids[2], obj{"cardio_actual": nil})
	if get(got, "session", "blocks", 2, "cardio_actual") != nil {
		t.Fatalf("cardio actual not cleared: %v", got)
	}

	// Rest alerts.
	e.must(me, 400, "POST", path+"/rest", obj{"seconds": 1})
	e.must(me, 202, "POST", path+"/rest", obj{"seconds": 90, "next": "Set 2 · Pec deck 40 kg × 10"})
	e.must(me, 204, "DELETE", path+"/rest", nil)
}

func TestGymInsights(t *testing.T) {
	e := setup(t)
	me, _ := friends(t, e)
	today := store.LocalToday(time.Now(), "Indian/Mauritius")
	day := func(n int) string { return today.AddDate(0, 0, -n).Format(time.DateOnly) }
	train := func(date, exercise string, kg float64) {
		s := e.must(me, 201, "POST", "/v1/sessions", obj{"date": date})
		sid := get(s, "session", "id").(string)
		got := e.must(me, 201, "POST", "/v1/sessions/"+sid+"/blocks", obj{"exercise_id": e.exerciseID(me, exercise),
			"sets": []obj{{"target_kg": kg, "target_reps": 10}}})
		set := get(got, "session", "blocks", 0, "sets", 0, "id").(string)
		e.must(me, 200, "PATCH", "/v1/sessions/"+sid+"/sets/"+set, obj{"done": true, "actual_kg": kg, "actual_reps": 10})
	}

	// Two sessions isn't enough to nag about.
	train(day(20), "Wrist curl", 12)
	train(day(5), "Bench press", 60)
	if n := len(get(e.must(me, 200, "GET", "/v1/gym/insights", nil), "nudges").([]any)); n != 0 {
		t.Fatalf("nudged a new user: %d", n)
	}
	train(day(3), "Bench press", 62.5)
	train(day(1), "Bench press", 62.5)

	got := e.must(me, 200, "GET", "/v1/gym/insights", nil)
	nudges := get(got, "nudges").([]any)
	if len(nudges) != 2 || get(nudges[0], "muscle") != "forearms" || get(nudges[0], "text") != "You haven't trained forearms in 2 weeks" ||
		get(nudges[0], "exercises", 0, "exercise", "name") != "Wrist curl" || get(nudges[0], "exercises", 0, "last_kg").(float64) != 12 ||
		get(nudges[0], "add_to") != nil || get(nudges[1], "muscle") != "upper chest" {
		t.Fatalf("nudges: %v", nudges)
	}

	// With a plan, the forearm work goes into the next workout, this week only.
	tpl := e.must(me, 201, "POST", "/v1/templates", obj{"name": "Upper", "blocks": []obj{{"exercise_id": e.exerciseID(me, "Bench press"),
		"sets": []obj{{"target_kg": 60, "target_reps": 8}}}}})
	tid := get(tpl, "template", "id").(string)
	days := obj{}
	for _, d := range store.Weekdays {
		days[d] = tid
	}
	e.must(me, 200, "PUT", "/v1/weekly-plan", obj{"days": days})
	got = e.must(me, 200, "GET", "/v1/gym/insights", nil)
	if get(got, "nudges", 0, "add_to", "template_id") != tid || get(got, "nudges", 0, "add_to", "date") != today.String() {
		t.Fatalf("add_to: %v", get(got, "nudges"))
	}
	e.must(me, 400, "POST", "/v1/gym/week-extras", obj{"template_id": tid, "blocks": []obj{}})
	extras := e.must(me, 201, "POST", "/v1/gym/week-extras", obj{"template_id": tid, "date": today.String(), "blocks": []obj{
		{"exercise_id": e.exerciseID(me, "Wrist curl"), "sets": []obj{{"target_kg": 12, "target_reps": 12}, {"target_kg": 12, "target_reps": 12}}}}})
	if list := get(extras, "extras").([]any); len(list) != 1 || get(list[0], "template_name") != "Upper" {
		t.Fatalf("extras: %v", extras)
	}
	got = e.must(me, 200, "GET", "/v1/gym/insights", nil)
	if get(got, "nudges", 0, "muscle") == "forearms" || len(get(got, "extras").([]any)) != 1 {
		t.Fatalf("planned forearms still nudged: %v", got)
	}

	// Starting that workout this week brings them along, once.
	s := e.must(me, 201, "POST", "/v1/sessions", obj{"template_id": tid})
	blocks := get(s, "session", "blocks").([]any)
	if len(blocks) != 2 || get(blocks[1], "exercise", "name") != "Wrist curl" || len(get(blocks[1], "sets").([]any)) != 2 {
		t.Fatalf("session with extras: %v", blocks)
	}
	if n := len(get(e.must(me, 200, "GET", "/v1/gym/insights", nil), "extras").([]any)); n != 0 {
		t.Fatalf("extras left after use: %d", n)
	}
	if again := e.must(me, 201, "POST", "/v1/sessions", obj{"template_id": tid}); len(get(again, "session", "blocks").([]any)) != 1 {
		t.Fatal("extras used twice")
	}
}

func TestProgressPhotos(t *testing.T) {
	e := setup(t)
	me, ravi := friends(t, e)
	pic := base64.StdEncoding.EncodeToString(tinyPNG(t))
	today := store.LocalToday(time.Now(), "Indian/Mauritius")

	e.must(me, 400, "POST", "/v1/progress/photos", obj{"media_type": "image/png", "data": base64.StdEncoding.EncodeToString([]byte("<html>"))})
	e.must(me, 400, "POST", "/v1/progress/photos", obj{"media_type": "image/png", "data": pic, "pose": "upside down"})
	e.must(me, 400, "POST", "/v1/progress/photos", obj{"media_type": "image/png", "data": pic, "taken_on": today.AddDate(0, 0, 1).Format(time.DateOnly)})
	old := e.must(me, 201, "POST", "/v1/progress/photos", obj{"media_type": "image/png", "data": pic, "pose": "side",
		"taken_on": today.AddDate(0, 0, -30).Format(time.DateOnly)})
	now := e.must(me, 201, "POST", "/v1/progress/photos", obj{"media_type": "image/png", "data": pic})
	if !strings.HasPrefix(get(now, "photo", "url").(string), "https://photos.test/progress/"+me.id+"/") ||
		get(now, "photo", "pose") != "front" || get(now, "photo", "weight_kg").(float64) != 53 || get(old, "photo", "weight_kg") != nil {
		t.Fatalf("photo: %v / %v", now, old)
	}
	list := get(e.must(me, 200, "GET", "/v1/progress/photos", nil), "photos").([]any)
	if len(list) != 2 || get(list[0], "id") != get(now, "photo", "id") || e.ph.count() != 2 {
		t.Fatalf("list: %v", list)
	}
	// Private to me.
	if n := len(get(e.must(ravi, 200, "GET", "/v1/progress/photos", nil), "photos").([]any)); n != 0 {
		t.Fatalf("someone else's progress photos: %d", n)
	}
	e.must(ravi, 404, "DELETE", "/v1/progress/photos/"+get(old, "photo", "id").(string), nil)
	e.must(me, 204, "DELETE", "/v1/progress/photos/"+get(old, "photo", "id").(string), nil)
	if e.ph.count() != 1 {
		t.Fatal("deleted photo left in storage")
	}
}
