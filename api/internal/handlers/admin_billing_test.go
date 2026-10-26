package handlers_test

import (
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/stripe"
)

func TestAdminBilling(t *testing.T) {
	e := setup(t)
	admin, _ := e.signIn("boss@x.test", true, "")
	member, _ := e.signIn("member@x.test", false, "")
	e.must(member, 403, "GET", "/v1/admin/billing", nil)

	// Without Stripe: an empty overview that says so.
	out := e.must(admin, 200, "GET", "/v1/admin/billing", nil)
	if get(out, "stripe", "configured") != false || get(out, "total") != 0.0 || len(get(out, "summary", "mrr").([]any)) != 0 {
		t.Fatalf("unconfigured: %v", out)
	}

	fake := &fakeStripe{subs: map[string]stripe.Subscription{}, charges: map[string][]string{}}
	e.h.Payments = fake
	e.h.Cfg.StripeSecretKey = "sk_test_123"
	e.h.Cfg.StripePriceMonthly = "price_month"
	e.h.Cfg.StripeWebhookSecret = webhookSecret

	now := time.Now().Truncate(time.Second)
	end := now.Add(30 * 24 * time.Hour)
	sub := func(id, customer, userID, status string, price stripe.Price, edit func(*stripe.Subscription)) {
		s := stripe.Subscription{ID: id, Customer: customer, Status: status, StartDate: now.Add(-24 * time.Hour).Unix(),
			Metadata: map[string]string{"user_id": userID}}
		s.Items.Data = []stripe.SubscriptionItem{{CurrentPeriodEnd: end.Unix(), Price: price}}
		if edit != nil {
			edit(&s)
		}
		fake.put(s)
		if code := e.webhook("evt_"+id, "customer.subscription.updated", obj{"id": id}, nil); code != 200 {
			t.Fatalf("webhook %s = %d", id, code)
		}
	}
	yearly := recurringPrice("price_year", 2490, "year")

	ann, _ := e.signIn("ann@x.test", false, "")
	bob, _ := e.signIn("bob@x.test", false, "")
	cat, _ := e.signIn("cat@x.test", false, "")
	dan, _ := e.signIn("dan@x.test", false, "")
	sub("sub_ann", "cus_ann", ann.id, "active", monthlyPrice(), nil)
	sub("sub_bob", "cus_bob", bob.id, "active", yearly, func(s *stripe.Subscription) {
		// Cancelled in the Customer Portal, with feedback.
		s.CancelAt, s.CanceledAt = end.Unix(), now.Unix()
		s.CancellationDetails.Reason, s.CancellationDetails.Feedback, s.CancellationDetails.Comment =
			"cancellation_requested", "too_expensive", "Too much for me right now"
	})
	sub("sub_cat", "cus_cat", cat.id, "past_due", monthlyPrice(), nil)
	sub("sub_dan", "cus_broken", dan.id, "canceled", monthlyPrice(), func(s *stripe.Subscription) {
		s.EndedAt, s.CanceledAt = now.Unix(), now.Unix()
		s.CancellationDetails.Reason = "payment_disputed"
	})

	out = e.must(admin, 200, "GET", "/v1/admin/billing", nil)
	sum := get(out, "summary").(obj)
	for k, want := range map[string]float64{"active": 1, "cancelling": 1, "past_due": 1, "ended_30d": 1, "new_30d": 4, "monthly": 2, "yearly": 1} {
		if sum[k] != want {
			t.Errorf("summary %s = %v, want %v", k, sum[k], want)
		}
	}
	// Two monthly at $2.49 and a twelfth of $24.90.
	if mrr := get(sum, "mrr").([]any); len(mrr) != 1 || get(mrr, 0, "currency") != "usd" || get(mrr, 0, "amount") != 706.0 {
		t.Fatalf("mrr: %v", mrr)
	}
	if get(out, "total") != 4.0 || get(out, "stripe", "mode") != "test" ||
		get(out, "stripe", "dashboard_url") != "https://dashboard.stripe.com/acct_test/test" {
		t.Fatalf("overview: %v", out)
	}

	// Filters.
	list := get(e.must(admin, 200, "GET", "/v1/admin/billing?status=cancelling", nil), "subscriptions").([]any)
	if len(list) != 1 || get(list, 0, "id") != "sub_bob" || get(list, 0, "user", "email") != "bob@x.test" ||
		get(list, 0, "cancel_feedback") != "too_expensive" || get(list, 0, "interval") != "year" || get(list, 0, "amount") != 2490.0 {
		t.Fatalf("cancelling: %v", list)
	}
	for status, want := range map[string]string{"active": "sub_ann", "past_due": "sub_cat", "ended": "sub_dan"} {
		list := get(e.must(admin, 200, "GET", "/v1/admin/billing?status="+status, nil), "subscriptions").([]any)
		if len(list) != 1 || get(list, 0, "id") != want {
			t.Errorf("%s: %v", status, list)
		}
	}
	if list := get(e.must(admin, 200, "GET", "/v1/admin/billing?q=cat%40", nil), "subscriptions").([]any); len(list) != 1 {
		t.Fatalf("search: %v", list)
	}
	e.must(admin, 400, "GET", "/v1/admin/billing?status=lapsed", nil)

	// One user's billing tab: the subscription with why it's ending, and payments.
	ub := e.must(admin, 200, "GET", "/v1/admin/users/"+bob.id+"/billing", nil)
	s0 := get(ub, "subscriptions", 0).(obj)
	if get(ub, "customer_id") != "cus_bob" || s0["status"] != "active" || s0["cancel_at_period_end"] != true ||
		s0["cancel_comment"] != "Too much for me right now" || s0["canceled_at"] == nil || s0["started_at"] == nil ||
		get(ub, "billing", "plan") != "pro" {
		t.Fatalf("bob: %v", ub)
	}
	pays := get(ub, "payments").([]any)
	if len(pays) != 2 || get(pays, 0, "refunded") != true || get(pays, 1, "receipt_url") != "https://pay.stripe.test/receipts/1" ||
		get(pays, 0, "payment_intent") != "pi_2" {
		t.Fatalf("payments: %v", pays)
	}
	// Stripe failing doesn't break the tab.
	ub = e.must(admin, 200, "GET", "/v1/admin/users/"+dan.id+"/billing", nil)
	if get(ub, "payments") != nil || get(ub, "payments_error") == nil || get(ub, "subscriptions", 0, "cancel_reason") != "payment_disputed" {
		t.Fatalf("dan: %v", ub)
	}
	// Never paid.
	ub = e.must(admin, 200, "GET", "/v1/admin/users/"+member.id+"/billing", nil)
	if get(ub, "customer_id") != nil || len(get(ub, "subscriptions").([]any)) != 0 || len(get(ub, "payments").([]any)) != 0 {
		t.Fatalf("member: %v", ub)
	}

	// Refresh from Stripe: picks up a change whose webhook never came.
	fake.mu.Lock()
	ann0 := fake.subs["sub_ann"]
	ann0.CancelAt, ann0.CanceledAt = end.Unix(), now.Unix()
	ann0.CancellationDetails.Feedback = "unused"
	fake.subs["sub_ann"] = ann0
	fake.mu.Unlock()
	synced := e.must(admin, 200, "POST", "/v1/admin/users/"+ann.id+"/billing/sync", nil)
	if get(synced, "subscriptions", 0, "cancel_at_period_end") != true || get(synced, "subscriptions", 0, "cancel_feedback") != "unused" {
		t.Fatalf("synced: %v", synced)
	}
	e.must(member, 403, "POST", "/v1/admin/users/"+ann.id+"/billing/sync", nil)

	// What the user sees of it on their own billing.
	mine := get(e.must(bob, 200, "GET", "/v1/billing", nil), "billing", "subscription").(obj)
	if mine["interval"] != "year" || mine["amount"] != 2490.0 || mine["cancel_comment"] != nil || mine["canceled_at"] == nil {
		t.Fatalf("bob's own subscription: %v", mine)
	}
}
