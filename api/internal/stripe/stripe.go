// Package stripe is a small client for the parts of Stripe's REST API that paid
// Pro uses: Checkout, the Customer Portal and subscriptions, plus webhook
// signature checks. No SDK: form-encoded requests over net/http.
package stripe

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// APIVersion is pinned so a dashboard upgrade can't change the shapes below.
// Managed Payments needs 2026-04-22.dahlia or later. Set the webhook
// endpoint to the same version so events arrive in these shapes.
const APIVersion = "2026-09-30.endive"

// IntegrationID tags our Checkout Sessions so the Dashboard can tell this
// flow apart (Stripe asks for a label ending in 8 random letters).
const IntegrationID = "adebite_pro_qzmvtkrw"

// Client calls Stripe with a secret key.
type Client struct {
	Key     string
	BaseURL string // https://api.stripe.com unless a test points it elsewhere
	HTTP    *http.Client
}

// New returns a client for the live API.
func New(key string) *Client {
	return &Client{Key: key, BaseURL: "https://api.stripe.com", HTTP: &http.Client{Timeout: 20 * time.Second}}
}

// Error is an error response from Stripe.
type Error struct {
	Status  int
	Type    string
	Code    string
	Message string
}

func (e *Error) Error() string {
	return fmt.Sprintf("stripe: %d %s %s: %s", e.Status, e.Type, e.Code, e.Message)
}

// CheckoutParams describes a Checkout Session for a Pro subscription.
type CheckoutParams struct {
	UserID     string
	Email      string // prefilled when there's no Customer yet
	CustomerID string // reused so one person keeps one Customer
	PriceID    string
	SuccessURL string
	CancelURL  string
	// ManagedPayments makes Stripe the merchant of record (it then handles
	// sales tax, VAT and GST). The account must be eligible and the product
	// needs an eligible tax code.
	ManagedPayments bool
}

// CreateCheckoutSession starts a subscription checkout and returns its URL.
func (c *Client) CreateCheckoutSession(ctx context.Context, p CheckoutParams) (string, error) {
	f := url.Values{}
	f.Set("mode", "subscription")
	f.Set("line_items[0][price]", p.PriceID)
	f.Set("line_items[0][quantity]", "1")
	f.Set("success_url", p.SuccessURL)
	f.Set("cancel_url", p.CancelURL)
	f.Set("client_reference_id", p.UserID)
	f.Set("metadata[user_id]", p.UserID)
	f.Set("subscription_data[metadata][user_id]", p.UserID)
	f.Set("integration_identifier", IntegrationID)
	if p.CustomerID != "" {
		f.Set("customer", p.CustomerID)
	} else if p.Email != "" {
		f.Set("customer_email", p.Email)
	}
	if p.ManagedPayments {
		f.Set("managed_payments[enabled]", "true")
	}
	var out struct {
		URL string `json:"url"`
	}
	if err := c.call(ctx, http.MethodPost, "/v1/checkout/sessions", f, &out); err != nil {
		return "", err
	}
	return out.URL, nil
}

// CreatePortalSession returns a Customer Portal URL where the customer can
// change their card or cancel.
func (c *Client) CreatePortalSession(ctx context.Context, customerID, returnURL string) (string, error) {
	f := url.Values{}
	f.Set("customer", customerID)
	f.Set("return_url", returnURL)
	var out struct {
		URL string `json:"url"`
	}
	if err := c.call(ctx, http.MethodPost, "/v1/billing_portal/sessions", f, &out); err != nil {
		return "", err
	}
	return out.URL, nil
}

// Price is a recurring price: amount is in the currency's minor unit (cents).
type Price struct {
	ID         string `json:"id"`
	Active     bool   `json:"active"`
	Currency   string `json:"currency"`
	UnitAmount int64  `json:"unit_amount"`
	Recurring  *struct {
		Interval      string `json:"interval"` // day, week, month, year
		IntervalCount int    `json:"interval_count"`
	} `json:"recurring"`
}

// GetPrice fetches a price.
func (c *Client) GetPrice(ctx context.Context, id string) (Price, error) {
	var p Price
	if id == "" || strings.ContainsAny(id, "/?#") {
		return p, fmt.Errorf("stripe: bad price id %q", id)
	}
	err := c.call(ctx, http.MethodGet, "/v1/prices/"+id, nil, &p)
	return p, err
}

// Subscription is the part of a Stripe subscription that decides Pro, plus
// what the admin app shows about it.
type Subscription struct {
	ID                string            `json:"id"`
	Customer          string            `json:"customer"`
	Status            string            `json:"status"` // active, trialing, past_due, unpaid, paused, canceled, incomplete, incomplete_expired
	CancelAtPeriodEnd bool              `json:"cancel_at_period_end"`
	CancelAt          int64             `json:"cancel_at"`   // when a cancellation is scheduled, 0 if none
	CanceledAt        int64             `json:"canceled_at"` // when it was cancelled (or the cancellation asked for)
	EndedAt           int64             `json:"ended_at"`
	StartDate         int64             `json:"start_date"`
	Livemode          bool              `json:"livemode"`
	Metadata          map[string]string `json:"metadata"`
	// Why it was cancelled: reason is Stripe's (cancellation_requested,
	// payment_failed, payment_disputed); feedback and comment are the
	// customer's, from the Customer Portal.
	CancellationDetails struct {
		Reason   string `json:"reason"`
		Feedback string `json:"feedback"`
		Comment  string `json:"comment"`
	} `json:"cancellation_details"`
	// Since 2025-03-31.basil the period lives on each item; older versions
	// had it on the subscription.
	CurrentPeriodEnd int64 `json:"current_period_end"`
	Items            struct {
		Data []SubscriptionItem `json:"data"`
	} `json:"items"`
}

// SubscriptionItem is one line of a subscription (Pro has one).
type SubscriptionItem struct {
	CurrentPeriodEnd int64 `json:"current_period_end"`
	Price            Price `json:"price"`
}

// Plan is the subscription's (first) price; zero when it has none.
func (s Subscription) Plan() Price {
	if len(s.Items.Data) == 0 {
		return Price{}
	}
	return s.Items.Data[0].Price
}

// PeriodEnd is when the period that's been paid for ends.
func (s Subscription) PeriodEnd() time.Time {
	end := s.CurrentPeriodEnd
	for _, it := range s.Items.Data {
		if it.CurrentPeriodEnd > end {
			end = it.CurrentPeriodEnd
		}
	}
	return time.Unix(end, 0).UTC()
}

// EndsAtPeriodEnd reports whether the subscription won't renew. The Customer
// Portal now schedules a cancellation by setting cancel_at to the period end
// and leaves cancel_at_period_end false, so both count.
func (s Subscription) EndsAtPeriodEnd() bool {
	return s.CancelAtPeriodEnd || (s.CancelAt > 0 && s.CancelAt <= s.PeriodEnd().Unix())
}

// GetSubscription fetches a subscription as it is now.
func (c *Client) GetSubscription(ctx context.Context, id string) (Subscription, error) {
	var s Subscription
	if id == "" || strings.ContainsAny(id, "/?#") {
		return s, fmt.Errorf("stripe: bad subscription id %q", id)
	}
	err := c.call(ctx, http.MethodGet, "/v1/subscriptions/"+id, nil, &s)
	return s, err
}

// CancelSubscription ends a subscription now (no proration, no final invoice)
// and returns it as it is after. comment is kept as its
// cancellation_details.comment, to say why.
func (c *Client) CancelSubscription(ctx context.Context, id, comment string) (Subscription, error) {
	var s Subscription
	if !safeID(id) {
		return s, fmt.Errorf("stripe: bad subscription id %q", id)
	}
	path := "/v1/subscriptions/" + id
	if comment != "" {
		q := url.Values{}
		q.Set("cancellation_details[comment]", comment)
		path += "?" + q.Encode()
	}
	err := c.call(ctx, http.MethodDelete, path, nil, &s)
	return s, err
}

// SubscriptionsForCharge finds the subscriptions a charge paid for, through
// Stripe's object graph (basil and later): the charge's PaymentIntent, the
// invoices it paid, and the subscription each invoice is for. paymentIntentID
// may be empty; it's then read from the charge. A charge that wasn't for a
// subscription gives none.
func (c *Client) SubscriptionsForCharge(ctx context.Context, chargeID, paymentIntentID string) ([]string, error) {
	if paymentIntentID == "" {
		if !safeID(chargeID) {
			return nil, nil
		}
		var ch struct {
			PaymentIntent json.RawMessage `json:"payment_intent"`
		}
		if err := c.call(ctx, http.MethodGet, "/v1/charges/"+chargeID, nil, &ch); err != nil {
			return nil, err
		}
		paymentIntentID = idOf(ch.PaymentIntent)
		if paymentIntentID == "" {
			return nil, nil
		}
	}
	var invoices []string
	after := ""
	for page := 0; page < 10; page++ {
		q := url.Values{}
		q.Set("payment[type]", "payment_intent")
		q.Set("payment[payment_intent]", paymentIntentID)
		q.Set("status", "paid")
		q.Set("limit", "100")
		if after != "" {
			q.Set("starting_after", after)
		}
		var list struct {
			Data []struct {
				ID      string          `json:"id"`
				Invoice json.RawMessage `json:"invoice"`
			} `json:"data"`
			HasMore bool `json:"has_more"`
		}
		if err := c.call(ctx, http.MethodGet, "/v1/invoice_payments?"+q.Encode(), nil, &list); err != nil {
			return nil, err
		}
		for _, p := range list.Data {
			if id := idOf(p.Invoice); id != "" {
				invoices = append(invoices, id)
			}
		}
		if !list.HasMore || len(list.Data) == 0 {
			break
		}
		after = list.Data[len(list.Data)-1].ID
	}
	var subs []string
	for _, id := range invoices {
		if !safeID(id) {
			continue
		}
		var inv struct {
			Parent struct {
				Type                string `json:"type"`
				SubscriptionDetails struct {
					Subscription json.RawMessage `json:"subscription"`
				} `json:"subscription_details"`
			} `json:"parent"`
		}
		if err := c.call(ctx, http.MethodGet, "/v1/invoices/"+id, nil, &inv); err != nil {
			return nil, err
		}
		if inv.Parent.Type == "subscription_details" {
			if sub := idOf(inv.Parent.SubscriptionDetails.Subscription); sub != "" {
				subs = append(subs, sub)
			}
		}
	}
	return subs, nil
}

// safeID refuses ids that would change the request path.
func safeID(id string) bool { return id != "" && !strings.ContainsAny(id, "/?#&") }

func (c *Client) call(ctx context.Context, method, path string, form url.Values, out any) error {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, body)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.Key, "")
	req.Header.Set("Stripe-Version", APIVersion)
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	httpc := c.HTTP
	if httpc == nil {
		httpc = http.DefaultClient
	}
	res, err := httpc.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode >= 300 {
		var e struct {
			Error struct {
				Type    string `json:"type"`
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(raw, &e)
		return &Error{Status: res.StatusCode, Type: e.Error.Type, Code: e.Error.Code, Message: e.Error.Message}
	}
	return json.Unmarshal(raw, out)
}

// Charge is a payment attempt, as the admin app shows it.
type Charge struct {
	ID             string `json:"id"`
	Amount         int64  `json:"amount"`
	AmountRefunded int64  `json:"amount_refunded"`
	Currency       string `json:"currency"`
	Status         string `json:"status"` // succeeded, pending, failed
	Refunded       bool   `json:"refunded"`
	Disputed       bool   `json:"disputed"`
	Created        int64  `json:"created"`
	Description    string `json:"description"`
	FailureMessage string `json:"failure_message"`
	ReceiptURL     string `json:"receipt_url"`
	PaymentIntent  string `json:"payment_intent"`
}

// ListCharges returns a customer's most recent charges, newest first.
func (c *Client) ListCharges(ctx context.Context, customerID string, limit int) ([]Charge, error) {
	if !safeID(customerID) {
		return nil, fmt.Errorf("stripe: bad customer id %q", customerID)
	}
	q := url.Values{}
	q.Set("customer", customerID)
	q.Set("limit", strconv.Itoa(limit))
	var list struct {
		Data []struct {
			Charge
			PaymentIntent json.RawMessage `json:"payment_intent"`
		} `json:"data"`
	}
	if err := c.call(ctx, http.MethodGet, "/v1/charges?"+q.Encode(), nil, &list); err != nil {
		return nil, err
	}
	out := make([]Charge, 0, len(list.Data))
	for _, d := range list.Data {
		ch := d.Charge
		ch.PaymentIntent = idOf(d.PaymentIntent)
		out = append(out, ch)
	}
	return out, nil
}

// AccountID returns the id of the account the key belongs to (acct_...).
func (c *Client) AccountID(ctx context.Context) (string, error) {
	var a struct {
		ID string `json:"id"`
	}
	err := c.call(ctx, http.MethodGet, "/v1/account", nil, &a)
	return a.ID, err
}

// --- webhooks ----------------------------------------------------------------------

// ErrBadSignature means a webhook didn't come from Stripe (or is too old).
var ErrBadSignature = errors.New("stripe: bad webhook signature")

// Tolerance is how old a signed webhook may be, against replays.
const Tolerance = 5 * time.Minute

// Event is a webhook event.
type Event struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Data struct {
		Object json.RawMessage `json:"object"`
	} `json:"data"`
}

// ParseWebhook checks the Stripe-Signature header against the raw body and
// decodes the event. The header is "t=<unix>,v1=<hex hmac>[,v1=...]", signed
// over "<t>.<body>" with the endpoint's secret.
func ParseWebhook(payload []byte, header, secret string, now time.Time) (Event, error) {
	var ev Event
	if secret == "" {
		return ev, ErrBadSignature
	}
	var ts int64
	var sigs [][]byte
	for _, part := range strings.Split(header, ",") {
		k, v, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch k {
		case "t":
			ts, _ = strconv.ParseInt(v, 10, 64)
		case "v1":
			if b, err := hex.DecodeString(v); err == nil {
				sigs = append(sigs, b)
			}
		}
	}
	if ts == 0 || len(sigs) == 0 {
		return ev, ErrBadSignature
	}
	if age := now.Sub(time.Unix(ts, 0)); age > Tolerance || age < -Tolerance {
		return ev, ErrBadSignature
	}
	want := Sign(payload, secret, ts)
	ok := false
	for _, s := range sigs {
		if hmac.Equal(s, want) {
			ok = true
		}
	}
	if !ok {
		return ev, ErrBadSignature
	}
	if err := json.Unmarshal(payload, &ev); err != nil {
		return ev, fmt.Errorf("stripe: bad event: %w", err)
	}
	return ev, nil
}

// Sign is the v1 signature of payload at ts (tests use it to sign events).
func Sign(payload []byte, secret string, ts int64) []byte {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(strconv.FormatInt(ts, 10)))
	m.Write([]byte("."))
	m.Write(payload)
	return m.Sum(nil)
}

// SignatureHeader builds a Stripe-Signature header for payload (for tests).
func SignatureHeader(payload []byte, secret string, ts time.Time) string {
	return fmt.Sprintf("t=%d,v1=%s", ts.Unix(), hex.EncodeToString(Sign(payload, secret, ts.Unix())))
}

// Refs are the ids an event's object points at; empty when it has none.
type Refs struct {
	UserID         string // ours, from client_reference_id or metadata
	CustomerID     string
	SubscriptionID string
	// Refunds, disputes and early fraud warnings point at a charge instead.
	ChargeID        string
	PaymentIntentID string
	FullyRefunded   bool // charge.refunded for the whole amount
}

// Refs reads the user, customer and subscription out of a Checkout Session,
// subscription or invoice event.
func (e Event) Refs() Refs {
	var o struct {
		ID                string            `json:"id"`
		ClientReferenceID string            `json:"client_reference_id"`
		Customer          json.RawMessage   `json:"customer"`
		Subscription      json.RawMessage   `json:"subscription"`
		Metadata          map[string]string `json:"metadata"`
		Charge            json.RawMessage   `json:"charge"`
		PaymentIntent     json.RawMessage   `json:"payment_intent"`
		Refunded          bool              `json:"refunded"`
		Parent            struct {
			SubscriptionDetails struct {
				Subscription json.RawMessage   `json:"subscription"`
				Metadata     map[string]string `json:"metadata"`
			} `json:"subscription_details"`
		} `json:"parent"`
	}
	_ = json.Unmarshal(e.Data.Object, &o)
	r := Refs{CustomerID: idOf(o.Customer), UserID: o.Metadata["user_id"]}
	switch {
	case strings.HasPrefix(e.Type, "checkout.session."):
		r.SubscriptionID = idOf(o.Subscription)
		if o.ClientReferenceID != "" {
			r.UserID = o.ClientReferenceID
		}
	case strings.HasPrefix(e.Type, "customer.subscription."):
		r.SubscriptionID = o.ID
	case strings.HasPrefix(e.Type, "invoice."):
		// Before basil the invoice had `subscription`; since, it's under parent.
		r.SubscriptionID = idOf(o.Subscription)
		if r.SubscriptionID == "" {
			r.SubscriptionID = idOf(o.Parent.SubscriptionDetails.Subscription)
		}
		if id := o.Parent.SubscriptionDetails.Metadata["user_id"]; id != "" {
			r.UserID = id
		}
	case strings.HasPrefix(e.Type, "charge.dispute."), strings.HasPrefix(e.Type, "radar.early_fraud_warning."):
		r.ChargeID, r.PaymentIntentID = idOf(o.Charge), idOf(o.PaymentIntent)
	case strings.HasPrefix(e.Type, "charge."):
		r.ChargeID, r.PaymentIntentID, r.FullyRefunded = o.ID, idOf(o.PaymentIntent), o.Refunded
	}
	return r
}

// idOf reads an id field that may be a string, an expanded object or null.
func idOf(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var o struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(raw, &o)
	return o.ID
}
