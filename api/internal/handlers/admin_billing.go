package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// The admin app's billing screens: every subscription, and one user's
// subscriptions and payments. Stored subscriptions come from webhooks;
// payments are read from Stripe when the screen opens.

// dashboardCache keeps the Stripe Dashboard address once it's known.
type dashboardCache struct {
	mu   sync.Mutex
	base string
}

// stripeInfo tells the admin app whether Stripe is on, in which mode, and
// where its Dashboard is, so it can link to customers and subscriptions.
func (h *Handler) stripeInfo(ctx context.Context) map[string]any {
	if h.Payments == nil {
		return map[string]any{"configured": false, "mode": nil, "dashboard_url": nil}
	}
	test := strings.Contains(h.Cfg.StripeSecretKey, "_test_")
	mode := "live"
	if test {
		mode = "test"
	}
	return map[string]any{"configured": true, "mode": mode, "dashboard_url": h.stripeDashboard(ctx, test)}
}

// stripeDashboard is the Dashboard's base URL for this account, e.g.
// https://dashboard.stripe.com/acct_123/test (sandboxes need the account in
// the path). Without the account id it falls back to the unscoped URL.
func (h *Handler) stripeDashboard(ctx context.Context, test bool) string {
	c := &h.dashboard
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.base != "" {
		return c.base
	}
	suffix := ""
	if test {
		suffix = "/test"
	}
	id, err := h.Payments.AccountID(ctx)
	if err != nil || id == "" {
		h.Log.Warn("stripe: account id (for Dashboard links)", "err", err)
		return "https://dashboard.stripe.com" + suffix
	}
	c.base = "https://dashboard.stripe.com/" + id + suffix
	return c.base
}

// AdminBilling handles GET /v1/admin/billing?status=&q=&limit=&offset=.
func (h *Handler) AdminBilling(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := store.BillingFilter{Status: q.Get("status"), Q: strings.TrimSpace(q.Get("q")), Limit: 50}
	if !store.ValidBillingStatus(f.Status) {
		badRequest(w, "status is active|cancelling|past_due|ended")
		return
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100 {
			badRequest(w, "limit must be 1-100")
			return
		}
		f.Limit = n
	}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			badRequest(w, "offset must be 0 or more")
			return
		}
		f.Offset = n
	}
	summary, err := h.Store.BillingSummary(r.Context(), h.now())
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	list, total, err := h.Store.AdminSubscriptions(r.Context(), f)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"summary": summary, "subscriptions": list, "total": total, "stripe": h.stripeInfo(r.Context()),
	})
}

// adminPayment is a Stripe charge as the admin app shows it.
type adminPayment struct {
	ID             string    `json:"id"`
	Amount         int64     `json:"amount"`
	AmountRefunded int64     `json:"amount_refunded"`
	Currency       string    `json:"currency"`
	Status         string    `json:"status"` // succeeded, pending, failed
	Refunded       bool      `json:"refunded"`
	Disputed       bool      `json:"disputed"`
	Created        time.Time `json:"created"`
	Description    *string   `json:"description"`
	FailureMessage *string   `json:"failure_message"`
	ReceiptURL     *string   `json:"receipt_url"`
	PaymentIntent  *string   `json:"payment_intent"`
}

// adminPaymentsLimit is how many recent payments the user's billing tab shows.
const adminPaymentsLimit = 25

// AdminUserBilling handles GET /v1/admin/users/{id}/billing: their plan, every
// subscription they've had, and their recent payments from Stripe.
func (h *Handler) AdminUserBilling(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	h.writeAdminUserBilling(w, r, u.ID)
}

// SyncAdminUserBilling handles POST /v1/admin/users/{id}/billing/sync: reads
// each of their subscriptions from Stripe again (for a webhook that never
// arrived, or rows from before a field was kept), then answers like the GET.
func (h *Handler) SyncAdminUserBilling(w http.ResponseWriter, r *http.Request) {
	u, ok := h.adminUser(w, r)
	if !ok {
		return
	}
	if h.Payments == nil {
		httpx.ErrorCode(w, http.StatusNotImplemented, "checkout_unavailable", "Stripe isn't configured")
		return
	}
	ctx := r.Context()
	subs, err := h.Store.UserSubscriptions(ctx, u.ID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	for _, s := range subs {
		sub, err := h.Payments.GetSubscription(ctx, s.ID)
		if err != nil {
			h.paymentsError(w, r, err)
			return
		}
		if err := h.applySubscription(ctx, sub, u.ID); err != nil {
			h.storeError(w, r, err)
			return
		}
	}
	h.writeAdminUserBilling(w, r, u.ID)
}

func (h *Handler) writeAdminUserBilling(w http.ResponseWriter, r *http.Request, userID string) {
	ctx := r.Context()
	b, err := h.billing(ctx, userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	subs, err := h.Store.UserSubscriptions(ctx, userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	customer, err := h.Store.StripeCustomer(ctx, userID)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	out := map[string]any{
		"billing": b, "customer_id": nilIfEmpty(customer), "subscriptions": subs,
		"payments": []adminPayment{}, "payments_error": nil, "stripe": h.stripeInfo(ctx),
	}
	if h.Payments != nil && customer != "" {
		charges, err := h.Payments.ListCharges(ctx, customer, adminPaymentsLimit)
		if err != nil {
			h.Log.Warn("stripe: charges for admin", "customer", customer, "err", err)
			out["payments"] = nil
			out["payments_error"] = "Stripe didn't answer, so payments can't be shown right now."
		} else {
			list := make([]adminPayment, 0, len(charges))
			for _, c := range charges {
				list = append(list, adminPayment{
					ID: c.ID, Amount: c.Amount, AmountRefunded: c.AmountRefunded, Currency: c.Currency,
					Status: c.Status, Refunded: c.Refunded, Disputed: c.Disputed, Created: time.Unix(c.Created, 0).UTC(),
					Description: nilIfEmpty(c.Description), FailureMessage: nilIfEmpty(c.FailureMessage),
					ReceiptURL: nilIfEmpty(c.ReceiptURL), PaymentIntent: nilIfEmpty(c.PaymentIntent),
				})
			}
			out["payments"] = list
		}
	}
	httpx.JSON(w, http.StatusOK, out)
}
