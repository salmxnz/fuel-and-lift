-- Admins can suspend an account: no sign-in, no refresh. The reason is only
-- shown in the admin app. The users list sorts newest first.
alter table users
  add column suspended_at     timestamptz,
  add column suspended_reason text check (char_length(suspended_reason) <= 300);
create index users_created on users (created_at desc);
