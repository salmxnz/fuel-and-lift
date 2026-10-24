-- Sharing a meal or a gym template with friends. The payload is a snapshot
-- taken when it was sent (a meal's items already scaled to the friend's part,
-- a template's blocks with their exercises), so later edits stay the sender's.
create table shares (
  id            uuid primary key default gen_random_uuid(),
  from_user     uuid not null references users(id) on delete cascade,
  to_user       uuid not null references users(id) on delete cascade,
  kind          text not null check (kind in ('meal', 'template')),
  entry_id      uuid references log_entries(id) on delete set null,
  template_id   uuid references templates(id) on delete set null,
  split_ways    int check (split_ways between 2 and 11), -- null: shared whole
  payload       jsonb not null,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  check (from_user <> to_user)
);
create index shares_inbox on shares (to_user, status, created_at desc);
-- Sending the same thing to the same friend twice is a no-op while it waits.
create unique index shares_pending_entry on shares (entry_id, to_user) where status = 'pending' and entry_id is not null;
create unique index shares_pending_template on shares (template_id, to_user) where status = 'pending' and template_id is not null;

alter table log_entries drop constraint log_entries_origin_check;
alter table log_entries add constraint log_entries_origin_check
  check (origin in ('saved', 'ai', 'manual', 'search', 'barcode', 'restaurant', 'shared'));
