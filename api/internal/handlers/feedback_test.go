package handlers_test

import (
	"encoding/base64"
	"strconv"
	"strings"
	"testing"
)

func TestFeedback(t *testing.T) {
	e := setup(t)
	me, ravi := friends(t, e)
	admin, _ := e.signIn("boss@x.test", true, "")
	pic := base64.StdEncoding.EncodeToString(tinyPNG(t))

	e.must(ravi, 400, "POST", "/v1/feedback", obj{"message": "  "})
	e.must(ravi, 400, "POST", "/v1/feedback", obj{"message": "x", "kind": "rant"})
	e.must(ravi, 400, "POST", "/v1/feedback", obj{"message": "x", "images": []obj{{"media_type": "image/png", "data": base64.StdEncoding.EncodeToString([]byte("<html>"))}}})
	e.must(ravi, 400, "POST", "/v1/feedback", obj{"message": "x", "images": []obj{{"media_type": "image/png", "data": pic}, {"media_type": "image/png", "data": pic}, {"media_type": "image/png", "data": pic}, {"media_type": "image/png", "data": pic}}})

	sent := e.must(ravi, 201, "POST", "/v1/feedback", obj{"kind": "bug", "message": "The rest timer froze on Pec deck", "page": "/gym/session/x",
		"images": []obj{{"media_type": "image/png", "data": pic}, {"media_type": "image/jpeg", "data": pic}}})
	if get(sent, "feedback", "status") != "new" || len(get(sent, "feedback", "photos").([]any)) != 2 || e.ph.count() != 2 ||
		!strings.HasPrefix(get(sent, "feedback", "photos", 0, "url").(string), "https://photos.test/feedback/"+ravi.id+"/") {
		t.Fatalf("sent: %v", sent)
	}
	id := int(get(sent, "feedback", "id").(float64))
	e.must(me, 201, "POST", "/v1/feedback", obj{"kind": "idea", "message": "Dark mode please"})

	// Each person sees only their own.
	mine := get(e.must(ravi, 200, "GET", "/v1/feedback", nil), "feedback").([]any)
	if len(mine) != 1 || get(mine[0], "message") != "The rest timer froze on Pec deck" {
		t.Fatalf("ravi's feedback: %v", mine)
	}

	// Admins see everyone's, filter it and triage it.
	e.must(ravi, 403, "GET", "/v1/admin/feedback", nil)
	all := e.must(admin, 200, "GET", "/v1/admin/feedback", nil)
	if list := get(all, "feedback").([]any); len(list) != 2 || get(list[0], "user", "name") != "Bhavish" || get(all, "counts", "new").(float64) != 2 {
		t.Fatalf("admin list: %v", all)
	}
	if list := get(e.must(admin, 200, "GET", "/v1/admin/feedback?kind=bug", nil), "feedback").([]any); len(list) != 1 {
		t.Fatalf("bugs: %v", list)
	}
	page := e.must(admin, 200, "GET", "/v1/admin/feedback?limit=1", nil)
	if get(page, "next_before") == nil {
		t.Fatalf("no next page: %v", page)
	}
	e.must(admin, 400, "PATCH", "/v1/admin/feedback/"+strconv.Itoa(id), obj{"status": "closed"})
	e.must(admin, 404, "PATCH", "/v1/admin/feedback/999999", obj{"status": "done"})
	done := e.must(admin, 200, "PATCH", "/v1/admin/feedback/"+strconv.Itoa(id), obj{"status": "done", "admin_note": "Fixed in the next release"})
	if get(done, "feedback", "status") != "done" || get(done, "feedback", "admin_note") != "Fixed in the next release" {
		t.Fatalf("patched: %v", done)
	}
	// The sender sees the reply.
	if mine := get(e.must(ravi, 200, "GET", "/v1/feedback", nil), "feedback").([]any); get(mine[0], "admin_note") != "Fixed in the next release" {
		t.Fatalf("reply not shown: %v", mine)
	}
}
