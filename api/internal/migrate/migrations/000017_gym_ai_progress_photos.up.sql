-- Exercises people make can be shown to friends or in the Shop, like
-- workouts. Adding someone else's exercise copies it (copied_from_id), so
-- templates and sessions only ever point at the library or your own.
alter table exercises
  add column visibility      text not null default 'private' check (visibility in ('private', 'friends', 'public')),
  add column published_at    timestamptz,
  add column copied_from_id  uuid references exercises(id) on delete set null,
  -- Finer than muscle_group, main one first ("rear delts", "upper chest"),
  -- so the Gym tab can say what hasn't been trained in a while.
  add column muscles         text[] not null default '{}';
create index exercises_shared on exercises (published_at desc)
  where owner_id is not null and visibility <> 'private';

-- Your own photo of the machine at your gym, for any exercise you can use
-- (library or yours). Small JPEGs kept in the database like avatars and
-- served by the web app at /exercise-photos/<id>?v=<updated_at>; friends see
-- the owner's photo of a shared exercise, the Shop never shows one.
create table exercise_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  exercise_id  uuid not null references exercises(id) on delete cascade,
  media_type   text not null,
  data         bytea not null,
  updated_at   timestamptz not null default now(),
  unique (user_id, exercise_id)
);

-- What was actually done on a cardio block (read off the machine's screen
-- or typed): {minutes, incline, speed, level, distance_km, kcal}.
alter table session_blocks add column cardio_actual jsonb;

-- Gym AI calls are logged like meal estimates (rate limits, budget) but
-- don't count toward the free monthly photo estimates.
alter table ai_estimates drop constraint ai_estimates_kind_check;
alter table ai_estimates add constraint ai_estimates_kind_check
  check (kind in ('photo', 'text', 'restaurant', 'exercise', 'cardio_screen'));

-- Progress photos: private to their owner, kept in R2 like meal photos.
create table progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  taken_on     date not null,
  pose         text not null default 'front' check (pose in ('front', 'side', 'back', 'other')),
  object_key   text not null unique,
  content_type text not null default 'image/jpeg',
  bytes        int not null,
  created_at   timestamptz not null default now()
);
create index progress_photos_user on progress_photos (user_id, taken_on desc, created_at desc);

-- Exercises added to one of this week's workouts for that week only (a
-- "you haven't trained forearms in a while" nudge). Starting that workout
-- in that week appends them, once.
create table week_extras (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  week_start   date not null, -- Monday
  template_id  uuid not null references templates(id) on delete cascade,
  exercise_id  uuid not null references exercises(id) on delete cascade,
  sets         jsonb not null default '[]',
  session_id   uuid references sessions(id) on delete set null, -- the session it went into
  created_at   timestamptz not null default now()
);
create index week_extras_pending on week_extras (user_id, week_start, template_id) where session_id is null;
