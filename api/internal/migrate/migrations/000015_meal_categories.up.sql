-- A category on logged and saved meals ("Takeaway", "Home-cooked", ...), so
-- saved meals can be filtered and the day reads at a glance. Null = none.
alter table log_entries
  add column category text
    check (category in ('home', 'takeaway', 'eating_out', 'snack', 'sweet', 'drink', 'protein'));

alter table saved_meals
  add column category text
    check (category in ('home', 'takeaway', 'eating_out', 'snack', 'sweet', 'drink', 'protein'));
