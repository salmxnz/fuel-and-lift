-- Paid Pro through Stripe. Checkout makes the subscription; webhooks keep this
-- copy in step and move users.pro_until to the end of each paid period.
alter table users add column stripe_customer_id text unique;

create table subscriptions (
  stripe_subscription_id text primary key,
  user_id                uuid not null references users(id) on delete cascade,
  stripe_customer_id     text not null,
  status                 text not null,   -- Stripe's: active, trialing, past_due, canceled, ...
  current_period_end     timestamptz not null,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index subscriptions_user on subscriptions (user_id, updated_at desc);

-- Webhook events already handled, so a redelivery does nothing.
create table stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
create index stripe_events_received on stripe_events (received_at);
