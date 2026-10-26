-- Feedback people send from Me → Feedback: what happened or what they'd like,
-- with up to 3 screenshots kept in R2 (like meal photos). Admins read and
-- triage it in the admin app.
create table feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null default 'other' check (kind in ('bug', 'idea', 'other')),
  message     text not null check (char_length(message) between 1 and 2000),
  page        text,           -- the screen they came from, e.g. "/gym"
  user_agent  text,
  status      text not null default 'new' check (status in ('new', 'seen', 'done')),
  admin_note  text check (char_length(admin_note) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index feedback_user on feedback (user_id, id desc);
create index feedback_status on feedback (status, id desc);

create table feedback_photos (
  id           uuid primary key default gen_random_uuid(),
  feedback_id  bigint not null references feedback(id) on delete cascade,
  position     smallint not null default 0,
  object_key   text not null unique,
  content_type text not null,
  bytes        int not null
);
create index feedback_photos_feedback on feedback_photos (feedback_id, position);
