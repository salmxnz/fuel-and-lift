package handlers_test

import (
	"strings"
	"testing"
)

// Every "Copy link" makes a new link, and open links can be copied again.
func TestInviteLinksCopyAgain(t *testing.T) {
	e := setup(t)
	me, _ := e.signIn("bhavish@x.test", false, "")
	e.must(me, 201, "POST", "/v1/onboarding", onboarding("Bhavish"))

	first := get(e.must(me, 201, "POST", "/v1/invite-links", obj{}), "invite_link").(map[string]any)
	second := get(e.must(me, 201, "POST", "/v1/invite-links", obj{}), "invite_link").(map[string]any)
	if first["url"] == second["url"] {
		t.Fatalf("two creates gave the same link: %v", first["url"])
	}

	urls := map[string]string{}
	for _, l := range get(e.must(me, 200, "GET", "/v1/invite-links", nil), "invite_links").([]any) {
		l := l.(map[string]any)
		u, _ := l["url"].(string)
		urls[l["id"].(string)] = u
	}
	if urls[first["id"].(string)] != first["url"] || urls[second["id"].(string)] != second["url"] {
		t.Fatalf("list doesn't give back the same links: %v", urls)
	}

	// A revoked link can't be copied; a used one neither.
	e.must(me, 204, "DELETE", "/v1/invite-links/"+second["id"].(string), nil)
	token := strings.TrimPrefix(first["url"].(string), "http://app.test/join/")
	ravi, _ := e.signIn("ravi@x.test", false, token)
	e.must(ravi, 201, "POST", "/v1/onboarding", onboarding("Ravi"))
	for _, l := range get(e.must(me, 200, "GET", "/v1/invite-links", nil), "invite_links").([]any) {
		if u, ok := l.(map[string]any)["url"]; ok && u != "" {
			t.Fatalf("closed link still has a url: %v", l)
		}
	}
}
