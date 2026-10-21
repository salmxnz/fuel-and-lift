-- Streak milestones ("is on a 7-day streak") are shared with friends by
-- default now; the switch (food_streaks) still turns them off.
alter table sharing_settings alter column food_streaks set default true;
