-- Meal photos kept in Cloudflare R2. A photo is "pending" (entry_id null)
-- from the estimate until the meal is logged; pending photos older than a
-- day are cleaned up. Free users keep up to FREE_PHOTOS_STORED attached photos.
create table meal_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  estimate_id  uuid references ai_estimates(id) on delete set null,
  entry_id     uuid references log_entries(id) on delete set null,
  position     smallint not null default 0,
  object_key   text not null unique,
  content_type text not null default 'image/jpeg',
  bytes        int not null,
  created_at   timestamptz not null default now()
);
create index meal_photos_user_time on meal_photos (user_id, created_at desc);
create index meal_photos_entry on meal_photos (entry_id) where entry_id is not null;
create index meal_photos_pending on meal_photos (estimate_id, created_at) where entry_id is null;

-- How many photos an estimate was given (1–3); one estimate counts once
-- toward the free monthly photo estimates however many photos it had.
alter table ai_estimates add column image_count smallint not null default 0;
update ai_estimates set image_count = 1 where has_image;
