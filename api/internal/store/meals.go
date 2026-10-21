package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// --- meal slots (the user's own list of meals) -------------------------------

// MealSlot is one of the user's meals ("Breakfast", "Pre-workout").
type MealSlot struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Position int    `json:"position"`
	Schedule string `json:"schedule"` // daily | gym_days
}

func scanSlot(r pgx.CollectableRow) (MealSlot, error) {
	var m MealSlot
	return m, r.Scan(&m.ID, &m.Name, &m.Position, &m.Schedule)
}

// ListMealSlots returns the active slots in order.
func (s *Store) ListMealSlots(ctx context.Context, userID string) ([]MealSlot, error) {
	rows, err := s.Pool.Query(ctx, `
		select id::text, name, position, schedule from meal_slots
		where user_id = $1::uuid and archived_at is null order by position, created_at`, userID)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, scanSlot)
	if out == nil {
		out = []MealSlot{}
	}
	return out, err
}

// CreateMealSlot appends a slot.
func (s *Store) CreateMealSlot(ctx context.Context, userID, name, schedule string) (MealSlot, error) {
	rows, err := s.Pool.Query(ctx, `
		insert into meal_slots (user_id, name, schedule, position)
		values ($1::uuid, $2, $3, (select coalesce(max(position) + 1, 0) from meal_slots where user_id = $1::uuid and archived_at is null))
		returning id::text, name, position, schedule`, userID, name, schedule)
	if err != nil {
		return MealSlot{}, err
	}
	return pgx.CollectExactlyOneRow(rows, scanSlot)
}

// UpdateMealSlot renames or reschedules a slot.
func (s *Store) UpdateMealSlot(ctx context.Context, userID, id string, name, schedule *string) (MealSlot, error) {
	rows, err := s.Pool.Query(ctx, `
		update meal_slots set name = coalesce($3, name), schedule = coalesce($4, schedule)
		where id = $1::uuid and user_id = $2::uuid and archived_at is null
		returning id::text, name, position, schedule`, id, userID, name, schedule)
	if err != nil {
		return MealSlot{}, err
	}
	m, err := pgx.CollectExactlyOneRow(rows, scanSlot)
	return m, notFound(err)
}

// ReorderMealSlots sets positions from ids, which must be exactly the active slots.
func (s *Store) ReorderMealSlots(ctx context.Context, userID string, ids []string) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		var count int
		if err := tx.QueryRow(ctx, `
			select count(*) from meal_slots where user_id = $1::uuid and archived_at is null`, userID).Scan(&count); err != nil {
			return err
		}
		if count != len(ids) {
			return ErrConflict
		}
		for i, id := range ids {
			ct, err := tx.Exec(ctx, `update meal_slots set position = $3 where id = $1::uuid and user_id = $2::uuid and archived_at is null`, id, userID, i)
			if err != nil {
				return err
			}
			if ct.RowsAffected() == 0 {
				return ErrConflict
			}
		}
		return nil
	})
}

// ArchiveMealSlot hides a slot. Past entries keep their meal name.
func (s *Store) ArchiveMealSlot(ctx context.Context, userID, id string) error {
	ct, err := s.Pool.Exec(ctx, `update meal_slots set archived_at = now() where id = $1::uuid and user_id = $2::uuid and archived_at is null`, id, userID)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// --- entries -------------------------------------------------------------------

// EntryItem is one food inside an entry.
type EntryItem struct {
	Name       string   `json:"name"`
	Grams      *float64 `json:"grams"`
	Kcal       float64  `json:"kcal"`
	ProteinG   float64  `json:"protein_g"`
	CarbsG     float64  `json:"carbs_g"`
	FatG       float64  `json:"fat_g"`
	Assumption *string  `json:"assumption"`
	Source     string   `json:"source"` // official, ai, user, database
}

// Macros returns the item's macros.
func (i EntryItem) Macros() Macros { return Macros{i.Kcal, i.ProteinG, i.CarbsG, i.FatG} }

// SumItems totals a list of items.
func SumItems(items []EntryItem) Macros {
	var m Macros
	for _, i := range items {
		m = m.Add(i.Macros())
	}
	return m.Rounded()
}

// Entry is one logged thing.
type Entry struct {
	ID           string      `json:"id"`
	Date         Date        `json:"date"`
	MealSlotID   *string     `json:"meal_slot_id"`
	MealName     string      `json:"meal_name"`
	Name         string      `json:"name"`
	Origin       string      `json:"origin"`
	SavedMealID  *string     `json:"saved_meal_id"`
	AIEstimateID *string     `json:"ai_estimate_id"`
	Items        []EntryItem `json:"items"`
	Macros
	LoggedAt time.Time `json:"logged_at"`
}

const entryCols = `id::text, date, meal_slot_id::text, meal_name, name, origin, saved_meal_id::text, ai_estimate_id::text,
	items, kcal::float8, protein_g::float8, carbs_g::float8, fat_g::float8, logged_at`

func scanEntry(r pgx.CollectableRow) (Entry, error) {
	var e Entry
	var d time.Time
	var items []byte
	err := r.Scan(&e.ID, &d, &e.MealSlotID, &e.MealName, &e.Name, &e.Origin, &e.SavedMealID, &e.AIEstimateID,
		&items, &e.Kcal, &e.ProteinG, &e.CarbsG, &e.FatG, &e.LoggedAt)
	if err != nil {
		return e, err
	}
	e.Date = DateOf(d)
	if err := json.Unmarshal(items, &e.Items); err != nil {
		return e, err
	}
	if e.Items == nil {
		e.Items = []EntryItem{}
	}
	return e, nil
}

// NewEntry is a request to log something.
type NewEntry struct {
	MealSlotID   *string
	MealName     *string // a one-off meal when MealSlotID is nil
	Name         string
	Origin       string
	SavedMealID  *string
	AIEstimateID *string
	Items        []EntryItem
	Macros       Macros // used when Items is empty
}

// resolveMeal returns the meal name for a slot the user owns, or the one-off name.
func resolveMeal(ctx context.Context, q pgx.Tx, userID string, slotID, mealName *string) (*string, string, error) {
	if slotID != nil && *slotID != "" {
		var name string
		err := q.QueryRow(ctx, `select name from meal_slots where id = $1::uuid and user_id = $2::uuid and archived_at is null`, *slotID, userID).Scan(&name)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", ErrNotFound
		}
		return slotID, name, err
	}
	if mealName != nil && *mealName != "" {
		return nil, *mealName, nil
	}
	return nil, "", ErrConflict
}

// ErrNoMeal is returned when an entry names neither a slot nor a one-off meal.
var ErrNoMeal = errors.New("give meal_slot_id or meal_name")

// AddEntry logs an entry on a date.
func (s *Store) AddEntry(ctx context.Context, userID string, d Date, in NewEntry) (Entry, error) {
	var out Entry
	err := s.tx(ctx, func(tx pgx.Tx) error {
		slotID, meal, err := resolveMeal(ctx, tx, userID, in.MealSlotID, in.MealName)
		if errors.Is(err, ErrConflict) {
			return ErrNoMeal
		}
		if err != nil {
			return err
		}
		if in.AIEstimateID != nil {
			var ok bool
			if err := tx.QueryRow(ctx, `select exists(select 1 from ai_estimates where id = $1::uuid and user_id = $2::uuid)`, *in.AIEstimateID, userID).Scan(&ok); err != nil {
				return err
			}
			if !ok {
				in.AIEstimateID = nil
			}
		}
		if in.Items == nil {
			in.Items = []EntryItem{}
		}
		m := in.Macros.Rounded()
		if len(in.Items) > 0 {
			m = SumItems(in.Items)
		}
		items, _ := json.Marshal(in.Items)
		rows, err := tx.Query(ctx, `
			insert into log_entries (user_id, date, meal_slot_id, meal_name, name, origin, saved_meal_id, ai_estimate_id, items, kcal, protein_g, carbs_g, fat_g)
			values ($1::uuid, $2, $3::uuid, $4, $5, $6, $7::uuid, $8::uuid, $9, $10, $11, $12, $13)
			returning `+entryCols,
			userID, d.Time, slotID, meal, in.Name, in.Origin, in.SavedMealID, in.AIEstimateID, items, m.Kcal, m.ProteinG, m.CarbsG, m.FatG)
		if err != nil {
			return err
		}
		out, err = pgx.CollectExactlyOneRow(rows, scanEntry)
		return err
	})
	return out, err
}

// EntryPatch changes parts of an entry.
type EntryPatch struct {
	Name       *string
	MealSlotID *string
	MealName   *string
	Items      *[]EntryItem
}

// UpdateEntry edits one of the user's entries.
func (s *Store) UpdateEntry(ctx context.Context, userID, id string, p EntryPatch) (Entry, error) {
	var out Entry
	err := s.tx(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select `+entryCols+` from log_entries where id = $1::uuid and user_id = $2::uuid for update`, id, userID)
		if err != nil {
			return err
		}
		e, err := pgx.CollectExactlyOneRow(rows, scanEntry)
		if err != nil {
			return notFound(err)
		}
		if p.Name != nil {
			e.Name = *p.Name
		}
		if p.MealSlotID != nil || p.MealName != nil {
			slotID, meal, err := resolveMeal(ctx, tx, userID, p.MealSlotID, p.MealName)
			if errors.Is(err, ErrConflict) {
				return ErrNoMeal
			}
			if err != nil {
				return err
			}
			e.MealSlotID, e.MealName = slotID, meal
		}
		m := e.Macros
		if p.Items != nil {
			e.Items = *p.Items
			if e.Items == nil {
				e.Items = []EntryItem{}
			}
			m = SumItems(e.Items)
		}
		items, _ := json.Marshal(e.Items)
		rows, err = tx.Query(ctx, `
			update log_entries set name = $3, meal_slot_id = $4::uuid, meal_name = $5, items = $6,
			       kcal = $7, protein_g = $8, carbs_g = $9, fat_g = $10
			where id = $1::uuid and user_id = $2::uuid returning `+entryCols,
			id, userID, e.Name, e.MealSlotID, e.MealName, items, m.Kcal, m.ProteinG, m.CarbsG, m.FatG)
		if err != nil {
			return err
		}
		out, err = pgx.CollectExactlyOneRow(rows, scanEntry)
		return err
	})
	return out, err
}

// DeleteEntry removes an entry and returns its date.
func (s *Store) DeleteEntry(ctx context.Context, userID, id string) (Date, error) {
	var d time.Time
	err := s.Pool.QueryRow(ctx, `delete from log_entries where id = $1::uuid and user_id = $2::uuid returning date`, id, userID).Scan(&d)
	return DateOf(d), notFound(err)
}

// DayMeal groups a day's entries under one meal.
type DayMeal struct {
	MealSlotID *string `json:"meal_slot_id"`
	Name       string  `json:"name"`
	Entries    []Entry `json:"entries"`
	Totals     Macros  `json:"totals"`
}

// Day is everything the Today screen needs.
type Day struct {
	Date          Date      `json:"date"`
	Target        Macros    `json:"target"`
	Totals        Macros    `json:"totals"`
	RemainingKcal float64   `json:"remaining_kcal"`
	IsGymDay      bool      `json:"is_gym_day"`
	Meals         []DayMeal `json:"meals"`
}

// IsGymDay reports whether a template is planned for the weekday or a session
// exists on the date.
func (s *Store) IsGymDay(ctx context.Context, userID string, d Date) (bool, error) {
	var ok bool
	err := s.Pool.QueryRow(ctx, `
		select exists(select 1 from weekly_plan where user_id = $1::uuid and weekday = $2)
		    or exists(select 1 from sessions where user_id = $1::uuid and date = $3)`,
		userID, d.Weekday0(), d.Time).Scan(&ok)
	return ok, err
}

// GetDay assembles a day: the user's slots in order (gym-day slots only on gym
// days, or when they already hold entries), then one-off meals in the order
// they were first logged.
func (s *Store) GetDay(ctx context.Context, userID string, d Date, target Macros) (Day, error) {
	day := Day{Date: d, Target: target, Meals: []DayMeal{}}
	slots, err := s.ListMealSlots(ctx, userID)
	if err != nil {
		return day, err
	}
	gym, err := s.IsGymDay(ctx, userID, d)
	if err != nil {
		return day, err
	}
	day.IsGymDay = gym
	rows, err := s.Pool.Query(ctx, `select `+entryCols+` from log_entries where user_id = $1::uuid and date = $2 order by logged_at`, userID, d.Time)
	if err != nil {
		return day, err
	}
	entries, err := pgx.CollectRows(rows, scanEntry)
	if err != nil {
		return day, err
	}

	bySlot := map[string][]Entry{}
	var oneOffOrder []string
	oneOff := map[string][]Entry{}
	active := map[string]bool{}
	for _, sl := range slots {
		active[sl.ID] = true
	}
	for _, e := range entries {
		if e.MealSlotID != nil && active[*e.MealSlotID] {
			bySlot[*e.MealSlotID] = append(bySlot[*e.MealSlotID], e)
			continue
		}
		if _, seen := oneOff[e.MealName]; !seen {
			oneOffOrder = append(oneOffOrder, e.MealName)
		}
		oneOff[e.MealName] = append(oneOff[e.MealName], e)
	}
	add := func(id *string, name string, es []Entry) {
		if es == nil {
			es = []Entry{}
		}
		var t Macros
		for _, e := range es {
			t = t.Add(e.Macros)
		}
		day.Meals = append(day.Meals, DayMeal{MealSlotID: id, Name: name, Entries: es, Totals: t.Rounded()})
		day.Totals = day.Totals.Add(t)
	}
	for _, sl := range slots {
		es := bySlot[sl.ID]
		if sl.Schedule == "gym_days" && !gym && len(es) == 0 {
			continue
		}
		id := sl.ID
		add(&id, sl.Name, es)
	}
	for _, name := range oneOffOrder {
		add(nil, name, oneOff[name])
	}
	day.Totals = day.Totals.Rounded()
	day.RemainingKcal = target.Kcal - day.Totals.Kcal
	return day, nil
}

// DailyTotals returns kcal and protein per logged day in [from, to].
func (s *Store) DailyTotals(ctx context.Context, userID string, from, to Date) (map[string]Macros, error) {
	rows, err := s.Pool.Query(ctx, `
		select date, sum(kcal)::float8, sum(protein_g)::float8, sum(carbs_g)::float8, sum(fat_g)::float8
		from log_entries where user_id = $1::uuid and date between $2 and $3 group by date`, userID, from.Time, to.Time)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Macros{}
	for rows.Next() {
		var d time.Time
		var m Macros
		if err := rows.Scan(&d, &m.Kcal, &m.ProteinG, &m.CarbsG, &m.FatG); err != nil {
			return nil, err
		}
		out[DateOf(d).String()] = m.Rounded()
	}
	return out, rows.Err()
}

// --- saved meals -------------------------------------------------------------

// SavedItem is an item of a saved meal.
type SavedItem struct {
	ID string `json:"id"`
	EntryItem
	IsAddon bool `json:"is_addon"`
}

// SavedMeal is a reusable meal like "Usual breakfast".
type SavedMeal struct {
	ID                string      `json:"id"`
	Name              string      `json:"name"`
	DefaultMealSlotID *string     `json:"default_meal_slot_id"`
	Items             []SavedItem `json:"items"`
	Base              Macros      `json:"base"`
	LastUsedAt        *time.Time  `json:"last_used_at"`
}

const savedCols = `id::text, name, default_meal_slot_id::text, items, last_used_at`

func scanSaved(r pgx.CollectableRow) (SavedMeal, error) {
	var m SavedMeal
	var raw []byte
	if err := r.Scan(&m.ID, &m.Name, &m.DefaultMealSlotID, &raw, &m.LastUsedAt); err != nil {
		return m, err
	}
	if err := json.Unmarshal(raw, &m.Items); err != nil {
		return m, err
	}
	if m.Items == nil {
		m.Items = []SavedItem{}
	}
	var base []EntryItem
	for _, i := range m.Items {
		if !i.IsAddon {
			base = append(base, i.EntryItem)
		}
	}
	m.Base = SumItems(base)
	return m, nil
}

// ListSavedMeals returns saved meals, most recently used first.
func (s *Store) ListSavedMeals(ctx context.Context, userID string) ([]SavedMeal, error) {
	rows, err := s.Pool.Query(ctx, `select `+savedCols+` from saved_meals
		where user_id = $1::uuid and archived_at is null order by last_used_at desc nulls last, created_at desc`, userID)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, scanSaved)
	if out == nil {
		out = []SavedMeal{}
	}
	return out, err
}

// GetSavedMeal returns one saved meal.
func (s *Store) GetSavedMeal(ctx context.Context, userID, id string) (SavedMeal, error) {
	rows, err := s.Pool.Query(ctx, `select `+savedCols+` from saved_meals where id = $1::uuid and user_id = $2::uuid and archived_at is null`, id, userID)
	if err != nil {
		return SavedMeal{}, err
	}
	m, err := pgx.CollectExactlyOneRow(rows, scanSaved)
	return m, notFound(err)
}

// SaveMeal creates (id == "") or replaces a saved meal.
func (s *Store) SaveMeal(ctx context.Context, userID, id, name string, slotID *string, items []SavedItem) (SavedMeal, error) {
	if slotID != nil {
		var ok bool
		if err := s.Pool.QueryRow(ctx, `select exists(select 1 from meal_slots where id = $1::uuid and user_id = $2::uuid)`, *slotID, userID).Scan(&ok); err != nil {
			return SavedMeal{}, err
		}
		if !ok {
			slotID = nil
		}
	}
	raw, _ := json.Marshal(items)
	var rows pgx.Rows
	var err error
	if id == "" {
		rows, err = s.Pool.Query(ctx, `insert into saved_meals (user_id, name, default_meal_slot_id, items) values ($1::uuid, $2, $3::uuid, $4) returning `+savedCols,
			userID, name, slotID, raw)
	} else {
		rows, err = s.Pool.Query(ctx, `update saved_meals set name = $3, default_meal_slot_id = $4::uuid, items = $5, updated_at = now()
			where id = $1::uuid and user_id = $2::uuid and archived_at is null returning `+savedCols, id, userID, name, slotID, raw)
	}
	if err != nil {
		return SavedMeal{}, err
	}
	m, err := pgx.CollectExactlyOneRow(rows, scanSaved)
	return m, notFound(err)
}

// ArchiveSavedMeal removes a saved meal from the list.
func (s *Store) ArchiveSavedMeal(ctx context.Context, userID, id string) error {
	ct, err := s.Pool.Exec(ctx, `update saved_meals set archived_at = now() where id = $1::uuid and user_id = $2::uuid and archived_at is null`, id, userID)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// LogSavedMeal logs the base items plus the chosen add-ons as one entry.
func (s *Store) LogSavedMeal(ctx context.Context, userID string, d Date, id string, slotID, mealName *string, addonIDs []string) (Entry, error) {
	m, err := s.GetSavedMeal(ctx, userID, id)
	if err != nil {
		return Entry{}, err
	}
	want := map[string]bool{}
	for _, a := range addonIDs {
		want[a] = true
	}
	var items []EntryItem
	for _, i := range m.Items {
		if !i.IsAddon || want[i.ID] {
			items = append(items, i.EntryItem)
		}
	}
	if slotID == nil && mealName == nil {
		slotID = m.DefaultMealSlotID
	}
	e, err := s.AddEntry(ctx, userID, d, NewEntry{
		MealSlotID: slotID, MealName: mealName, Name: m.Name, Origin: "saved", SavedMealID: &m.ID, Items: items,
	})
	if err != nil {
		return e, err
	}
	_, err = s.Pool.Exec(ctx, `update saved_meals set last_used_at = now() where id = $1::uuid`, m.ID)
	return e, err
}
