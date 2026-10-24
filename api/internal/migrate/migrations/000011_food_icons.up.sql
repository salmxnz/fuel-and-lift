-- A food picture for entries and saved meals: a key from
-- api/internal/foodicon (null = none, the app picks a default).
alter table log_entries add column icon text;
alter table saved_meals add column icon text;
