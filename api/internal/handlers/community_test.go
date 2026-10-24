package handlers_test

import (
	"strings"
	"testing"
)

// friends makes b a friend of a through an invite link.
func (e *env) friends(a user, email, name string) user {
	e.t.Helper()
	link := e.must(a, 201, "POST", "/v1/invite-links", obj{})
	token := strings.TrimPrefix(get(link, "invite_link", "url").(string), "http://app.test/join/")
	b, err := e.signIn(email, false, token)
	if err != nil {
		e.t.Fatal(err)
	}
	e.must(b, 201, "POST", "/v1/onboarding", onboarding(name))
	return b
}

func onboardingWith(name string, split any, days []string) obj {
	o := onboarding(name)
	o["split"] = split
	o["gym_days"] = days
	return o
}

func byID(list []any, id string) obj {
	for _, x := range list {
		if get(x, "id") == id {
			return x.(obj)
		}
	}
	return nil
}

func TestSplits(t *testing.T) {
	e := setup(t)
	e.must(user{}, 401, "GET", "/v1/splits", nil)

	me, _ := e.signIn("bhavish@x.test", false, "")
	splits := get(e.must(me, 200, "GET", "/v1/splits", nil), "splits").([]any)
	if len(splits) != 5 || get(splits, 2, "key") != "ppl" || get(splits, 2, "min_days").(float64) != 3 {
		t.Fatalf("splits: %v", splits)
	}

	// Bad input is refused before anything is saved.
	e.must(me, 400, "POST", "/v1/onboarding", onboardingWith("Bhavish", "yoga", nil))
	e.must(me, 400, "POST", "/v1/onboarding", onboardingWith("Bhavish", "ppl", []string{"mon", "wed"}))
	e.must(me, 400, "POST", "/v1/onboarding", onboardingWith("Bhavish", nil, []string{"mon", "mon"}))
	e.must(me, 400, "POST", "/v1/onboarding", onboardingWith("Bhavish", nil, []string{"funday"}))

	// PPL on Mon/Wed/Fri: three workouts, a routine, and the week.
	e.must(me, 201, "POST", "/v1/onboarding", onboardingWith("Bhavish", "ppl", []string{"fri", "mon", "wed"}))
	tpls := get(e.must(me, 200, "GET", "/v1/templates", nil), "templates").([]any)
	if len(tpls) != 3 {
		t.Fatalf("ppl templates: %v", tpls)
	}
	plan := get(e.must(me, 200, "GET", "/v1/weekly-plan", nil), "days").(obj)
	name := func(id any) any {
		if id == nil {
			return nil
		}
		return get(byID(tpls, id.(string)), "name")
	}
	if name(plan["mon"]) != "Push" || name(plan["wed"]) != "Pull" || name(plan["fri"]) != "Legs" || plan["tue"] != nil {
		t.Fatalf("ppl week: %v", plan)
	}
	routines := get(e.must(me, 200, "GET", "/v1/routines", nil), "routines").([]any)
	if len(routines) != 1 || get(routines, 0, "preset") != "ppl" || get(routines, 0, "visibility") != "private" ||
		get(routines, 0, "days", "wed", "name") != "Pull" {
		t.Fatalf("ppl routine: %v", routines)
	}

	// No split, but gym days: the two starters, alternating.
	you, _ := e.signIn("ravi@x.test", false, "")
	e.must(you, 201, "POST", "/v1/onboarding", onboardingWith("Ravi", nil, []string{"tue", "thu", "sat"}))
	tpls = get(e.must(you, 200, "GET", "/v1/templates", nil), "templates").([]any)
	plan = get(e.must(you, 200, "GET", "/v1/weekly-plan", nil), "days").(obj)
	if len(tpls) != 2 || name(plan["tue"]) != "Upper-1" || name(plan["thu"]) != "Lower-1" || name(plan["sat"]) != "Upper-1" {
		t.Fatalf("starters on days: %v %v", tpls, plan)
	}
	if n := len(get(e.must(you, 200, "GET", "/v1/routines", nil), "routines").([]any)); n != 0 {
		t.Fatalf("no split should make no routine: %d", n)
	}

	// Every preset resolves every exercise in the library.
	for _, sp := range splits {
		key := get(sp, "key").(string)
		e.must(you, 400, "POST", "/v1/splits/"+key+"/apply", obj{"days": []string{"mon"}})
		res := e.must(you, 201, "POST", "/v1/splits/"+key+"/apply", obj{"apply_to_week": false})
		all := get(e.must(you, 200, "GET", "/v1/templates", nil), "templates").([]any)
		for _, d := range []string{"mon", "tue", "wed", "thu", "fri", "sat", "sun"} {
			day := get(res, "routine", "days", d)
			if day == nil {
				continue
			}
			tpl := byID(all, get(day, "template_id").(string))
			for _, w := range get(sp, "workouts").([]any) {
				if get(w, "name") == get(tpl, "name") && len(get(w, "exercises").([]any)) != len(get(tpl, "blocks").([]any)) {
					t.Errorf("%s / %s: %d of %d exercises found", key, get(w, "name"), len(get(tpl, "blocks").([]any)), len(get(w, "exercises").([]any)))
				}
			}
		}
	}
	// apply_to_week false left the week alone.
	if after := get(e.must(you, 200, "GET", "/v1/weekly-plan", nil), "days").(obj); after["tue"] != plan["tue"] {
		t.Fatalf("week changed: %v", after)
	}
	e.must(you, 404, "POST", "/v1/splits/nope/apply", obj{})
	applied := e.must(you, 201, "POST", "/v1/splits/bro/apply", obj{"days": []string{"mon", "tue", "wed", "thu", "fri", "sat"}})
	if get(applied, "days", "sat") != get(applied, "routine", "days", "mon", "template_id") {
		t.Fatalf("bro on 6 days should repeat chest: %v", get(applied, "days"))
	}
}

func TestRoutines(t *testing.T) {
	e := setup(t)
	me, _ := e.signIn("bhavish@x.test", false, "")
	e.must(me, 201, "POST", "/v1/onboarding", onboarding("Bhavish"))
	ravi := e.friends(me, "ravi@x.test", "Ravi")
	stranger, _ := e.signIn("stranger@x.test", false, "")
	e.must(stranger, 201, "POST", "/v1/onboarding", onboarding("Stranger"))

	tpls := get(e.must(me, 200, "GET", "/v1/templates", nil), "templates").([]any)
	lower, upper := get(tpls, 0, "id").(string), get(tpls, 1, "id").(string) // sorted by name
	own := get(e.must(me, 201, "POST", "/v1/exercises", obj{"name": "Banded pull-apart"}), "exercise", "id").(string)
	extra := get(e.must(me, 201, "POST", "/v1/templates", obj{"name": "Arms", "blocks": []obj{
		{"exercise_id": own, "sets": []obj{{"target_reps": 15}}},
	}}), "template", "id").(string)
	theirs := get(e.must(stranger, 200, "GET", "/v1/templates", nil), "templates", 0, "id").(string)

	e.must(me, 400, "POST", "/v1/routines", obj{"name": ""})
	e.must(me, 400, "POST", "/v1/routines", obj{"name": "x", "days": obj{"funday": upper}})
	e.must(me, 400, "POST", "/v1/routines", obj{"name": "x", "visibility": "everyone"})
	e.must(me, 404, "POST", "/v1/routines", obj{"name": "Mine", "days": obj{"mon": theirs}})

	empty := get(e.must(me, 201, "POST", "/v1/routines", obj{"name": "Empty"}), "routine", "id").(string)
	e.must(me, 400, "POST", "/v1/routines/"+empty+"/apply", obj{})

	rt := e.must(me, 201, "POST", "/v1/routines", obj{"name": "Upper Lower", "description": "  4 days  ",
		"days": obj{"mon": upper, "tue": lower, "thu": upper, "fri": extra}})
	id := get(rt, "routine", "id").(string)
	if get(rt, "routine", "description") != "4 days" || get(rt, "routine", "days", "tue", "name") != "Lower-1" || get(rt, "routine", "days", "wed") != nil {
		t.Fatalf("routine: %v", rt)
	}
	e.must(stranger, 404, "GET", "/v1/routines/"+id, nil)
	e.must(stranger, 404, "POST", "/v1/routines/"+id+"/apply", obj{})

	days := get(e.must(me, 200, "POST", "/v1/routines/"+id+"/apply", obj{}), "days").(obj)
	if days["mon"] != upper || days["tue"] != lower || days["fri"] != extra || days["sun"] != nil {
		t.Fatalf("applied week: %v", days)
	}

	// Removing a workout takes it off the routine too.
	e.must(me, 204, "DELETE", "/v1/templates/"+lower, nil)
	if get(e.must(me, 200, "GET", "/v1/routines/"+id, nil), "routine", "days", "tue") != nil {
		t.Fatal("archived workout still in routine")
	}

	// Share it: the friend gets the routine and copies of its workouts.
	e.must(me, 403, "POST", "/v1/routines/"+id+"/share", obj{"friend_ids": []string{stranger.id}})
	e.must(me, 201, "POST", "/v1/routines/"+id+"/share", obj{"friend_ids": []string{ravi.id}})
	inbox := get(e.must(ravi, 200, "GET", "/v1/shares?kind=routine", nil), "shares").([]any)
	if len(inbox) != 1 || get(inbox, 0, "routine", "name") != "Upper Lower" || len(get(inbox, 0, "routine", "workouts").([]any)) != 2 ||
		get(inbox, 0, "routine", "workouts", 0, "blocks") != nil {
		t.Fatalf("routine share: %v", inbox)
	}
	got := e.must(ravi, 201, "POST", "/v1/shares/"+get(inbox, 0, "id").(string)+"/accept", obj{})
	if get(got, "routine", "days", "mon", "name") != "Upper-1 (Bhavish)" || get(got, "routine", "days", "fri", "name") != "Arms" ||
		get(got, "routine", "days", "mon", "template_id") != get(got, "routine", "days", "thu", "template_id") {
		t.Fatalf("accepted routine: %v", got)
	}
	arms := get(e.must(ravi, 200, "GET", "/v1/templates/"+get(got, "routine", "days", "fri", "template_id").(string), nil), "template")
	if get(arms, "blocks", 0, "exercise", "name") != "Banded pull-apart" {
		t.Fatalf("custom exercise not recreated: %v", arms)
	}

	e.must(me, 204, "DELETE", "/v1/routines/"+id, nil)
	e.must(me, 404, "GET", "/v1/routines/"+id, nil)
}

func TestShop(t *testing.T) {
	e := setup(t)
	me, _ := e.signIn("bhavish@x.test", false, "")
	e.must(me, 201, "POST", "/v1/onboarding", onboarding("Bhavish"))
	ravi := e.friends(me, "ravi@x.test", "Ravi")
	stranger, _ := e.signIn("stranger@x.test", false, "")
	e.must(stranger, 201, "POST", "/v1/onboarding", onboarding("Stranger"))
	admin, _ := e.signIn("admin@x.test", true, "")

	shop := func(u user, query string) []any {
		t.Helper()
		return get(e.must(u, 200, "GET", "/v1/shop?"+query, nil), "items").([]any)
	}

	lib := get(e.must(me, 200, "GET", "/v1/exercises?q=bench", nil), "exercises", 0, "id").(string)
	own := get(e.must(me, 201, "POST", "/v1/exercises", obj{"name": "Banded pull-apart"}), "exercise", "id").(string)
	tpl := get(e.must(me, 201, "POST", "/v1/templates", obj{"name": "Upper 100%", "blocks": []obj{
		{"exercise_id": lib, "sets": []obj{{"target_kg": 60, "target_reps": 8}}},
		{"exercise_id": own, "sets": []obj{{"target_reps": 15}}},
	}}), "template")
	tplID := get(tpl, "id").(string)
	if get(tpl, "visibility") != "private" || get(tpl, "copied_from") != nil {
		t.Fatalf("new template: %v", tpl)
	}
	meal := get(e.must(me, 201, "POST", "/v1/saved-meals", obj{"name": "Usual breakfast", "items": []obj{
		{"name": "Oats", "grams": 80, "kcal": 300, "protein_g": 10, "carbs_g": 54, "fat_g": 5},
	}}), "saved_meal", "id").(string)

	// --- private is nobody's business -------------------------------------------
	e.must(me, 400, "GET", "/v1/shop", nil)
	e.must(me, 400, "PUT", "/v1/templates/"+tplID+"/visibility", obj{"visibility": "everyone"})
	for _, u := range []user{ravi, stranger} {
		if n := len(shop(u, "kind=template")) + len(shop(u, "kind=meal")); n != 0 {
			t.Fatalf("private items listed: %d", n)
		}
		e.must(u, 404, "GET", "/v1/shop/template/"+tplID, nil)
		e.must(u, 404, "POST", "/v1/shop/template/"+tplID+"/add", obj{})
	}
	e.must(stranger, 404, "GET", "/v1/people/"+me.id, nil)
	e.must(ravi, 200, "GET", "/v1/people/"+me.id, nil) // a friend, nothing shared yet

	// --- friends only -------------------------------------------------------------
	vis := e.must(me, 200, "PUT", "/v1/saved-meals/"+meal+"/visibility", obj{"visibility": "friends"})
	if vis["visibility"] != "friends" || vis["published_at"] == nil {
		t.Fatalf("visibility: %v", vis)
	}
	e.must(stranger, 404, "PUT", "/v1/saved-meals/"+meal+"/visibility", obj{"visibility": "private"})
	if items := shop(ravi, "kind=meal"); len(items) != 1 || get(items, 0, "creator", "name") != "Bhavish" ||
		get(items, 0, "macros", "kcal").(float64) != 300 || get(items, 0, "names", 0) != "Oats" {
		t.Fatalf("friend's shop: %v", items)
	}
	if len(shop(stranger, "kind=meal")) != 0 {
		t.Fatal("stranger sees a friends-only meal")
	}
	e.must(stranger, 404, "GET", "/v1/shop/meal/"+meal, nil)
	d := e.must(ravi, 200, "GET", "/v1/shop/meal/"+meal, nil)
	if get(d, "saved_meal", "default_meal_slot_id") != nil || get(d, "item", "mine") != false {
		t.Fatalf("meal detail: %v", d)
	}

	// --- public ----------------------------------------------------------------------
	e.must(me, 200, "PUT", "/v1/templates/"+tplID+"/visibility", obj{"visibility": "public"})
	items := shop(stranger, "kind=template")
	if len(items) != 1 || get(items, 0, "names", 1) != "Banded pull-apart" || get(items, 0, "added") != false {
		t.Fatalf("public template: %v", items)
	}
	if len(shop(me, "kind=template")) != 0 {
		t.Fatal("my own items aren't in my shop")
	}
	if len(shop(stranger, "kind=template&q=UPP")) != 1 || len(shop(stranger, "kind=template&q=zzz")) != 0 ||
		len(shop(stranger, "kind=template&q=0%25")) != 1 || len(shop(stranger, "kind=template&q=%25%25x")) != 0 {
		t.Fatal("search")
	}
	det := e.must(stranger, 200, "GET", "/v1/shop/template/"+tplID, nil)
	if get(det, "template", "blocks", 1, "exercise", "name") != "Banded pull-apart" {
		t.Fatalf("someone else's custom exercise should resolve: %v", det)
	}
	person := e.must(stranger, 200, "GET", "/v1/people/"+me.id, nil)
	if person["is_friend"] != false || len(person["templates"].([]any)) != 1 || len(person["meals"].([]any)) != 0 {
		t.Fatalf("stranger's view of me: %v", person)
	}
	person = e.must(ravi, 200, "GET", "/v1/people/"+me.id, nil)
	if person["is_friend"] != true || person["friends_since"] == nil || len(person["meals"].([]any)) != 1 {
		t.Fatalf("friend's view of me: %v", person)
	}
	if mine := e.must(me, 200, "GET", "/v1/people/"+me.id, nil); mine["is_me"] != true || len(mine["templates"].([]any)) != 1 {
		t.Fatalf("my view of me: %v", mine)
	}
	e.must(me, 404, "GET", "/v1/people/"+stranger.id, nil) // nothing public, not a friend

	// --- add to mine -----------------------------------------------------------------
	e.must(me, 409, "POST", "/v1/shop/template/"+tplID+"/add", obj{})
	cp := get(e.must(stranger, 201, "POST", "/v1/shop/template/"+tplID+"/add", obj{}), "template")
	if get(cp, "visibility") != "private" || get(cp, "copied_from", "name") != "Bhavish" ||
		get(cp, "blocks", 1, "exercise", "name") != "Banded pull-apart" || get(cp, "blocks", 0, "sets", 0, "target_kg").(float64) != 60 {
		t.Fatalf("copy: %v", cp)
	}
	e.must(stranger, 201, "POST", "/v1/shop/template/"+tplID+"/add", obj{})
	items = shop(stranger, "kind=template")
	if get(items, 0, "add_count").(float64) != 1 || get(items, 0, "added") != true {
		t.Fatalf("adds count once per person: %v", items)
	}
	e.must(ravi, 201, "POST", "/v1/shop/meal/"+meal+"/add", obj{})
	saved := get(e.must(ravi, 200, "GET", "/v1/saved-meals", nil), "saved_meals").([]any)
	if len(saved) != 1 || get(saved, 0, "copied_from", "id") != me.id || get(saved, 0, "default_meal_slot_id") != nil {
		t.Fatalf("meal copy: %v", saved)
	}

	// Most added first.
	second := get(e.must(me, 201, "POST", "/v1/templates", obj{"name": "Legs", "visibility": "public", "blocks": []obj{}}), "template")
	if get(second, "visibility") != "public" {
		t.Fatalf("visibility on create: %v", second)
	}
	if get(shop(ravi, "kind=template&sort=new"), 0, "name") != "Legs" || get(shop(ravi, "kind=template&sort=popular"), 0, "name") != "Upper 100%" {
		t.Fatal("sort")
	}

	// --- routines ------------------------------------------------------------------
	rt := get(e.must(me, 201, "POST", "/v1/routines", obj{"name": "Bro week", "visibility": "public",
		"days": obj{"mon": tplID, "wed": get(second, "id"), "fri": tplID}}), "routine", "id").(string)
	ri := shop(stranger, "kind=routine")
	if len(ri) != 1 || get(ri, 0, "days", "wed") != "Legs" || len(get(ri, 0, "names").([]any)) != 2 {
		t.Fatalf("routine card: %v", ri)
	}
	rd := e.must(stranger, 200, "GET", "/v1/shop/routine/"+rt, nil)
	if len(get(rd, "routine", "templates").([]any)) != 2 {
		t.Fatalf("routine detail: %v", rd)
	}
	rc := get(e.must(stranger, 201, "POST", "/v1/shop/routine/"+rt+"/add", obj{}), "routine")
	if get(rc, "copied_from", "name") != "Bhavish" || get(rc, "days", "mon", "template_id") != get(rc, "days", "fri", "template_id") ||
		get(rc, "days", "mon", "name") != "Upper 100% (Bhavish)" {
		t.Fatalf("routine copy: %v", rc)
	}

	// --- unfriending hides friends-only things right away ---------------------------
	e.must(me, 204, "DELETE", "/v1/friends/"+ravi.id, nil)
	if len(shop(ravi, "kind=meal")) != 0 {
		t.Fatal("ex-friend still sees a friends-only meal")
	}
	e.must(ravi, 404, "GET", "/v1/shop/meal/"+meal, nil)

	// --- moderation --------------------------------------------------------------------
	e.must(stranger, 400, "POST", "/v1/shop/template/"+tplID+"/report", obj{"reason": "boring"})
	e.must(me, 404, "POST", "/v1/shop/template/"+tplID+"/report", obj{"reason": "spam"})
	e.must(stranger, 404, "POST", "/v1/shop/meal/"+meal+"/report", obj{"reason": "spam"})
	e.must(stranger, 201, "POST", "/v1/shop/template/"+tplID+"/report", obj{"reason": "spam", "note": "ad for a supplement"})
	e.must(stranger, 201, "POST", "/v1/shop/template/"+tplID+"/report", obj{"reason": "spam"})
	e.must(ravi, 201, "POST", "/v1/shop/template/"+tplID+"/report", obj{"reason": "offensive"})
	e.must(stranger, 403, "GET", "/v1/admin/reports", nil)
	e.must(stranger, 403, "POST", "/v1/admin/shop/template/"+tplID+"/hide", obj{})
	reports := get(e.must(admin, 200, "GET", "/v1/admin/reports", nil), "reports").([]any)
	if len(reports) != 1 || get(reports, 0, "count").(float64) != 2 || get(reports, 0, "reasons", "spam").(float64) != 1 ||
		get(reports, 0, "notes", 0) != "ad for a supplement" || get(reports, 0, "creator", "name") != "Bhavish" {
		t.Fatalf("reports: %v", reports)
	}
	e.must(admin, 200, "POST", "/v1/admin/shop/template/"+tplID+"/hide", obj{})
	if len(shop(stranger, "kind=template")) != 1 { // only "Legs" left
		t.Fatal("hidden template still listed")
	}
	e.must(stranger, 404, "GET", "/v1/shop/template/"+tplID, nil)
	e.must(stranger, 404, "POST", "/v1/shop/template/"+tplID+"/add", obj{})
	if get(e.must(admin, 200, "GET", "/v1/shop/template/"+tplID, nil), "item", "hidden") != true {
		t.Fatal("admins can still open hidden items")
	}
	if !get(byID(get(e.must(me, 200, "GET", "/v1/templates", nil), "templates").([]any), tplID), "hidden").(bool) {
		t.Fatal("the owner should see their item is hidden")
	}
	if n := len(get(e.must(admin, 200, "GET", "/v1/admin/reports", nil), "reports").([]any)); n != 0 {
		t.Fatalf("hiding should resolve reports: %d", n)
	}
	e.must(admin, 200, "DELETE", "/v1/admin/shop/template/"+tplID+"/hide", nil)
	if len(shop(stranger, "kind=template")) != 2 {
		t.Fatal("unhidden template should be back")
	}
	e.must(stranger, 201, "POST", "/v1/shop/template/"+tplID+"/report", obj{"reason": "other"})
	e.must(admin, 204, "POST", "/v1/admin/shop/template/"+tplID+"/dismiss", obj{})
	if n := len(get(e.must(admin, 200, "GET", "/v1/admin/reports", nil), "reports").([]any)); n != 0 {
		t.Fatalf("dismissed reports still open: %d", n)
	}
	e.must(admin, 404, "POST", "/v1/admin/shop/nope/"+tplID+"/hide", obj{})
}
