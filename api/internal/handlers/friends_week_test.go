package handlers_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

func (e *env) sentCount(u user, kind string) int {
	e.t.Helper()
	var n int
	if err := e.st.Pool.QueryRow(context.Background(),
		`select count(*) from notification_log where user_id = $1::uuid and kind = $2`, u.id, kind).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func TestFriendsWeekAndReminders(t *testing.T) {
	e := setup(t)
	mru, _ := time.LoadLocation("Indian/Mauritius")
	clock := time.Date(2026, 10, 25, 19, 5, 0, 0, mru) // a Sunday evening
	e.h.Now = func() time.Time { return clock }
	at := func(day, hour, min int) { clock = time.Date(2026, 10, day, hour, min, 0, 0, mru) }

	me, _ := e.signIn("bhavish@x.test", false, "")
	e.must(me, 201, "POST", "/v1/onboarding", onboarding("Bhavish"))
	ravi := e.friends(me, "ravi@x.test", "Ravi")
	stranger, _ := e.signIn("stranger@x.test", false, "")
	e.must(stranger, 201, "POST", "/v1/onboarding", onboarding("Stranger"))

	plan := get(e.must(ravi, 200, "GET", "/v1/goal", nil), "goal", "plan").(obj)
	kcal := plan["target_kcal"].(float64)
	protein := get(plan, "macros", "protein_g").(float64)
	// Monday to Friday on target, Saturday logged but way under, Sunday nothing.
	for d := 19; d <= 23; d++ {
		e.must(ravi, 201, "POST", fmt.Sprintf("/v1/days/2026-10-%d/entries", d), obj{"meal_name": "Plate", "name": "Plan", "kcal": kcal, "protein_g": protein})
	}
	e.must(ravi, 201, "POST", "/v1/days/2026-10-24/entries", obj{"meal_name": "Plate", "name": "Toast", "kcal": kcal / 2})

	// --- the Friends tab -------------------------------------------------------------
	wk := e.must(me, 200, "GET", "/v1/friends/week", nil)
	if get(wk, "me", "days_logged").(float64) != 0 || get(wk, "me", "week_start") != "2026-10-19" {
		t.Fatalf("my week: %v", get(wk, "me"))
	}
	friends := get(wk, "friends").([]any)
	if len(friends) != 1 || get(friends, 0, "person", "id") != ravi.id {
		t.Fatalf("friends: %v", friends)
	}
	s := get(friends, 0, "summary").(obj)
	if s["days_logged"].(float64) != 6 || s["days_on_target"].(float64) != 5 || s["days_protein_hit"].(float64) != 5 ||
		s["goal_hit"] != true || s["streak"].(float64) != 6 || s["workouts"].(float64) != 0 {
		t.Fatalf("ravi's week: %v", s)
	}
	if strings.Contains(fmt.Sprint(s), "kcal") {
		t.Fatalf("calories leaked into the summary: %v", s)
	}
	if get(e.must(me, 200, "GET", "/v1/people/"+ravi.id, nil), "summary", "goal_hit") != true {
		t.Fatal("a friend's profile should show their week")
	}
	if get(e.must(ravi, 200, "GET", "/v1/people/"+ravi.id, nil), "summary", "days_on_target").(float64) != 5 {
		t.Fatal("my own profile should show my week")
	}
	e.must(stranger, 404, "GET", "/v1/people/"+ravi.id, nil)

	// --- scheduled pushes ------------------------------------------------------------
	for _, u := range []user{me, ravi} {
		if err := e.st.SavePushSubscription(context.Background(), u.id, "https://push.test/"+u.id, "p256", "auth", ""); err != nil {
			t.Fatal(err)
		}
	}
	// Sunday 19:05: Bhavish hears Ravi hit their goal even while Ravi has no
	// device subscribed; Ravi's own recap waits for a device.
	if err := e.st.DeletePushSubscription(context.Background(), ravi.id, "https://push.test/"+ravi.id); err != nil {
		t.Fatal(err)
	}
	e.h.RemindOnce(context.Background())
	if e.sentCount(me, "friend_goal") != 1 || e.sentCount(ravi, "weekly_recap") != 0 {
		t.Fatal("friend goal without a device")
	}
	if err := e.st.SavePushSubscription(context.Background(), ravi.id, "https://push.test/"+ravi.id, "p256", "auth", ""); err != nil {
		t.Fatal(err)
	}
	e.h.RemindOnce(context.Background())
	e.h.RemindOnce(context.Background())
	if e.sentCount(ravi, "weekly_recap") != 1 || e.sentCount(me, "friend_goal") != 1 {
		t.Fatalf("recap %d, friend goal %d", e.sentCount(ravi, "weekly_recap"), e.sentCount(me, "friend_goal"))
	}
	if e.sentCount(me, "weekly_recap") != 0 || e.sentCount(ravi, "friend_goal") != 0 {
		t.Fatal("Bhavish logged nothing this week and hit no goal")
	}
	// 20:10: Ravi's 6-day streak is at risk; Bhavish has no streak.
	at(25, 20, 10)
	e.h.RemindOnce(context.Background())
	if e.sentCount(ravi, "streak_risk") != 1 || e.sentCount(me, "streak_risk") != 0 {
		t.Fatal("streak at risk")
	}

	// Meal reminders need a time on the meal and meal_nudges on.
	slots := get(e.must(ravi, 200, "GET", "/v1/meal-slots", nil), "meal_slots").([]any)
	lunch := get(slots, 1, "id").(string)
	e.must(ravi, 400, "PATCH", "/v1/meal-slots/"+lunch, obj{"remind_at": "25:00"})
	if get(e.must(ravi, 200, "PATCH", "/v1/meal-slots/"+lunch, obj{"remind_at": "12:30"}), "meal_slot", "remind_at") != "12:30" {
		t.Fatal("remind_at didn't stick")
	}
	myBreakfast := get(e.must(me, 200, "GET", "/v1/meal-slots", nil), "meal_slots", 0, "id").(string)
	e.must(me, 200, "PATCH", "/v1/meal-slots/"+myBreakfast, obj{"remind_at": "12:00"})
	for _, u := range []user{me, ravi} {
		prefs := get(e.must(u, 200, "GET", "/v1/notification-prefs", nil), "prefs").(obj)
		prefs["meal_nudges"] = true
		e.must(u, 200, "PUT", "/v1/notification-prefs", prefs)
	}
	at(26, 12, 40) // Monday
	e.must(me, 201, "POST", "/v1/days/2026-10-26/entries", obj{"meal_slot_id": myBreakfast, "name": "Eggs", "kcal": 300})
	e.h.RemindOnce(context.Background())
	e.h.RemindOnce(context.Background())
	if e.sentCount(ravi, "meal") != 1 {
		t.Fatalf("ravi's lunch reminder sent %d times", e.sentCount(ravi, "meal"))
	}
	if e.sentCount(me, "meal") != 0 {
		t.Fatal("Bhavish already logged breakfast")
	}
	// Clearing the time stops it.
	if get(e.must(ravi, 200, "PATCH", "/v1/meal-slots/"+lunch, obj{"remind_at": nil}), "meal_slot", "remind_at") != nil {
		t.Fatal("remind_at didn't clear")
	}

	// Monday 08:05 is weigh-in day on the default weekly cadence.
	at(26, 8, 5)
	e.must(me, 201, "POST", "/v1/weigh-ins", obj{"weight_kg": 54})
	e.h.RemindOnce(context.Background())
	if e.sentCount(ravi, "weigh_in") != 1 || e.sentCount(me, "weigh_in") != 0 {
		t.Fatal("weigh-in reminder")
	}

	// --- sharing switch ---------------------------------------------------------------
	e.must(ravi, 200, "PUT", "/v1/sharing", obj{"workouts": true, "records": true, "food_streaks": true, "weekly_summary": false})
	at(25, 19, 5)
	if get(e.must(me, 200, "GET", "/v1/friends/week", nil), "friends", 0, "summary") != nil {
		t.Fatal("summary visible after sharing was switched off")
	}
	if get(e.must(me, 200, "GET", "/v1/people/"+ravi.id, nil), "summary") != nil {
		t.Fatal("profile summary visible after sharing was switched off")
	}
	// An older app that doesn't know the switch leaves it alone.
	e.must(ravi, 200, "PUT", "/v1/sharing", obj{"workouts": true})
	if get(e.must(ravi, 200, "GET", "/v1/sharing", nil), "sharing", "weekly_summary") != false {
		t.Fatal("weekly_summary flipped back on")
	}
}

func tinyPNG(t *testing.T) []byte {
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestAvatar(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	google := store.GoogleSignIn{Subject: "sub-a", Email: "a@x.test", Name: "a", AvatarURL: "https://lh3.test/a.jpg"}
	u, _, err := e.st.SignInWithGoogle(ctx, google)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := e.signIn("a@x.test", false, "")
	if u.AvatarURL == nil || *u.AvatarURL != google.AvatarURL {
		t.Fatalf("google picture: %v", u.AvatarURL)
	}

	pic := tinyPNG(t)
	e.must(user{}, 401, "POST", "/v1/profile/avatar", obj{"media_type": "image/png", "data": base64.StdEncoding.EncodeToString(pic)})
	e.must(a, 400, "POST", "/v1/profile/avatar", obj{"media_type": "image/png", "data": base64.StdEncoding.EncodeToString([]byte("<html>hi</html>"))})
	e.must(a, 400, "POST", "/v1/profile/avatar", obj{"media_type": "image/gif", "data": base64.StdEncoding.EncodeToString(pic)})
	up := e.must(a, 200, "POST", "/v1/profile/avatar", obj{"media_type": "image/jpeg", "data": base64.StdEncoding.EncodeToString(pic)})
	url := get(up, "user", "avatar_url").(string)
	if !strings.HasPrefix(url, "http://app.test/avatars/"+a.id+"?v=") {
		t.Fatalf("avatar url %q", url)
	}

	res, err := http.Get(e.srv.URL + "/v1/avatars/" + a.id)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	// Served as what the bytes are, not the label sent.
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/png" || !bytes.Equal(body, pic) ||
		!strings.Contains(res.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("GET avatar: %d %v", res.StatusCode, res.Header)
	}

	// Signing in again keeps the uploaded photo.
	if u, _, err = e.st.SignInWithGoogle(ctx, google); err != nil || u.AvatarURL == nil || *u.AvatarURL != url {
		t.Fatalf("sign-in replaced the photo: %v %v", u.AvatarURL, err)
	}

	if get(e.must(a, 200, "DELETE", "/v1/profile/avatar", nil), "user", "avatar_url") != google.AvatarURL {
		t.Fatal("removing the photo should bring back the Google picture")
	}
	res, err = http.Get(e.srv.URL + "/v1/avatars/" + a.id)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 404 {
		t.Fatalf("deleted avatar: %d", res.StatusCode)
	}
}
