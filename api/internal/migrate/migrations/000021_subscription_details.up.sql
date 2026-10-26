-- What the admin app shows about a subscription: the plan it's on, when it
-- started, and when and why it was cancelled. Webhooks fill these in.
alter table subscriptions
  add column price_id        text,
  add column plan_interval   text,          -- month, year
  add column amount          bigint,        -- minor units: 249 = $2.49
  add column currency        text,
  add column started_at      timestamptz,
  add column cancel_at       timestamptz,   -- when a scheduled cancellation takes effect
  add column canceled_at     timestamptz,   -- when the cancellation was asked for
  add column ended_at        timestamptz,
  add column cancel_reason   text,          -- Stripe's: cancellation_requested, payment_failed, payment_disputed
  add column cancel_feedback text,          -- the customer's: too_expensive, missing_features, unused, other, ...
  add column cancel_comment  text,
  add column livemode        boolean not null default false;

create index subscriptions_status on subscriptions (status, updated_at desc);
