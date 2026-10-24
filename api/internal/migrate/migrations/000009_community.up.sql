-- The community: workouts, saved meals and routines can be private, shown to
-- friends, or public in the Shop. Copies remember where they came from, adds
-- are counted once per person, and anyone can report a public item; an admin
-- hides it (hidden_at) without touching the owner's own copy.

alter table templates
  add column visibility       text not null default 'private' check (visibility in ('private', 'friends', 'public')),
  add column published_at     timestamptz, -- first time it left private; "newest" sorts on this
  add column add_count        int not null default 0,
  add column hidden_at        timestamptz,
  add column hidden_by        uuid references users(id) on delete set null,
  add column copied_from_id   uuid references templates(id) on delete set null,
  add column copied_from_user uuid references users(id) on delete set null;

alter table saved_meals
  add column visibility       text not null default 'private' check (visibility in ('private', 'friends', 'public')),
  add column published_at     timestamptz,
  add column add_count        int not null default 0,
  add column hidden_at        timestamptz,
  add column hidden_by        uuid references users(id) on delete set null,
  add column copied_from_id   uuid references saved_meals(id) on delete set null,
  add column copied_from_user uuid references users(id) on delete set null;

-- A routine is a week of the user's own workouts ("Push Pull Legs").
create table routines (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  name             text not null,
  description      text,
  preset           text, -- the split it was made from, if any
  visibility       text not null default 'private' check (visibility in ('private', 'friends', 'public')),
  published_at     timestamptz,
  add_count        int not null default 0,
  hidden_at        timestamptz,
  hidden_by        uuid references users(id) on delete set null,
  copied_from_id   uuid references routines(id) on delete set null,
  copied_from_user uuid references users(id) on delete set null,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index routines_user on routines (user_id);

create table routine_days (
  routine_id   uuid not null references routines(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6), -- 0 = Monday, as in weekly_plan
  template_id  uuid not null references templates(id) on delete cascade,
  primary key (routine_id, weekday)
);
create index routine_days_template on routine_days (template_id);

-- "Most added" counts each person once, however many copies they make.
create table item_adds (
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null check (kind in ('template', 'meal', 'routine')),
  item_id     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references users(id) on delete cascade,
  kind         text not null check (kind in ('template', 'meal', 'routine')),
  item_id      uuid not null, -- items are archived, never deleted
  reason       text not null check (reason in ('spam', 'offensive', 'unsafe', 'other')),
  note         text check (char_length(note) <= 300),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolution   text check (resolution in ('hidden', 'dismissed')),
  resolved_by  uuid references users(id) on delete set null
);
create unique index reports_once on reports (reporter_id, kind, item_id) where resolved_at is null;
create index reports_open on reports (kind, item_id) where resolved_at is null;

-- The Shop's two sorts, per kind.
create index templates_shop_new on templates (published_at desc)
  where visibility = 'public' and hidden_at is null and archived_at is null;
create index templates_shop_top on templates (add_count desc, published_at desc)
  where visibility = 'public' and hidden_at is null and archived_at is null;
create index saved_meals_shop_new on saved_meals (published_at desc)
  where visibility = 'public' and hidden_at is null and archived_at is null;
create index saved_meals_shop_top on saved_meals (add_count desc, published_at desc)
  where visibility = 'public' and hidden_at is null and archived_at is null;
create index routines_shop_new on routines (published_at desc)
  where visibility = 'public' and hidden_at is null and archived_at is null;
create index routines_shop_top on routines (add_count desc, published_at desc)
  where visibility = 'public' and hidden_at is null and archived_at is null;

-- Routines can be sent to a friend like a template.
alter table shares drop constraint shares_kind_check;
alter table shares add constraint shares_kind_check check (kind in ('meal', 'template', 'routine'));
alter table shares add column routine_id uuid references routines(id) on delete set null;
create unique index shares_pending_routine on shares (routine_id, to_user) where status = 'pending' and routine_id is not null;
