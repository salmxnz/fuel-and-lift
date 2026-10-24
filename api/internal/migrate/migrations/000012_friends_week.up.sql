-- Friends tab: weekly summaries, profile photos and scheduled reminders.

-- Friends see your week (days on target, never calories) unless you turn it off.
alter table sharing_settings add column weekly_summary boolean not null default true;

alter table notification_prefs
  add column streak_risk  boolean not null default true,
  add column friend_goals boolean not null default true;

-- Optional local time to be reminded to log this meal.
alter table meal_slots add column remind_at time;

-- avatar_url is what everyone sees: an uploaded photo when there is one,
-- else the Google picture, which is kept here so removing a photo restores it.
alter table users add column google_avatar_url text;
update users set google_avatar_url = avatar_url;

create table user_avatars (
  user_id    uuid primary key references users(id) on delete cascade,
  media_type text not null,
  data       bytea not null,
  updated_at timestamptz not null default now()
);

-- One row per scheduled push sent, so a reminder goes out once even across
-- restarts and several API instances.
create table notification_log (
  user_id uuid not null references users(id) on delete cascade,
  kind    text not null,
  ref     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
