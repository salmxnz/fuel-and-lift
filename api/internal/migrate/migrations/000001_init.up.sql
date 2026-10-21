-- Fuel & Lift schema. Weights in kg, energy in kcal, macros in grams.
create extension if not exists citext;

-- ---------------------------------------------------------------- people ---

create table users (
  id               uuid primary key default gen_random_uuid(),
  google_sub       text unique,
  email            citext not null unique,
  name             text not null default '',
  avatar_url       text,
  role             text not null default 'member' check (role in ('admin', 'member')),
  plan             text not null default 'free' check (plan in ('free', 'pro')),
  pro_source       text check (pro_source in ('admin', 'referrals', 'subscription')),
  pro_until        timestamptz,                -- null with plan = pro means forever
  invited_by       uuid references users(id) on delete set null,
  referral_counted boolean not null default false, -- counted towards invited_by's referrals
  created_at       timestamptz not null default now(),
  last_login_at    timestamptz
);

create table refresh_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  user_agent  text,
  ip          inet,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index refresh_tokens_user on refresh_tokens (user_id);

-- Emails an admin pre-approved.
create table email_invites (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null unique,
  invited_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);

-- Friend links: single use, 14 days. Only the hash of the token is stored.
create table invite_links (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  created_by   uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  accepted_by  uuid references users(id) on delete set null,
  accepted_at  timestamptz,
  new_user     boolean not null default false  -- the person signed up through this link
);
create index invite_links_creator on invite_links (created_by, created_at desc);

create table profiles (
  user_id          uuid primary key references users(id) on delete cascade,
  display_name     text not null,
  sex              text not null check (sex in ('male', 'female')),
  date_of_birth    date not null,
  height_cm        numeric(5,1) not null,
  activity_level   smallint not null check (activity_level between 1 and 6),
  units            text not null default 'metric' check (units in ('metric', 'imperial')),
  timezone         text not null default 'UTC',
  coach_voice      text not null default 'neutral' check (coach_voice in ('neutral', 'casual')),
  weigh_in_cadence text not null default 'weekly' check (weigh_in_cadence in ('few_per_week', 'weekly', 'monthly', 'quarterly')),
  onboarded_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  mode             text not null check (mode in ('gain', 'lose', 'maintain')),
  pace             text not null check (pace in ('slow', 'standard', 'fast')),
  start_weight_kg  numeric(5,2) not null,
  goal_weight_kg   numeric(5,2),
  started_on       date not null,
  ended_on         date,
  plan             jsonb not null,             -- nutrition.Plan at creation (or last adaptive update)
  created_at       timestamptz not null default now()
);
create unique index goals_one_active on goals (user_id) where ended_on is null;

create table weigh_ins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  date       date not null,
  weight_kg  numeric(5,2) not null check (weight_kg between 20 and 400),
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ------------------------------------------------------------------ food ---

create table meal_slots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  name        text not null,
  position    int not null,
  schedule    text not null default 'daily' check (schedule in ('daily', 'gym_days')),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create index meal_slots_user on meal_slots (user_id, position);

create table foods (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references users(id) on delete cascade, -- null = shared
  name           text not null,
  brand          text,
  kcal_100g      numeric(7,2) not null,
  protein_100g   numeric(6,2) not null default 0,
  carbs_100g     numeric(6,2) not null default 0,
  fat_100g       numeric(6,2) not null default 0,
  serving_name   text,
  serving_grams  numeric(7,2),
  source         text not null default 'custom' check (source in ('custom', 'openfoodfacts', 'chain')),
  barcode        text,
  chain          text,
  created_at     timestamptz not null default now()
);
create index foods_owner on foods (owner_id);
create unique index foods_barcode on foods (barcode) where barcode is not null and owner_id is null;

create table saved_meals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  name                 text not null,
  default_meal_slot_id uuid references meal_slots(id) on delete set null,
  items                jsonb not null default '[]',  -- [{id,name,grams,kcal,protein_g,carbs_g,fat_g,assumption,source,is_addon}]
  last_used_at         timestamptz,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index saved_meals_user on saved_meals (user_id);

create table ai_estimates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  kind           text not null check (kind in ('photo', 'text', 'restaurant')),
  has_image      boolean not null default false,
  input_text     text,
  answers        jsonb,
  previous_id    uuid references ai_estimates(id) on delete set null,
  provider       text,
  model          text,
  result         jsonb,
  ok             boolean not null default false,
  error          text,
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  cost_usd       numeric(10,6) not null default 0,
  latency_ms     int not null default 0,
  created_at     timestamptz not null default now()
);
create index ai_estimates_user_time on ai_estimates (user_id, created_at desc);

create table log_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  date            date not null,
  meal_slot_id    uuid references meal_slots(id) on delete set null,
  meal_name       text not null,          -- slot name at the time, or a one-off meal's name
  name            text not null,
  origin          text not null check (origin in ('saved', 'ai', 'manual', 'search', 'barcode', 'restaurant')),
  saved_meal_id   uuid references saved_meals(id) on delete set null,
  ai_estimate_id  uuid references ai_estimates(id) on delete set null,
  items           jsonb not null default '[]',
  kcal            numeric(7,1) not null,
  protein_g       numeric(6,1) not null default 0,
  carbs_g         numeric(6,1) not null default 0,
  fat_g           numeric(6,1) not null default 0,
  logged_at       timestamptz not null default now()
);
create index log_entries_user_date on log_entries (user_id, date);

-- ------------------------------------------------------------------- gym ---

create table exercises (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references users(id) on delete cascade, -- null = shared library
  name           text not null,
  kind           text not null default 'strength' check (kind in ('strength', 'cardio')),
  muscle_group   text,
  equipment      text,
  media_url      text,
  gym_photo_url  text,
  created_at     timestamptz not null default now()
);
create unique index exercises_name on exercises (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table templates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  name            text not null,
  current_version int not null default 1,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index templates_user on templates (user_id);

-- Blocks are a JSON array: [{id, exercise_id, sets:[{warmup,target_kg,target_reps,to_failure}], cardio, rest_seconds, notes}].
create table template_versions (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references templates(id) on delete cascade,
  version      int not null,
  blocks       jsonb not null,
  created_at   timestamptz not null default now(),
  unique (template_id, version)
);

create table weekly_plan (
  user_id      uuid not null references users(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6), -- 0 = Monday
  template_id  uuid not null references templates(id) on delete cascade,
  primary key (user_id, weekday)
);

create table sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  date                 date not null,
  template_id          uuid references templates(id) on delete set null,
  template_version_id  uuid references template_versions(id) on delete set null,
  template_version     int,
  template_name        text,
  status               text not null default 'active' check (status in ('active', 'finished')),
  started_at           timestamptz not null default now(),
  finished_at          timestamptz
);
create index sessions_user_date on sessions (user_id, date desc);

create table session_blocks (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  position     int not null,
  exercise_id  uuid not null references exercises(id),
  skipped      boolean not null default false,
  cardio       jsonb,
  cardio_done  boolean not null default false,
  notes        text
);
create index session_blocks_session on session_blocks (session_id, position);

create table session_sets (
  id           uuid primary key default gen_random_uuid(),
  block_id     uuid not null references session_blocks(id) on delete cascade,
  position     int not null,
  warmup       boolean not null default false,
  target_kg    numeric(6,2),
  target_reps  int,
  to_failure   boolean not null default false,
  actual_kg    numeric(6,2),
  actual_reps  int,
  done         boolean not null default false,
  done_at      timestamptz
);
create index session_sets_block on session_sets (block_id, position);

-- ---------------------------------------------------------------- social ---

-- One row per pair, user_a < user_b.
create table friendships (
  user_a      uuid not null references users(id) on delete cascade,
  user_b      uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_b on friendships (user_b);

-- Per-direction settings: does user_id want pushes about friend_id's workouts.
create table friend_settings (
  user_id          uuid not null references users(id) on delete cascade,
  friend_id        uuid not null references users(id) on delete cascade,
  notify_workouts  boolean not null default true,
  primary key (user_id, friend_id)
);

create table sharing_settings (
  user_id          uuid primary key references users(id) on delete cascade,
  workouts         boolean not null default true,
  workout_details  boolean not null default false,
  records          boolean not null default true,
  weight_trend     boolean not null default false,
  food_streaks     boolean not null default false,
  updated_at       timestamptz not null default now()
);

create table notification_prefs (
  user_id          uuid primary key references users(id) on delete cascade,
  friend_workouts  boolean not null default true,
  cheers           boolean not null default true,
  meal_nudges      boolean not null default false,
  workout_day      boolean not null default true,
  weigh_in         boolean not null default true,
  weekly_checkin   boolean not null default true,
  quiet_from       time,
  quiet_to         time,
  updated_at       timestamptz not null default now()
);

create table activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null check (kind in ('workout_finished', 'record', 'weight_milestone', 'streak')),
  text        text not null,
  data        jsonb not null default '{}',
  session_id  uuid references sessions(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index activities_user_time on activities (user_id, created_at desc);

create table cheers (
  activity_id uuid not null references activities(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  failures         int not null default 0
);
create index push_subscriptions_user on push_subscriptions (user_id);
