package stripe

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestParseWebhook(t *testing.T) {
	const secret = "whsec_test"
	now := time.Unix(1_800_000_000, 0)
	body := []byte(`{"id":"evt_1","type":"invoice.paid","data":{"object":{"id":"in_1","customer":"cus_1","parent":{"subscription_details":{"subscription":"sub_1","metadata":{"user_id":"u1"}}}}}}`)

	ev, err := ParseWebhook(body, SignatureHeader(body, secret, now), secret, now)
	if err != nil {
		t.Fatal(err)
	}
	if ev.ID != "evt_1" || ev.Type != "invoice.paid" {
		t.Fatalf("event: %+v", ev)
	}
	if r := ev.Refs(); r != (Refs{UserID: "u1", CustomerID: "cus_1", SubscriptionID: "sub_1"}) {
		t.Fatalf("refs: %+v", r)
	}

	// A rotated secret signs twice: either v1 is enough.
	two := "t=1800000000,v1=00ff," + SignatureHeader(body, secret, now)[len("t=1800000000,"):]
	if _, err := ParseWebhook(body, two, secret, now); err != nil {
		t.Fatalf("second signature: %v", err)
	}

	bad := map[string]struct {
		body   []byte
		header string
		secret string
		now    time.Time
	}{
		"tampered":   {[]byte(`{"id":"evt_2"}`), SignatureHeader(body, secret, now), secret, now},
		"old":        {body, SignatureHeader(body, secret, now), secret, now.Add(Tolerance + time.Second)},
		"wrong key":  {body, SignatureHeader(body, "whsec_other", now), secret, now},
		"no header":  {body, "", secret, now},
		"no secret":  {body, SignatureHeader(body, "", now), "", now},
		"v0 only":    {body, "t=1800000000,v0=abcd", secret, now},
		"no t value": {body, "v1=abcd", secret, now},
	}
	for name, c := range bad {
		if _, err := ParseWebhook(c.body, c.header, c.secret, c.now); !errors.Is(err, ErrBadSignature) {
			t.Errorf("%s: err = %v, want ErrBadSignature", name, err)
		}
	}
}

func TestRefs(t *testing.T) {
	ev := func(typ, obj string) Event {
		var e Event
		e.Type = typ
		e.Data.Object = json.RawMessage(obj)
		return e
	}
	cases := map[string]struct {
		ev   Event
		want Refs
	}{
		"checkout": {ev("checkout.session.completed", `{"id":"cs_1","client_reference_id":"u1","customer":"cus_1","subscription":"sub_1"}`),
			Refs{UserID: "u1", CustomerID: "cus_1", SubscriptionID: "sub_1"}},
		"subscription": {ev("customer.subscription.updated", `{"id":"sub_1","customer":{"id":"cus_1"},"metadata":{"user_id":"u1"}}`),
			Refs{UserID: "u1", CustomerID: "cus_1", SubscriptionID: "sub_1"}},
		"old invoice": {ev("invoice.payment_failed", `{"id":"in_1","customer":"cus_1","subscription":"sub_1"}`),
			Refs{CustomerID: "cus_1", SubscriptionID: "sub_1"}},
		"refund": {ev("charge.refunded", `{"id":"ch_1","payment_intent":"pi_1","refunded":true,"customer":"cus_1"}`),
			Refs{CustomerID: "cus_1", ChargeID: "ch_1", PaymentIntentID: "pi_1", FullyRefunded: true}},
		"dispute": {ev("charge.dispute.created", `{"id":"dp_1","charge":"ch_1","payment_intent":null}`),
			Refs{ChargeID: "ch_1"}},
		"fraud warning": {ev("radar.early_fraud_warning.created", `{"id":"issfr_1","charge":"ch_1","payment_intent":"pi_1"}`),
			Refs{ChargeID: "ch_1", PaymentIntentID: "pi_1"}},
		"other": {ev("customer.created", `{"id":"cus_1"}`), Refs{}},
	}
	for name, c := range cases {
		if got := c.ev.Refs(); got != c.want {
			t.Errorf("%s: %+v, want %+v", name, got, c.want)
		}
	}
}

func TestPeriodEnd(t *testing.T) {
	var s Subscription
	if err := json.Unmarshal([]byte(`{"id":"sub_1","items":{"data":[{"current_period_end":1800000000}]}}`), &s); err != nil {
		t.Fatal(err)
	}
	if got := s.PeriodEnd(); !got.Equal(time.Unix(1_800_000_000, 0)) {
		t.Fatalf("items period end: %v", got)
	}
	s = Subscription{CurrentPeriodEnd: 1_700_000_000}
	if got := s.PeriodEnd(); !got.Equal(time.Unix(1_700_000_000, 0)) {
		t.Fatalf("legacy period end: %v", got)
	}

	// Cancelled in the Customer Portal: cancel_at is the period end.
	for _, c := range []struct {
		s    Subscription
		want bool
	}{
		{Subscription{CurrentPeriodEnd: 1_700_000_000}, false},
		{Subscription{CurrentPeriodEnd: 1_700_000_000, CancelAtPeriodEnd: true}, true},
		{Subscription{CurrentPeriodEnd: 1_700_000_000, CancelAt: 1_700_000_000}, true},
		{Subscription{CurrentPeriodEnd: 1_700_000_000, CancelAt: 1_800_000_000}, false}, // renews first
	} {
		if got := c.s.EndsAtPeriodEnd(); got != c.want {
			t.Errorf("%+v: EndsAtPeriodEnd = %v, want %v", c.s, got, c.want)
		}
	}
}

func TestClient(t *testing.T) {
	var got url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if user, _, _ := r.BasicAuth(); user != "sk_test" || r.Header.Get("Stripe-Version") != APIVersion {
			w.WriteHeader(401)
			return
		}
		switch {
		case r.Method == "POST" && r.URL.Path == "/v1/checkout/sessions":
			_ = r.ParseForm()
			got = r.PostForm
			_, _ = w.Write([]byte(`{"id":"cs_1","url":"https://checkout.stripe.com/c/cs_1"}`))
		case r.Method == "GET" && r.URL.Path == "/v1/charges/ch_1":
			_, _ = w.Write([]byte(`{"id":"ch_1","payment_intent":"pi_1"}`))
		case r.Method == "GET" && r.URL.Path == "/v1/invoice_payments":
			q := r.URL.Query()
			if q.Get("payment[type]") != "payment_intent" || q.Get("payment[payment_intent]") != "pi_1" || q.Get("status") != "paid" {
				w.WriteHeader(400)
				return
			}
			if q.Get("starting_after") == "" {
				_, _ = w.Write([]byte(`{"data":[{"id":"inpay_1","invoice":"in_1"}],"has_more":true}`))
			} else {
				_, _ = w.Write([]byte(`{"data":[{"id":"inpay_2","invoice":"in_2"}],"has_more":false}`))
			}
		case r.Method == "GET" && r.URL.Path == "/v1/invoices/in_1":
			_, _ = w.Write([]byte(`{"id":"in_1","parent":{"type":"subscription_details","subscription_details":{"subscription":"sub_1"}}}`))
		case r.Method == "GET" && r.URL.Path == "/v1/invoices/in_2":
			_, _ = w.Write([]byte(`{"id":"in_2","parent":{"type":"quote_details"}}`))
		case r.Method == "DELETE" && r.URL.Path == "/v1/subscriptions/sub_1":
			if r.URL.Query().Get("cancellation_details[comment]") != "Refunded" {
				w.WriteHeader(400)
				return
			}
			_, _ = w.Write([]byte(`{"id":"sub_1","customer":"cus_1","status":"canceled"}`))
		case r.Method == "GET" && r.URL.Path == "/v1/prices/price_1":
			_, _ = w.Write([]byte(`{"id":"price_1","active":true,"currency":"usd","unit_amount":2490,"recurring":{"interval":"year","interval_count":1}}`))
		case r.Method == "GET" && r.URL.Path == "/v1/subscriptions/sub_1":
			_, _ = w.Write([]byte(`{"id":"sub_1","customer":"cus_1","status":"active","items":{"data":[{"current_period_end":1800000000}]}}`))
		default:
			w.WriteHeader(404)
			_, _ = w.Write([]byte(`{"error":{"type":"invalid_request_error","code":"resource_missing","message":"No such thing"}}`))
		}
	}))
	defer srv.Close()
	c := &Client{Key: "sk_test", BaseURL: srv.URL}
	ctx := context.Background()

	u, err := c.CreateCheckoutSession(ctx, CheckoutParams{UserID: "u1", Email: "a@x.test", PriceID: "price_1",
		SuccessURL: "https://app.test/pro?checkout=success", CancelURL: "https://app.test/pro", ManagedPayments: true})
	if err != nil || u != "https://checkout.stripe.com/c/cs_1" {
		t.Fatalf("checkout: %q %v", u, err)
	}
	for k, v := range map[string]string{
		"mode": "subscription", "line_items[0][price]": "price_1", "client_reference_id": "u1",
		"subscription_data[metadata][user_id]": "u1", "customer_email": "a@x.test", "managed_payments[enabled]": "true",
	} {
		if got.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, got.Get(k), v)
		}
	}

	s, err := c.GetSubscription(ctx, "sub_1")
	if err != nil || s.Status != "active" || s.Customer != "cus_1" {
		t.Fatalf("subscription: %+v %v", s, err)
	}
	p, err := c.GetPrice(ctx, "price_1")
	if err != nil || p.UnitAmount != 2490 || p.Recurring == nil || p.Recurring.Interval != "year" {
		t.Fatalf("price: %+v %v", p, err)
	}

	subs, err := c.SubscriptionsForCharge(ctx, "ch_1", "")
	if err != nil || len(subs) != 1 || subs[0] != "sub_1" {
		t.Fatalf("subscriptions for charge: %v %v", subs, err)
	}
	if s, err := c.CancelSubscription(ctx, "sub_1", "Refunded"); err != nil || s.Status != "canceled" {
		t.Fatalf("cancel: %+v %v", s, err)
	}
	if got.Get("integration_identifier") != IntegrationID {
		t.Errorf("integration_identifier = %q", got.Get("integration_identifier"))
	}

	var se *Error
	if _, err := c.GetSubscription(ctx, "sub_2"); !errors.As(err, &se) || se.Status != 404 || se.Code != "resource_missing" {
		t.Fatalf("missing: %v", err)
	}
	if _, err := c.GetSubscription(ctx, "../customers"); err == nil {
		t.Fatal("a path in the id should be refused")
	}
}
