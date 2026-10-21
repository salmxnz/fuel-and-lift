-- When the user finished (or skipped) the post-onboarding walkthrough; null
-- means show it. Stored server-side so it doesn't reappear on another device.
alter table profiles add column tour_done_at timestamptz;
