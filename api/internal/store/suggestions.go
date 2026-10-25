package store

import (
	"context"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

// LastTimeInSlot returns what the user logged in a meal the last time they
// logged it, within the two weeks before d (yesterday's breakfast, usually).
func (s *Store) LastTimeInSlot(ctx context.Context, userID, slotID string, d Date) ([]Entry, Date, error) {
	var last *time.Time
	if err := s.Pool.QueryRow(ctx, `
		select max(date) from log_entries where user_id = $1::uuid and meal_slot_id = $2::uuid and date < $3::date and date >= $3::date - 14`,
		userID, slotID, d.Time).Scan(&last); err != nil || last == nil {
		return []Entry{}, Date{}, err
	}
	rows, err := s.Pool.Query(ctx, `select `+entryCols+` from log_entries where user_id = $1::uuid and meal_slot_id = $2::uuid and date = $3
		order by logged_at`, userID, slotID, *last)
	if err != nil {
		return nil, Date{}, err
	}
	list, err := pgx.CollectRows(rows, scanEntry)
	return list, DateOf(*last), err
}

// UsualInSlot returns what the user logs most in a meal (twice or more in the
// last 30 days), most often first, the latest of each.
func (s *Store) UsualInSlot(ctx context.Context, userID, slotID string, d Date, limit int) ([]Entry, error) {
	rows, err := s.Pool.Query(ctx, `
		select `+entryCols+`, n from (
		  select distinct on (lower(name)) *, count(*) over (partition by lower(name)) as n
		  from log_entries where user_id = $1::uuid and meal_slot_id = $2::uuid and date < $3::date and date >= $3::date - 30
		  order by lower(name), logged_at desc
		) x where n >= 2`, userID, slotID, d.Time)
	if err != nil {
		return nil, err
	}
	type counted struct {
		e Entry
		n int
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (counted, error) {
		var c counted
		e, err := scanEntryWith(r, &c.n)
		c.e = e
		return c, err
	})
	if err != nil {
		return nil, err
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].n > list[j].n })
	out := []Entry{}
	for i, c := range list {
		if i == limit {
			break
		}
		out = append(out, c.e)
	}
	return out, nil
}

// RichIn returns the user's own past meals (last 60 days, one per name) that
// are rich in a nutrient for their calories and fit in maxKcal, best first.
func (s *Store) RichIn(ctx context.Context, userID, nutrient string, maxKcal float64, d Date, limit int) ([]Entry, error) {
	col := map[string]string{"protein": "protein_g", "carbs": "carbs_g", "fat": "fat_g"}[nutrient]
	if col == "" {
		return []Entry{}, nil
	}
	rows, err := s.Pool.Query(ctx, `
		select `+entryCols+` from (
		  select distinct on (lower(name)) * from log_entries
		  where user_id = $1::uuid and date >= $2::date - 60 and date <= $2::date and kcal between 60 and $3 and `+col+` >= 8
		  order by lower(name), logged_at desc
		) x order by `+col+` / greatest(kcal, 1) desc limit $4`, userID, d.Time, maxKcal, limit)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, scanEntry)
	if out == nil {
		out = []Entry{}
	}
	return out, err
}

// LogAgain copies one of the user's entries (items, macros, picture and how
// it was logged) onto a date and meal.
func (s *Store) LogAgain(ctx context.Context, userID, entryID string, d Date, slotID, mealName *string) (Entry, error) {
	rows, err := s.Pool.Query(ctx, `select `+entryCols+` from log_entries where id = $1::uuid and user_id = $2::uuid`, entryID, userID)
	if err != nil {
		return Entry{}, err
	}
	src, err := pgx.CollectExactlyOneRow(rows, scanEntry)
	if err != nil {
		return Entry{}, notFound(err)
	}
	origin := src.Origin
	if origin == "shared" {
		origin = "manual"
	}
	if slotID == nil && mealName == nil {
		slotID, mealName = src.MealSlotID, &src.MealName
	}
	return s.AddEntry(ctx, userID, d, NewEntry{
		MealSlotID: slotID, MealName: mealName, Name: src.Name, Origin: origin,
		SavedMealID: src.SavedMealID, Items: src.Items, Macros: src.Macros, Icon: src.Icon,
	})
}
