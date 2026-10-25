-- Every push and email the server tried to send, for the admin app
-- (notification_log stays the reminders' once-only claim table).
create table sent_notifications (
  id         bigint generated always as identity primary key,
  channel    text not null check (channel in ('push', 'email')),
  user_id    uuid references users(id) on delete set null,
  recipient  text,            -- the address, for email
  kind       text not null,   -- push kind / email template
  title      text not null,   -- push title / email subject
  body       text,
  url        text,
  status     text not null check (status in ('sent', 'partial', 'failed', 'no_devices', 'quiet_hours', 'disabled')),
  devices    int not null default 0,  -- push: subscriptions tried
  delivered  int not null default 0,
  error      text,
  created_at timestamptz not null default now()
);
create index sent_notifications_user on sent_notifications (user_id, id desc);
create index sent_notifications_created on sent_notifications (created_at);

-- One row per API request: metadata only, never bodies.
create table audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null,
  user_id     uuid references users(id) on delete set null,
  role        text,
  method      text not null,
  path        text not null,  -- secrets in the path (invite tokens) replaced by the route's {name}
  route       text,           -- the mux pattern, e.g. "GET /v1/days/{date}"
  query       text,
  status      int not null,
  duration_ms int not null,
  ip          inet,
  user_agent  text,
  error       text            -- error.message of a 4xx/5xx
);
create index audit_log_at on audit_log (at);
create index audit_log_user on audit_log (user_id, id desc);
create index audit_log_errors on audit_log (id desc) where status >= 400;
