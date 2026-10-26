package handlers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
	"github.com/salmxnz/fuel-and-lift/api/internal/stripe"
)

// Payments is the payment provider (stripe.Client, or a fake in tests).
type Payments interface {
	CreateCheckoutSession(ctx context.Context, p stripe.CheckoutParams) (string, error)
	CreatePortalSession(ctx context.Context, customerID, returnURL string) (string, error)
	GetSubscription(ctx context.Context, id string) (stripe.Subscription, error)
	GetPrice(ctx context.Context, id string) (stripe.Price, error)
	CancelSubscription(ctx context.Context, id, comment string) (stripe.Subscription, error)
	SubscriptionsForCharge(ctx context.Context, chargeID, paymentIntentID string) ([]string, error)
	ListCharges(ctx context.Context, customerID string, limit int) ([]stripe.Charge, error)
	AccountID(ctx context.Context) (string, error)
}

// Plan is a way to pay for Pro, priced from Stripe.
type Plan struct {
	ID       string `json:"id"`     // monthly, yearly
	Amount   int64  `json:"amount"` // minor units: 249 = $2.49
	Currency string `json:"currency"`
	Interval string `json:"interval"` // month, year
}

// priceCache keeps Stripe's prices for an hour so the paywall doesn't call
// Stripe on every open.
type priceCache struct {
	mu      sync.Mutex
	plans   []Plan
	fetched time.Time
}

const priceCacheTTL = time.Hour

// planPrices maps our plan ids to the configured Stripe prices.
func (h *Handler) planPrices() []struct{ id, price string } {
	out := []struct{ id, price string }{{"monthly", h.Cfg.StripePriceMonthly}}
	if h.Cfg.StripePriceYearly != "" {
		out = append(out, struct{ id, price string }{"yearly", h.Cfg.StripePriceYearly})
	}
	return out
}

// plans returns what Pro costs; empty when payments are off or Stripe can't
// be reached (the paywall then just doesn't show prices).
func (h *Handler) plans(ctx context.Context) []Plan {
	if h.Payments == nil {
		return []Plan{}
	}
	c := &h.prices
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.plans != nil && h.now().Sub(c.fetched) < priceCacheTTL {
		return c.plans
	}
	var list []Plan
	for _, p := range h.planPrices() {
		price, err := h.Payments.GetPrice(ctx, p.price)
		if err != nil {
			h.Log.Warn("stripe: price", "plan", p.id, "price", p.price, "err", err)
			if c.plans != nil {
				return c.plans // stale beats nothing
			}
			return []Plan{}
		}
		if !price.Active || price.Recurring == nil {
			h.Log.Warn("stripe: price isn't an active recurring price", "plan", p.id, "price", p.price)
			continue
		}
		list = append(list, Plan{ID: p.id, Amount: price.UnitAmount, Currency: price.Currency, Interval: price.Recurring.Interval})
	}
	if list == nil {
		list = []Plan{}
	}
	c.plans, c.fetched = list, h.now()
	return list
}

func (h *Handler) billing(ctx context.Context, userID string) (map[string]any, error) {
	u, err := h.Store.GetUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	a, err := h.allowance(ctx, userID)
	if err != nil {
		return nil, err
	}
	joined, err := h.Store.ReferralCount(ctx, userID)
	if err != nil {
		return nil, err
	}
	stored, err := h.Store.StoredPhotoCount(ctx, userID)
	if err != nil {
		return nil, err
	}
	var sub *store.Subscription
	if s, err := h.Store.LatestSubscription(ctx, userID); err == nil {
		sub = &s
	} else if !errors.Is(err, store.ErrNotFound) {
		return nil, err
	}
	var storedLimit *int
	if !a.pro {
		n := h.Cfg.FreePhotosStored
		storedLimit = &n
	}
	plan := "free"
	var source *string
	var until *time.Time
	if a.pro {
		plan = "pro"
		source, until = u.ProSource, u.ProUntil
	}
	return map[string]any{
		"plan":       plan,
		"pro_source": source,
		"pro_until":  until,
		"photo_estimates": map[string]any{
			"used_this_month":  a.usage.PhotosThisMonth,
			"limit_this_month": a.photoLimit,
			"resets_on":        a.resetsOn,
		},
		"referrals":     map[string]int{"joined": joined, "needed": h.Cfg.ReferralsForPro},
		"photos_stored": stored,
		"photos_limit":  storedLimit,
		"subscription":  sub,
	}, nil
}

// Billing handles GET /v1/billing: the plan, usage and what Pro costs.
func (h *Handler) Billing(w http.ResponseWriter, r *http.Request) {
	b, err := h.billing(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"billing": b, "plans": h.plans(r.Context())})
}

// Checkout handles POST /v1/billing/checkout {plan?: "monthly" | "yearly"}:
// a Stripe Checkout URL for a Pro subscription. 501 until Stripe is configured.
func (h *Handler) Checkout(w http.ResponseWriter, r *http.Request) {
	if h.Payments == nil {
		httpx.ErrorCode(w, http.StatusNotImplemented, "checkout_unavailable",
			"paid Pro isn't open yet — invite 8 friends to get Pro free, forever")
		return
	}
	var in struct {
		Plan string `json:"plan"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Plan == "" {
		in.Plan = "monthly"
	}
	priceID := ""
	for _, p := range h.planPrices() {
		if p.id == in.Plan {
			priceID = p.price
		}
	}
	if priceID == "" {
		badRequest(w, "plan must be monthly or yearly")
		return
	}
	ctx := r.Context()
	u, err := h.Store.GetUser(ctx, auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if u.IsPro(h.now()) {
		httpx.ErrorCode(w, http.StatusConflict, "already_pro", "you already have Pro")
		return
	}
	if sub, err := h.Store.LatestSubscription(ctx, u.ID); err == nil && sub.Live() {
		httpx.ErrorCode(w, http.StatusConflict, "has_subscription",
			"you already have a subscription: update your payment details instead")
		return
	} else if err != nil && !errors.Is(err, store.ErrNotFound) {
		h.storeError(w, r, err)
		return
	}
	customer, err := h.Store.StripeCustomer(ctx, u.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	url, err := h.Payments.CreateCheckoutSession(ctx, stripe.CheckoutParams{
		UserID: u.ID, Email: u.Email, CustomerID: customer, PriceID: priceID,
		SuccessURL: h.Cfg.AppURL + "/pro?checkout=success", CancelURL: h.Cfg.AppURL + "/pro",
		ManagedPayments: h.Cfg.StripeManagedPayments,
	})
	if err != nil {
		h.paymentsError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"url": url})
}

// BillingPortal handles POST /v1/billing/portal: a Stripe Customer Portal URL
// to change the card or cancel.
func (h *Handler) BillingPortal(w http.ResponseWriter, r *http.Request) {
	if h.Payments == nil {
		httpx.ErrorCode(w, http.StatusNotImplemented, "checkout_unavailable", "payments aren't set up")
		return
	}
	customer, err := h.Store.StripeCustomer(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if customer == "" {
		httpx.ErrorCode(w, http.StatusNotFound, "no_subscription", "you don't have a subscription")
		return
	}
	url, err := h.Payments.CreatePortalSession(r.Context(), customer, h.Cfg.AppURL+"/pro")
	if err != nil {
		h.paymentsError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"url": url})
}

func (h *Handler) paymentsError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, context.Canceled) {
		return
	}
	h.Log.Error("stripe request failed", "path", r.URL.Path, "err", err)
	httpx.ErrorCode(w, http.StatusBadGateway, "payments_unavailable", "payments aren't available right now, try again in a moment")
}

// stripeWebhookMaxBody is far more than any event we handle.
const stripeWebhookMaxBody = 1 << 20

// StripeWebhook handles POST /v1/billing/webhook, called by Stripe (through
// the web app's /api/stripe/webhook). The signature is the only auth. For
// every subscription event it fetches the subscription fresh, so events that
// arrive late or out of order still leave the latest state. A non-2xx makes
// Stripe retry.
func (h *Handler) StripeWebhook(w http.ResponseWriter, r *http.Request) {
	if h.Payments == nil || h.Cfg.StripeWebhookSecret == "" {
		httpx.Error(w, http.StatusNotImplemented, "payments aren't set up")
		return
	}
	payload, err := io.ReadAll(http.MaxBytesReader(w, r.Body, stripeWebhookMaxBody))
	if err != nil {
		badRequest(w, "body too large")
		return
	}
	ev, err := stripe.ParseWebhook(payload, r.Header.Get("Stripe-Signature"), h.Cfg.StripeWebhookSecret, h.now())
	if err != nil {
		badRequest(w, "bad signature")
		return
	}
	ctx := r.Context()
	if seen, err := h.Store.StripeEventSeen(ctx, ev.ID); err != nil {
		h.storeError(w, r, err)
		return
	} else if seen {
		httpx.JSON(w, http.StatusOK, map[string]bool{"received": true})
		return
	}
	switch ev.Type {
	case "checkout.session.completed",
		"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
		"customer.subscription.paused", "customer.subscription.resumed",
		"invoice.paid", "invoice.payment_failed":
		err = h.syncStripe(ctx, ev)
	case "charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created":
		err = h.stripeRisk(ctx, ev)
	}
	if err != nil {
		if errors.Is(err, errStripeUpstream) {
			h.paymentsError(w, r, err)
		} else {
			h.storeError(w, r, err)
		}
		return
	}
	if err := h.Store.RecordStripeEvent(ctx, ev.ID, ev.Type); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"received": true})
}

var errStripeUpstream = errors.New("stripe")

// syncStripe copies the subscription an event points at onto its user.
func (h *Handler) syncStripe(ctx context.Context, ev stripe.Event) error {
	refs := ev.Refs()
	if refs.SubscriptionID == "" {
		return nil
	}
	sub, err := h.Payments.GetSubscription(ctx, refs.SubscriptionID)
	if err != nil {
		return errors.Join(errStripeUpstream, err)
	}
	return h.applySubscription(ctx, sub, refs.UserID)
}

// applySubscription stores a subscription for its user and updates their Pro.
// The user is whoever has the subscription's customer; only a customer we
// haven't seen yet (the first events of a checkout) falls back to our id from
// the event or the subscription's metadata.
func (h *Handler) applySubscription(ctx context.Context, sub stripe.Subscription, eventUserID string) error {
	userID, err := h.Store.UserByStripeCustomer(ctx, sub.Customer)
	if errors.Is(err, store.ErrNotFound) {
		userID = eventUserID
		if userID == "" {
			userID = sub.Metadata["user_id"]
		}
	} else if err != nil {
		return err
	}
	if userID == "" {
		h.Log.Warn("stripe: subscription with no user", "subscription", sub.ID, "customer", sub.Customer)
		return nil
	}
	if !isUUID(userID) {
		h.Log.Warn("stripe: subscription with a bad user id", "subscription", sub.ID, "user_id", userID)
		return nil
	}
	err = h.Store.SyncSubscription(ctx, userID, storeSubscription(sub))
	if errors.Is(err, store.ErrNotFound) || errors.Is(err, store.ErrConflict) {
		// A deleted user, or a subscription or customer that's someone else's:
		// retrying won't help.
		h.Log.Warn("stripe: subscription not applied", "subscription", sub.ID, "user_id", userID, "err", err)
		return nil
	}
	return err
}

// riskComment is kept on a subscription we cancel, so the admin app says why.
var riskComment = map[string]string{
	"charge.refunded":                   "Cancelled by adebite: the payment was refunded in full",
	"charge.dispute.created":            "Cancelled by adebite: the payment was disputed",
	"radar.early_fraud_warning.created": "Cancelled by adebite: the payment was flagged as likely fraud",
}

// stripeRisk ends Pro paid by a charge that was disputed, flagged as likely
// fraud or fully refunded: the subscription it paid for is cancelled now, in
// Stripe and here. Partial refunds change nothing.
func (h *Handler) stripeRisk(ctx context.Context, ev stripe.Event) error {
	refs := ev.Refs()
	if ev.Type == "charge.refunded" && !refs.FullyRefunded {
		return nil
	}
	subs, err := h.Payments.SubscriptionsForCharge(ctx, refs.ChargeID, refs.PaymentIntentID)
	if err != nil {
		return errors.Join(errStripeUpstream, err)
	}
	for _, id := range subs {
		sub, err := h.Payments.GetSubscription(ctx, id)
		if err != nil {
			return errors.Join(errStripeUpstream, err)
		}
		if sub.Status != "canceled" && sub.Status != "incomplete_expired" {
			if sub, err = h.Payments.CancelSubscription(ctx, id, riskComment[ev.Type]); err != nil {
				return errors.Join(errStripeUpstream, err)
			}
		}
		h.Log.Warn("stripe: subscription cancelled", "reason", ev.Type, "subscription", id, "charge", refs.ChargeID)
		if err := h.applySubscription(ctx, sub, ""); err != nil {
			return err
		}
	}
	return nil
}

// storeSubscription is what we keep of a Stripe subscription.
func storeSubscription(sub stripe.Subscription) store.Subscription {
	out := store.Subscription{
		ID: sub.ID, CustomerID: sub.Customer, Status: sub.Status,
		CurrentPeriodEnd: sub.PeriodEnd(), CancelAtPeriodEnd: sub.EndsAtPeriodEnd(),
		StartedAt: unixTime(sub.StartDate), CancelAt: unixTime(sub.CancelAt),
		CanceledAt: unixTime(sub.CanceledAt), EndedAt: unixTime(sub.EndedAt),
		CancelReason:   nilIfEmpty(sub.CancellationDetails.Reason),
		CancelFeedback: nilIfEmpty(sub.CancellationDetails.Feedback),
		CancelComment:  nilIfEmpty(sub.CancellationDetails.Comment),
		Livemode:       sub.Livemode,
	}
	if p := sub.Plan(); p.ID != "" {
		out.PriceID, out.Currency = &p.ID, nilIfEmpty(p.Currency)
		amount := p.UnitAmount
		out.Amount = &amount
		if p.Recurring != nil {
			out.Interval = nilIfEmpty(p.Recurring.Interval)
		}
	}
	return out
}

// unixTime turns a Stripe timestamp into a time, nil for 0 (unset).
func unixTime(t int64) *time.Time {
	if t == 0 {
		return nil
	}
	v := time.Unix(t, 0).UTC()
	return &v
}
