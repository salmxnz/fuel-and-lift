package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Paid Pro. A Stripe subscription is copied here by webhooks; while it's
// active (or trialing) the user has Pro until the end of the paid period.
// Pro forever (admin or referrals) is never touched by a subscription.

// Subscription is a user's Stripe subscription as last seen. The JSON is what
// the user sees of it; AdminSubscription adds the rest.
type Subscription struct {
	ID                string     `json:"-"`
	CustomerID        string     `json:"-"`
	Status            string     `json:"status"`
	CurrentPeriodEnd  time.Time  `json:"current_period_end"`
	CancelAtPeriodEnd bool       `json:"cancel_at_period_end"` // won't renew
	Interval          *string    `json:"interval"`             // month, year
	Amount            *int64     `json:"amount"`               // minor units
	Currency          *string    `json:"currency"`
	StartedAt         *time.Time `json:"started_at"`
	CanceledAt        *time.Time `json:"canceled_at"` // when the cancellation was asked for
	EndedAt           *time.Time `json:"ended_at"`

	PriceID        *string    `json:"-"`
	CancelAt       *time.Time `json:"-"`
	CancelReason   *string    `json:"-"`
	CancelFeedback *string    `json:"-"`
	CancelComment  *string    `json:"-"`
	Livemode       bool       `json:"-"`
	CreatedAt      time.Time  `json:"-"`
	UpdatedAt      time.Time  `json:"-"`
}

const subCols = `stripe_subscription_id, stripe_customer_id, status, current_period_end, cancel_at_period_end,
	plan_interval, amount, currency, started_at, canceled_at, ended_at,
	price_id, cancel_at, cancel_reason, cancel_feedback, cancel_comment, livemode, created_at, updated_at`

func subDest(sub *Subscription) []any {
	return []any{&sub.ID, &sub.CustomerID, &sub.Status, &sub.CurrentPeriodEnd, &sub.CancelAtPeriodEnd,
		&sub.Interval, &sub.Amount, &sub.Currency, &sub.StartedAt, &sub.CanceledAt, &sub.EndedAt,
		&sub.PriceID, &sub.CancelAt, &sub.CancelReason, &sub.CancelFeedback, &sub.CancelComment, &sub.Livemode, &sub.CreatedAt, &sub.UpdatedAt}
}

// Live reports whether the subscription still exists for billing: paid,
// trialing, or failing a payment Stripe is still retrying.
func (s Subscription) Live() bool {
	switch s.Status {
	case "active", "trialing", "past_due", "unpaid", "paused":
		return true
	}
	return false
}

// entitled reports whether the subscription pays for Pro right now.
func (s Subscription) entitled() bool { return s.Status == "active" || s.Status == "trialing" }

// ended reports whether the subscription is over for good.
func (s Subscription) ended() bool {
	return s.Status == "canceled" || s.Status == "unpaid" || s.Status == "incomplete_expired"
}

// StripeCustomer returns the user's Stripe customer id, "" when they have none.
func (s *Store) StripeCustomer(ctx context.Context, userID string) (string, error) {
	var id *string
	err := s.Pool.QueryRow(ctx, `select stripe_customer_id from users where id = $1::uuid`, userID).Scan(&id)
	if err != nil {
		return "", notFound(err)
	}
	if id == nil {
		return "", nil
	}
	return *id, nil
}

// UserByStripeCustomer finds who a Stripe customer is.
func (s *Store) UserByStripeCustomer(ctx context.Context, customerID string) (string, error) {
	var id string
	err := s.Pool.QueryRow(ctx, `select id::text from users where stripe_customer_id = $1`, customerID).Scan(&id)
	return id, notFound(err)
}

// LatestSubscription returns the user's most recently updated subscription.
func (s *Store) LatestSubscription(ctx context.Context, userID string) (Subscription, error) {
	var sub Subscription
	err := s.Pool.QueryRow(ctx, `select `+subCols+`
		from subscriptions where user_id = $1::uuid order by updated_at desc limit 1`, userID).Scan(subDest(&sub)...)
	return sub, notFound(err)
}

// SyncSubscription stores what Stripe says about a subscription and updates
// the user's Pro to match: an active one gives Pro until the period end, one
// that's over takes subscription Pro away. Admin and referral Pro stay.
func (s *Store) SyncSubscription(ctx context.Context, userID string, sub Subscription) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			insert into subscriptions (stripe_subscription_id, user_id, stripe_customer_id, status, current_period_end, cancel_at_period_end,
			  plan_interval, amount, currency, started_at, canceled_at, ended_at,
			  price_id, cancel_at, cancel_reason, cancel_feedback, cancel_comment, livemode)
			values ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
			on conflict (stripe_subscription_id) do update set
			  status = excluded.status, stripe_customer_id = excluded.stripe_customer_id,
			  current_period_end = excluded.current_period_end,
			  cancel_at_period_end = excluded.cancel_at_period_end,
			  plan_interval = excluded.plan_interval, amount = excluded.amount, currency = excluded.currency,
			  started_at = excluded.started_at, canceled_at = excluded.canceled_at, ended_at = excluded.ended_at,
			  price_id = excluded.price_id, cancel_at = excluded.cancel_at, cancel_reason = excluded.cancel_reason,
			  cancel_feedback = excluded.cancel_feedback, cancel_comment = excluded.cancel_comment,
			  livemode = excluded.livemode, updated_at = now()
			where subscriptions.user_id = excluded.user_id`,
			sub.ID, userID, sub.CustomerID, sub.Status, sub.CurrentPeriodEnd, sub.CancelAtPeriodEnd,
			sub.Interval, sub.Amount, sub.Currency, sub.StartedAt, sub.CanceledAt, sub.EndedAt,
			sub.PriceID, sub.CancelAt, sub.CancelReason, sub.CancelFeedback, sub.CancelComment, sub.Livemode)
		if pg := (*pgconn.PgError)(nil); errors.As(err, &pg) && pg.Code == "23503" {
			return ErrNotFound // the user is gone
		} else if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrConflict // the subscription belongs to someone else
		}
		if _, err := tx.Exec(ctx, `update users set stripe_customer_id = $2 where id = $1::uuid and stripe_customer_id is null`,
			userID, sub.CustomerID); err != nil {
			return uniqueConflict(err)
		}
		switch {
		case sub.entitled():
			// Skip anyone with Pro forever, or with admin Pro that lasts longer.
			_, err = tx.Exec(ctx, `
				update users set plan = 'pro', pro_source = 'subscription', pro_until = $2
				where id = $1::uuid and not (plan = 'pro' and (pro_until is null
				  or (pro_source is distinct from 'subscription' and pro_until > $2)))`, userID, sub.CurrentPeriodEnd)
		case sub.ended():
			_, err = tx.Exec(ctx, `
				update users set plan = 'free', pro_source = null, pro_until = null
				where id = $1::uuid and pro_source = 'subscription'
				  and not exists (select 1 from subscriptions o where o.user_id = $1::uuid
				    and o.stripe_subscription_id <> $2 and o.status in ('active', 'trialing'))`, userID, sub.ID)
		}
		// past_due, paused, incomplete: pro_until stays the end of what was
		// paid for and lapses by itself unless a retry succeeds.
		return err
	})
}

// --- admin -----------------------------------------------------------------------

// AdminSubscription is everything stored about a subscription, for the admin
// app, with whose it is.
type AdminSubscription struct {
	ID                string        `json:"id"`
	CustomerID        string        `json:"customer_id"`
	Status            string        `json:"status"`
	CurrentPeriodEnd  time.Time     `json:"current_period_end"`
	CancelAtPeriodEnd bool          `json:"cancel_at_period_end"`
	Interval          *string       `json:"interval"`
	Amount            *int64        `json:"amount"`
	Currency          *string       `json:"currency"`
	PriceID           *string       `json:"price_id"`
	StartedAt         *time.Time    `json:"started_at"`
	CancelAt          *time.Time    `json:"cancel_at"`
	CanceledAt        *time.Time    `json:"canceled_at"`
	EndedAt           *time.Time    `json:"ended_at"`
	CancelReason      *string       `json:"cancel_reason"`
	CancelFeedback    *string       `json:"cancel_feedback"`
	CancelComment     *string       `json:"cancel_comment"`
	Livemode          bool          `json:"livemode"`
	CreatedAt         time.Time     `json:"created_at"`
	UpdatedAt         time.Time     `json:"updated_at"`
	User              *BillingOwner `json:"user,omitempty"`
}

// BillingOwner is who a subscription is for, on the admin billing list.
type BillingOwner struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	AvatarURL *string `json:"avatar_url"`
}

// Admin is the full view of the subscription.
func (sub Subscription) Admin() AdminSubscription {
	return AdminSubscription{
		ID: sub.ID, CustomerID: sub.CustomerID, Status: sub.Status, CurrentPeriodEnd: sub.CurrentPeriodEnd,
		CancelAtPeriodEnd: sub.CancelAtPeriodEnd, Interval: sub.Interval, Amount: sub.Amount, Currency: sub.Currency,
		PriceID: sub.PriceID, StartedAt: sub.StartedAt, CancelAt: sub.CancelAt, CanceledAt: sub.CanceledAt,
		EndedAt: sub.EndedAt, CancelReason: sub.CancelReason, CancelFeedback: sub.CancelFeedback,
		CancelComment: sub.CancelComment, Livemode: sub.Livemode, CreatedAt: sub.CreatedAt, UpdatedAt: sub.UpdatedAt,
	}
}

// UserSubscriptions returns all of a user's subscriptions, newest first.
func (s *Store) UserSubscriptions(ctx context.Context, userID string) ([]AdminSubscription, error) {
	rows, err := s.Pool.Query(ctx, `select `+subCols+` from subscriptions where user_id = $1::uuid order by created_at desc`, userID)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (AdminSubscription, error) {
		var sub Subscription
		err := r.Scan(subDest(&sub)...)
		return sub.Admin(), err
	})
	if list == nil {
		list = []AdminSubscription{}
	}
	return list, err
}

// subStatusWhere is the SQL for a billing list status filter (see
// BillingFilter.Status).
var subStatusWhere = map[string]string{
	"":           "true",
	"active":     "s.status in ('active', 'trialing') and not s.cancel_at_period_end",
	"cancelling": "s.status in ('active', 'trialing') and s.cancel_at_period_end",
	"past_due":   "s.status in ('past_due', 'unpaid', 'paused', 'incomplete')",
	"ended":      "s.status in ('canceled', 'incomplete_expired')",
}

// BillingFilter narrows the admin billing list.
type BillingFilter struct {
	Status string // "", active, cancelling, past_due, ended
	Q      string // email or name
	Limit  int
	Offset int
}

// ValidBillingStatus reports whether status is a billing list filter.
func ValidBillingStatus(status string) bool {
	_, ok := subStatusWhere[status]
	return ok
}

// AdminSubscriptions lists subscriptions with their users, most recently
// changed first, and how many match in all.
func (s *Store) AdminSubscriptions(ctx context.Context, f BillingFilter) ([]AdminSubscription, int, error) {
	where := subStatusWhere[f.Status] + `
		and ($1 = '' or u.email ilike $1 or u.name ilike $1 or p.display_name ilike $1)`
	from := ` from subscriptions s join users u on u.id = s.user_id left join profiles p on p.user_id = u.id where `
	var total int
	if err := s.Pool.QueryRow(ctx, `select count(*)`+from+where, likePattern(f.Q)).Scan(&total); err != nil {
		return nil, 0, err
	}
	cols := ""
	for i, c := range []string{"stripe_subscription_id", "stripe_customer_id", "status", "current_period_end", "cancel_at_period_end",
		"plan_interval", "amount", "currency", "started_at", "canceled_at", "ended_at",
		"price_id", "cancel_at", "cancel_reason", "cancel_feedback", "cancel_comment", "livemode", "created_at", "updated_at"} {
		if i > 0 {
			cols += ", "
		}
		cols += "s." + c
	}
	rows, err := s.Pool.Query(ctx, `select `+cols+`, u.id::text, coalesce(p.display_name, u.name), u.email::text, u.avatar_url`+
		from+where+` order by s.updated_at desc, s.stripe_subscription_id limit $2 offset $3`, likePattern(f.Q), f.Limit, f.Offset)
	if err != nil {
		return nil, 0, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (AdminSubscription, error) {
		var sub Subscription
		var o BillingOwner
		err := r.Scan(append(subDest(&sub), &o.ID, &o.Name, &o.Email, &o.AvatarURL)...)
		a := sub.Admin()
		a.User = &o
		return a, err
	})
	if list == nil {
		list = []AdminSubscription{}
	}
	return list, total, err
}

// BillingSummary is the admin billing overview.
type BillingSummary struct {
	Active     int `json:"active"`     // paying and renewing
	Cancelling int `json:"cancelling"` // paying, won't renew
	PastDue    int `json:"past_due"`   // a payment failed (or is pending)
	Ended30d   int `json:"ended_30d"`  // ended in the last 30 days
	New30d     int `json:"new_30d"`    // started in the last 30 days
	Monthly    int `json:"monthly"`    // live subscriptions billed monthly
	Yearly     int `json:"yearly"`     // and yearly
	// Monthly recurring revenue per currency (yearly counted as a twelfth),
	// in minor units, from live subscriptions at their list price.
	MRR []Money `json:"mrr"`
}

// Money is an amount in minor units.
type Money struct {
	Currency string `json:"currency"`
	Amount   int64  `json:"amount"`
}

// BillingSummary counts subscriptions by state, as of now.
func (s *Store) BillingSummary(ctx context.Context, now time.Time) (BillingSummary, error) {
	var b BillingSummary
	since := now.AddDate(0, 0, -30)
	err := s.Pool.QueryRow(ctx, `
		select
		  count(*) filter (where status in ('active', 'trialing') and not cancel_at_period_end),
		  count(*) filter (where status in ('active', 'trialing') and cancel_at_period_end),
		  count(*) filter (where status in ('past_due', 'unpaid', 'paused', 'incomplete')),
		  count(*) filter (where status in ('canceled', 'incomplete_expired') and coalesce(ended_at, updated_at) >= $1),
		  count(*) filter (where coalesce(started_at, created_at) >= $1 and status not in ('incomplete', 'incomplete_expired')),
		  count(*) filter (where status in ('active', 'trialing', 'past_due') and plan_interval = 'month'),
		  count(*) filter (where status in ('active', 'trialing', 'past_due') and plan_interval = 'year')
		from subscriptions`, since).
		Scan(&b.Active, &b.Cancelling, &b.PastDue, &b.Ended30d, &b.New30d, &b.Monthly, &b.Yearly)
	if err != nil {
		return b, err
	}
	rows, err := s.Pool.Query(ctx, `
		select currency, round(sum(case plan_interval when 'year' then amount / 12.0 else amount end))::bigint
		from subscriptions
		where status in ('active', 'trialing', 'past_due') and amount is not null and currency is not null
		  and plan_interval in ('month', 'year')
		group by currency order by 2 desc`)
	if err != nil {
		return b, err
	}
	b.MRR, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Money])
	if b.MRR == nil {
		b.MRR = []Money{}
	}
	return b, err
}

// StripeEventSeen reports whether a webhook event was already handled.
func (s *Store) StripeEventSeen(ctx context.Context, id string) (bool, error) {
	var seen bool
	err := s.Pool.QueryRow(ctx, `select exists (select 1 from stripe_events where id = $1)`, id).Scan(&seen)
	return seen, err
}

// RecordStripeEvent marks a webhook event as handled.
func (s *Store) RecordStripeEvent(ctx context.Context, id, typ string) error {
	_, err := s.Pool.Exec(ctx, `insert into stripe_events (id, type) values ($1, $2) on conflict do nothing`, id, typ)
	return err
}

// PruneStripeEvents forgets handled events older than before (Stripe stops
// redelivering after three days).
func (s *Store) PruneStripeEvents(ctx context.Context, before time.Time) (int64, error) {
	tag, err := s.Pool.Exec(ctx, `delete from stripe_events where received_at < $1`, before)
	return tag.RowsAffected(), err
}
