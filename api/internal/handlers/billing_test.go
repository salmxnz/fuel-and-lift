package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/stripe"
)

const webhookSecret = "whsec_test"

// fakeStripe is Stripe as far as the handlers can tell.
type fakeStripe struct {
	mu        sync.Mutex
	subs      map[string]stripe.Subscription
	checkouts []stripe.CheckoutParams
	portals   []string
	charges   map[string][]string // charge → subscriptions it paid
	cancelled []string
}

func (f *fakeStripe) CancelSubscription(_ context.Context, id, comment string) (stripe.Subscription, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, ok := f.subs[id]
	if !ok || s.Status == "canceled" {
		return s, &stripe.Error{Status: 400, Code: "resource_missing"}
	}
	s.Status = "canceled"
	s.CancellationDetails.Reason, s.CancellationDetails.Comment = "cancellation_requested", comment
	f.subs[id] = s
	f.cancelled = append(f.cancelled, id)
	return s, nil
}

func (f *fakeStripe) SubscriptionsForCharge(_ context.Context, chargeID, _ string) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.charges[chargeID], nil
}

func (f *fakeStripe) CreateCheckoutSession(_ context.Context, p stripe.CheckoutParams) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.checkouts = append(f.checkouts, p)
	return "https://checkout.stripe.test/c/cs_1", nil
}

func (f *fakeStripe) CreatePortalSession(_ context.Context, customerID, _ string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.portals = append(f.portals, customerID)
	return "https://billing.stripe.test/p/1", nil
}

func (f *fakeStripe) GetSubscription(_ context.Context, id string) (stripe.Subscription, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, ok := f.subs[id]
	if !ok {
		return s, &stripe.Error{Status: 404, Code: "resource_missing"}
	}
	return s, nil
}

func (f *fakeStripe) GetPrice(_ context.Context, id string) (stripe.Price, error) {
	p := stripe.Price{ID: id, Active: true, Currency: "usd"}
	p.Recurring = &struct {
		Interval      string `json:"interval"`
		IntervalCount int    `json:"interval_count"`
	}{Interval: "month", IntervalCount: 1}
	switch id {
	case "price_month":
		p.UnitAmount = 249
	case "price_year":
		p.UnitAmount, p.Recurring.Interval = 2490, "year"
	default:
		return p, &stripe.Error{Status: 404, Code: "resource_missing"}
	}
	return p, nil
}

func (f *fakeStripe) set(id, customer, userID, status string, end time.Time) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s := stripe.Subscription{ID: id, Customer: customer, Status: status, Metadata: map[string]string{}}
	if userID != "" {
		s.Metadata["user_id"] = userID
	}
	s.Items.Data = append(s.Items.Data, stripe.SubscriptionItem{CurrentPeriodEnd: end.Unix(), Price: monthlyPrice()})
	f.subs[id] = s
}

// put stores a subscription as given.
func (f *fakeStripe) put(s stripe.Subscription) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.subs[s.ID] = s
}

func (f *fakeStripe) ListCharges(_ context.Context, customerID string, _ int) ([]stripe.Charge, error) {
	if customerID == "cus_broken" {
		return nil, &stripe.Error{Status: 500, Message: "down"}
	}
	return []stripe.Charge{
		{ID: "ch_2", Amount: 2490, AmountRefunded: 2490, Currency: "usd", Status: "succeeded", Refunded: true, Created: 1_800_000_100, PaymentIntent: "pi_2"},
		{ID: "ch_1", Amount: 249, Currency: "usd", Status: "succeeded", Created: 1_800_000_000, ReceiptURL: "https://pay.stripe.test/receipts/1", PaymentIntent: "pi_1"},
	}, nil
}

func (f *fakeStripe) AccountID(context.Context) (string, error) { return "acct_test", nil }

func recurringPrice(id string, amount int64, interval string) stripe.Price {
	p := stripe.Price{ID: id, Active: true, Currency: "usd", UnitAmount: amount}
	p.Recurring = &struct {
		Interval      string `json:"interval"`
		IntervalCount int    `json:"interval_count"`
	}{Interval: interval, IntervalCount: 1}
	return p
}

func monthlyPrice() stripe.Price { return recurringPrice("price_month", 249, "month") }

// webhook sends a signed event the way Stripe would.
func (e *env) webhook(id, typ string, object obj, sign func([]byte) string) int {
	e.t.Helper()
	body, _ := json.Marshal(obj{"id": id, "type": typ, "data": obj{"object": object}})
	req, _ := http.NewRequest("POST", e.srv.URL+"/v1/billing/webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if sign == nil {
		sign = func(b []byte) string { return stripe.SignatureHeader(b, webhookSecret, time.Now()) }
	}
	req.Header.Set("Stripe-Signature", sign(body))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	res.Body.Close()
	return res.StatusCode
}

func TestBilling(t *testing.T) {
	e := setup(t)
	payer, _ := e.signIn("payer@x.test", false, "")

	// Without Stripe there's nothing to buy.
	if _, out := e.do(payer, "POST", "/v1/billing/checkout", nil); get(out, "error", "code") != "checkout_unavailable" {
		t.Fatalf("unconfigured checkout: %v", out)
	}
	if plans := get(e.must(payer, 200, "GET", "/v1/billing", nil), "plans").([]any); len(plans) != 0 {
		t.Fatalf("plans without Stripe: %v", plans)
	}
	if code := e.webhook("evt_0", "invoice.paid", obj{}, nil); code != 501 {
		t.Fatalf("unconfigured webhook = %d", code)
	}

	fake := &fakeStripe{subs: map[string]stripe.Subscription{}, charges: map[string][]string{}}
	e.h.Payments = fake
	e.h.Cfg.StripePriceMonthly = "price_month"
	e.h.Cfg.StripePriceYearly = "price_year"
	e.h.Cfg.StripeWebhookSecret = webhookSecret

	// No subscription yet: nothing to manage.
	if _, out := e.do(payer, "POST", "/v1/billing/portal", nil); get(out, "error", "code") != "no_subscription" {
		t.Fatalf("portal before paying: %v", out)
	}
	// The paywall shows both plans, priced by Stripe.
	plans := get(e.must(payer, 200, "GET", "/v1/billing", nil), "plans").([]any)
	if len(plans) != 2 || get(plans, 0, "id") != "monthly" || get(plans, 0, "amount") != 249.0 ||
		get(plans, 1, "id") != "yearly" || get(plans, 1, "amount") != 2490.0 || get(plans, 1, "interval") != "year" {
		t.Fatalf("plans: %v", plans)
	}
	e.must(payer, 400, "POST", "/v1/billing/checkout", obj{"plan": "weekly"})
	e.must(payer, 200, "POST", "/v1/billing/checkout", obj{"plan": "yearly"})
	if c := fake.checkouts[0]; c.PriceID != "price_year" {
		t.Fatalf("yearly checkout price %q", c.PriceID)
	}
	// No plan is monthly.
	if get(e.must(payer, 200, "POST", "/v1/billing/checkout", nil), "url") != "https://checkout.stripe.test/c/cs_1" {
		t.Fatal("no checkout url")
	}
	if c := fake.checkouts[1]; c.UserID != payer.id || c.Email != "payer@x.test" || c.PriceID != "price_month" ||
		c.CustomerID != "" || c.SuccessURL != "http://app.test/pro?checkout=success" {
		t.Fatalf("checkout params: %+v", c)
	}

	// Stripe says it's paid.
	end := time.Now().Add(30 * 24 * time.Hour).Truncate(time.Second)
	fake.set("sub_1", "cus_1", payer.id, "active", end)
	if code := e.webhook("evt_1", "checkout.session.completed",
		obj{"id": "cs_1", "client_reference_id": payer.id, "customer": "cus_1", "subscription": "sub_1"}, nil); code != 200 {
		t.Fatalf("checkout.session.completed = %d", code)
	}
	b := get(e.must(payer, 200, "GET", "/v1/billing", nil), "billing").(obj)
	if b["plan"] != "pro" || b["pro_source"] != "subscription" || get(b, "subscription", "status") != "active" ||
		get(b, "photo_estimates", "limit_this_month") != nil {
		t.Fatalf("after paying: %v", b)
	}
	if until, _ := time.Parse(time.RFC3339, b["pro_until"].(string)); !until.Equal(end) {
		t.Fatalf("pro_until %v, want %v", b["pro_until"], end)
	}

	// Forged, stale or replayed events change nothing.
	fake.set("sub_1", "cus_1", payer.id, "canceled", end)
	if code := e.webhook("evt_x", "customer.subscription.deleted", obj{"id": "sub_1"},
		func(b []byte) string { return stripe.SignatureHeader(b, "whsec_wrong", time.Now()) }); code != 400 {
		t.Fatalf("forged = %d", code)
	}
	if code := e.webhook("evt_y", "customer.subscription.deleted", obj{"id": "sub_1"},
		func(b []byte) string { return stripe.SignatureHeader(b, webhookSecret, time.Now().Add(-time.Hour)) }); code != 400 {
		t.Fatalf("stale = %d", code)
	}
	if code := e.webhook("evt_1", "checkout.session.completed", obj{"subscription": "sub_1"}, nil); code != 200 {
		t.Fatalf("replay = %d", code)
	}
	if get(e.must(payer, 200, "GET", "/v1/billing", nil), "billing", "plan") != "pro" {
		t.Fatal("a replayed event was handled again")
	}

	// Admins can't take paid Pro away: Stripe would just give it back.
	boss, _ := e.signIn("boss@x.test", true, "")
	e.must(boss, 400, "DELETE", "/v1/admin/users/"+payer.id+"/pro", nil)

	// Pro already: no second checkout, but the portal opens.
	if _, out := e.do(payer, "POST", "/v1/billing/checkout", nil); get(out, "error", "code") != "already_pro" {
		t.Fatalf("second checkout: %v", out)
	}
	e.must(payer, 200, "POST", "/v1/billing/portal", nil)
	if fake.portals[0] != "cus_1" {
		t.Fatalf("portal customer %v", fake.portals)
	}

	// Cancelled in the Customer Portal: Stripe schedules it with cancel_at
	// (cancel_at_period_end stays false). Pro runs to the end.
	fake.set("sub_1", "cus_1", payer.id, "active", end)
	fake.mu.Lock()
	s1 := fake.subs["sub_1"]
	s1.CancelAt = end.Unix()
	fake.subs["sub_1"] = s1
	fake.mu.Unlock()
	if code := e.webhook("evt_c1", "customer.subscription.updated", obj{"id": "sub_1"}, nil); code != 200 {
		t.Fatalf("portal cancel = %d", code)
	}
	b = get(e.must(payer, 200, "GET", "/v1/billing", nil), "billing").(obj)
	if b["plan"] != "pro" || get(b, "subscription", "cancel_at_period_end") != true {
		t.Fatalf("after a portal cancel: %v", b)
	}

	// A failed renewal keeps what was paid for; Stripe retries.
	fake.set("sub_1", "cus_1", payer.id, "past_due", end.Add(30*24*time.Hour))
	if code := e.webhook("evt_2", "invoice.payment_failed",
		obj{"customer": "cus_1", "parent": obj{"subscription_details": obj{"subscription": "sub_1"}}}, nil); code != 200 {
		t.Fatalf("payment_failed = %d", code)
	}
	b = get(e.must(payer, 200, "GET", "/v1/billing", nil), "billing").(obj)
	if until, _ := time.Parse(time.RFC3339, b["pro_until"].(string)); b["plan"] != "pro" || !until.Equal(end) ||
		get(b, "subscription", "status") != "past_due" {
		t.Fatalf("past due: %v", b)
	}
	if _, out := e.do(payer, "POST", "/v1/billing/checkout", nil); get(out, "error", "code") != "already_pro" {
		t.Fatalf("checkout while past due: %v", out)
	}

	// Cancelled: back to free, and a new checkout reuses the customer.
	fake.set("sub_1", "cus_1", payer.id, "canceled", end)
	if code := e.webhook("evt_3", "customer.subscription.deleted", obj{"id": "sub_1", "customer": "cus_1"}, nil); code != 200 {
		t.Fatalf("deleted = %d", code)
	}
	b = get(e.must(payer, 200, "GET", "/v1/billing", nil), "billing").(obj)
	if b["plan"] != "free" || b["pro_source"] != nil || get(b, "subscription", "status") != "canceled" {
		t.Fatalf("after cancel: %v", b)
	}
	e.must(payer, 200, "POST", "/v1/billing/checkout", nil)
	if c := fake.checkouts[len(fake.checkouts)-1]; c.CustomerID != "cus_1" {
		t.Fatalf("customer not reused: %+v", c)
	}

	// No metadata: the customer says who it is.
	fake.set("sub_2", "cus_1", "", "active", end)
	if code := e.webhook("evt_4", "customer.subscription.created", obj{"id": "sub_2", "customer": "cus_1"}, nil); code != 200 {
		t.Fatalf("created = %d", code)
	}
	if get(e.must(payer, 200, "GET", "/v1/billing", nil), "billing", "plan") != "pro" {
		t.Fatal("subscription found by customer didn't give Pro")
	}

	// Nobody we know, or a subscription Stripe no longer has.
	fake.set("sub_3", "cus_unknown", "", "active", end)
	if code := e.webhook("evt_5", "customer.subscription.created", obj{"id": "sub_3"}, nil); code != 200 {
		t.Fatalf("unknown customer = %d", code)
	}
	if code := e.webhook("evt_6", "customer.subscription.updated", obj{"id": "sub_gone"}, nil); code != 502 {
		t.Fatalf("missing subscription = %d, want a retry", code)
	}
	// Events we don't use are acknowledged.
	if code := e.webhook("evt_7", "customer.created", obj{"id": "cus_9"}, nil); code != 200 {
		t.Fatalf("other event = %d", code)
	}

	// Pro forever (admin, referrals) is never replaced or taken by a subscription.
	fake.set("sub_4", "cus_4", boss.id, "active", end)
	e.webhook("evt_8", "customer.subscription.created", obj{"id": "sub_4"}, nil)
	fake.set("sub_4", "cus_4", boss.id, "canceled", end)
	e.webhook("evt_9", "customer.subscription.deleted", obj{"id": "sub_4"}, nil)
	b = get(e.must(boss, 200, "GET", "/v1/billing", nil), "billing").(obj)
	if b["plan"] != "pro" || b["pro_source"] != "admin" || b["pro_until"] != nil {
		t.Fatalf("admin Pro after a subscription: %v", b)
	}
	if _, err := e.st.Pool.Exec(context.Background(),
		`update users set pro_source = 'referrals' where id = $1::uuid`, boss.id); err != nil {
		t.Fatal(err)
	}
	fake.set("sub_4", "cus_4", boss.id, "active", end)
	e.webhook("evt_10", "customer.subscription.updated", obj{"id": "sub_4"}, nil)
	if b := get(e.must(boss, 200, "GET", "/v1/billing", nil), "billing").(obj); b["pro_source"] != "referrals" || b["pro_until"] != nil {
		t.Fatalf("referral Pro after a subscription: %v", b)
	}

	// Someone else's subscription can't be moved onto you.
	fake.set("sub_2", "cus_1", boss.id, "active", end)
	if code := e.webhook("evt_11", "customer.subscription.updated", obj{"id": "sub_2"}, nil); code != 200 {
		t.Fatalf("hijack = %d", code)
	}
	var owner string
	if err := e.st.Pool.QueryRow(context.Background(),
		`select user_id::text from subscriptions where stripe_subscription_id = 'sub_2'`).Scan(&owner); err != nil || owner != payer.id {
		t.Fatalf("sub_2 owner %q %v", owner, err)
	}

	// Refunds, disputes and fraud warnings on a charge that paid for Pro.
	fake.charges["ch_1"] = []string{"sub_2"}
	if code := e.webhook("evt_12", "charge.refunded", obj{"id": "ch_1", "payment_intent": "pi_1", "refunded": false}, nil); code != 200 {
		t.Fatalf("partial refund = %d", code)
	}
	if get(e.must(payer, 200, "GET", "/v1/billing", nil), "billing", "plan") != "pro" || len(fake.cancelled) != 0 {
		t.Fatal("a partial refund ended Pro")
	}
	if code := e.webhook("evt_13", "charge.dispute.created", obj{"id": "dp_1", "charge": "ch_1", "payment_intent": nil}, nil); code != 200 {
		t.Fatalf("dispute = %d", code)
	}
	b = get(e.must(payer, 200, "GET", "/v1/billing", nil), "billing").(obj)
	if b["plan"] != "free" || get(b, "subscription", "status") != "canceled" || len(fake.cancelled) != 1 {
		t.Fatalf("after a dispute: %v, cancelled %v", b, fake.cancelled)
	}
	if fake.subs["sub_2"].CancellationDetails.Comment != "Cancelled by adebite: the payment was disputed" {
		t.Fatalf("cancel comment: %+v", fake.subs["sub_2"].CancellationDetails)
	}
	// Already cancelled: a fraud warning on the same charge cancels nothing twice.
	if code := e.webhook("evt_14", "radar.early_fraud_warning.created", obj{"id": "issfr_1", "charge": "ch_1"}, nil); code != 200 {
		t.Fatalf("early fraud warning = %d", code)
	}
	if len(fake.cancelled) != 1 {
		t.Fatalf("cancelled twice: %v", fake.cancelled)
	}
	// A charge that wasn't for a subscription.
	if code := e.webhook("evt_15", "charge.refunded", obj{"id": "ch_other", "refunded": true}, nil); code != 200 {
		t.Fatalf("other refund = %d", code)
	}
}
