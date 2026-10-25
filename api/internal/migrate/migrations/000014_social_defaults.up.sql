-- Sharing by default, meals and live training for friends, and training
-- together.

-- New saved meals, workouts and routines start with this visibility. Turning
-- it to friends (or public) can also open up everything that's still private.
alter table sharing_settings
  add column default_visibility text not null default 'private'
    check (default_visibility in ('private', 'friends', 'public')),
  -- Friends see what you log (names and times, never calories): their
  -- profile's "Today" and "join them" suggestions.
  add column meals boolean not null default false,
  -- Friends see when you're at the gym, and can join your workout.
  add column training_now boolean not null default true;

alter table notification_prefs
  add column friend_shares   boolean not null default true,  -- a friend put a workout, meal or routine out for you
  add column friend_training boolean not null default true;  -- a friend started a workout / joined yours

-- "Training now" and "shared something" in the feed.
alter table activities drop constraint activities_kind_check;
alter table activities add constraint activities_kind_check check (kind in
  ('workout_finished', 'record', 'weight_milestone', 'streak', 'workout_started', 'shared_item'));

-- Two sessions done together: one row each way, so either side finds the other.
create table session_partners (
  session_id         uuid not null references sessions(id) on delete cascade,
  partner_session_id uuid not null references sessions(id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (session_id, partner_session_id),
  check (session_id <> partner_session_id)
);
