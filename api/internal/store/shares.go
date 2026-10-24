package store

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrAlreadySplit is returned when splitting a meal that was split before:
// splitting again would shrink the sender's part a second time.
var ErrAlreadySplit = errors.New("this meal is already split; change the amounts by hand instead")

// ErrNotFriends is returned when sharing with someone who isn't a friend.
var ErrNotFriends = errors.New("you can only share with friends")

// Share is something a friend sent, as the recipient sees it.
type Share struct {
	ID        string          `json:"id"`
	Kind      string          `json:"kind"` // meal | template | routine
	From      Person          `json:"from"`
	SplitWays *int            `json:"split_ways"` // meals split between this many people; null = shared whole
	CreatedAt time.Time       `json:"created_at"`
	Meal      *SharedMeal     `json:"meal"`
	Template  *SharedTemplate `json:"template"`
	Routine   *SharedRoutine  `json:"routine"`
}

// SharedRoutine is a routine with a snapshot of each of its workouts.
type SharedRoutine struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	// Days maps a weekday to an index into Workouts (null = rest).
	Days     map[string]*int  `json:"days"`
	Workouts []SharedTemplate `json:"workouts"`
}

// SharedMeal is the friend's part of a meal: items already scaled when split.
type SharedMeal struct {
	Date     Date        `json:"date"`
	Name     string      `json:"name"`
	MealName string      `json:"meal_name"`
	Items    []EntryItem `json:"items"`
	Macros
}

// SharedTemplate describes a template; Blocks are kept for the copy.
type SharedTemplate struct {
	Name      string        `json:"name"`
	Exercises []string      `json:"exercises"`
	Blocks    []sharedBlock `json:"blocks,omitempty"`
}

// sharedBlock carries the exercise itself so a custom one can be recreated
// in the recipient's library.
type sharedBlock struct {
	Exercise    Exercise     `json:"exercise"`
	Sets        []PlannedSet `json:"sets"`
	Cardio      *Cardio      `json:"cardio"`
	RestSeconds *int         `json:"rest_seconds"`
	Notes       *string      `json:"notes"`
}

// ScaleItems returns items multiplied by f (a part of a split meal).
func ScaleItems(items []EntryItem, f float64) []EntryItem {
	out := make([]EntryItem, len(items))
	for i, it := range items {
		if it.Grams != nil {
			g := math.Round(*it.Grams * f)
			it.Grams = &g
		}
		m := Macros{it.Kcal * f, it.ProteinG * f, it.CarbsG * f, it.FatG * f}.Rounded()
		it.Kcal, it.ProteinG, it.CarbsG, it.FatG = m.Kcal, m.ProteinG, m.CarbsG, m.FatG
		out[i] = it
	}
	return out
}

func checkFriends(ctx context.Context, tx pgx.Tx, userID string, friendIDs []string) error {
	var n int
	err := tx.QueryRow(ctx, `select count(*) from (`+friendIDsSQL+`) as f(id) where f.id = any($2::uuid[])`, userID, friendIDs).Scan(&n)
	if err != nil {
		return err
	}
	if n != len(friendIDs) {
		return ErrNotFriends
	}
	return nil
}

// shareRef is what a share was made from: one of the three is set.
type shareRef struct{ entryID, templateID, routineID *string }

func insertShares(ctx context.Context, tx pgx.Tx, from, kind string, ref shareRef, split *int, payload any, to []string) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	for _, id := range to {
		if _, err := tx.Exec(ctx, `
			insert into shares (from_user, to_user, kind, entry_id, template_id, routine_id, split_ways, payload)
			values ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6::uuid, $7, $8) on conflict do nothing`,
			from, id, kind, ref.entryID, ref.templateID, ref.routineID, split, raw); err != nil {
			return err
		}
	}
	return nil
}

// ShareMeal sends one of the user's entries to friends. Split divides it
// equally between the user and every friend: the user's own entry shrinks to
// their part right away and each friend is offered the same part. Otherwise
// each friend is offered the whole meal (they had the same thing).
func (s *Store) ShareMeal(ctx context.Context, userID, entryID string, friendIDs []string, split bool) (Entry, error) {
	var out Entry
	err := s.tx(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select `+entryCols+` from log_entries where id = $1::uuid and user_id = $2::uuid for update`, entryID, userID)
		if err != nil {
			return err
		}
		e, err := pgx.CollectExactlyOneRow(rows, scanEntry)
		if err != nil {
			return notFound(err)
		}
		if err := checkFriends(ctx, tx, userID, friendIDs); err != nil {
			return err
		}
		var ways *int
		if split {
			var done bool
			if err := tx.QueryRow(ctx, `select exists(select 1 from shares where entry_id = $1::uuid and split_ways is not null)`, entryID).Scan(&done); err != nil {
				return err
			}
			if done {
				return ErrAlreadySplit
			}
			n := len(friendIDs) + 1
			ways = &n
			f := 1 / float64(n)
			m := Macros{e.Kcal * f, e.ProteinG * f, e.CarbsG * f, e.FatG * f}.Rounded()
			if len(e.Items) > 0 {
				e.Items = ScaleItems(e.Items, f)
				m = SumItems(e.Items)
			}
			items, _ := json.Marshal(e.Items)
			rows, err := tx.Query(ctx, `
				update log_entries set items = $2, kcal = $3, protein_g = $4, carbs_g = $5, fat_g = $6
				where id = $1::uuid returning `+entryCols, entryID, items, m.Kcal, m.ProteinG, m.CarbsG, m.FatG)
			if err != nil {
				return err
			}
			if e, err = pgx.CollectExactlyOneRow(rows, scanEntry); err != nil {
				return err
			}
		}
		out = e
		meal := SharedMeal{Date: e.Date, Name: e.Name, MealName: e.MealName, Items: e.Items, Macros: e.Macros}
		return insertShares(ctx, tx, userID, "meal", shareRef{entryID: &entryID}, ways, meal, friendIDs)
	})
	return out, err
}

// ShareTemplate sends a copy of a template's current version to friends.
func (s *Store) ShareTemplate(ctx context.Context, userID, templateID string, friendIDs []string) (Template, error) {
	t, err := s.GetTemplate(ctx, userID, templateID)
	if err != nil {
		return t, err
	}
	payload := snapshotTemplate(t)
	err = s.tx(ctx, func(tx pgx.Tx) error {
		if err := checkFriends(ctx, tx, userID, friendIDs); err != nil {
			return err
		}
		return insertShares(ctx, tx, userID, "template", shareRef{templateID: &templateID}, nil, payload, friendIDs)
	})
	return t, err
}

// snapshotRoutine is a routine with each workout snapshotted.
func (s *Store) snapshotRoutine(ctx context.Context, r Routine) (SharedRoutine, error) {
	out := SharedRoutine{Name: r.Name, Description: r.Description, Days: map[string]*int{}, Workouts: []SharedTemplate{}}
	var ids []string
	for _, d := range Weekdays {
		if day := r.Days[d]; day != nil {
			ids = append(ids, day.TemplateID)
		}
	}
	rows, err := s.templateRowsByIDs(ctx, ids)
	if err != nil {
		return out, err
	}
	tpls, err := s.expand(ctx, rows)
	if err != nil {
		return out, err
	}
	index := map[string]int{}
	for _, d := range Weekdays {
		out.Days[d] = nil
		day := r.Days[d]
		if day == nil {
			continue
		}
		i, ok := index[day.TemplateID]
		if !ok {
			for _, t := range tpls {
				if t.ID == day.TemplateID {
					i = len(out.Workouts)
					index[t.ID] = i
					out.Workouts = append(out.Workouts, snapshotTemplate(t))
					ok = true
				}
			}
		}
		if ok {
			out.Days[d] = &i
		}
	}
	return out, nil
}

// ShareRoutine sends a copy of a routine and its workouts to friends.
func (s *Store) ShareRoutine(ctx context.Context, userID, routineID string, friendIDs []string) (Routine, error) {
	r, err := s.GetRoutine(ctx, userID, routineID)
	if err != nil {
		return r, err
	}
	payload, err := s.snapshotRoutine(ctx, r)
	if err != nil {
		return r, err
	}
	err = s.tx(ctx, func(tx pgx.Tx) error {
		if err := checkFriends(ctx, tx, userID, friendIDs); err != nil {
			return err
		}
		return insertShares(ctx, tx, userID, "routine", shareRef{routineID: &routineID}, nil, payload, friendIDs)
	})
	return r, err
}

const shareCols = `sh.id::text, sh.kind, u.id::text, coalesce(p.display_name, u.name), u.avatar_url, sh.split_ways, sh.created_at, sh.payload`

func scanShare(r pgx.CollectableRow) (Share, error) {
	var sh Share
	var raw []byte
	if err := r.Scan(&sh.ID, &sh.Kind, &sh.From.ID, &sh.From.Name, &sh.From.AvatarURL, &sh.SplitWays, &sh.CreatedAt, &raw); err != nil {
		return sh, err
	}
	switch sh.Kind {
	case "meal":
		sh.Meal = &SharedMeal{}
		if err := json.Unmarshal(raw, sh.Meal); err != nil {
			return sh, err
		}
		if sh.Meal.Items == nil {
			sh.Meal.Items = []EntryItem{}
		}
	case "template":
		sh.Template = &SharedTemplate{}
		if err := json.Unmarshal(raw, sh.Template); err != nil {
			return sh, err
		}
	case "routine":
		sh.Routine = &SharedRoutine{}
		if err := json.Unmarshal(raw, sh.Routine); err != nil {
			return sh, err
		}
	}
	return sh, nil
}

// IncomingShares returns what friends sent the user that's still waiting,
// newest first. kind "" means every kind. Shares from someone who is no
// longer a friend are hidden.
func (s *Store) IncomingShares(ctx context.Context, userID, kind string) ([]Share, error) {
	rows, err := s.Pool.Query(ctx, `
		select `+shareCols+`
		from shares sh join users u on u.id = sh.from_user
		left join profiles p on p.user_id = u.id
		where sh.to_user = $1::uuid and sh.status = 'pending' and ($2 = '' or sh.kind = $2)
		  and sh.from_user in (`+friendIDsSQL+`)
		order by sh.created_at desc limit 20`, userID, kind)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, scanShare)
	if out == nil {
		out = []Share{}
	}
	for i := range out {
		if out[i].Template != nil {
			out[i].Template.Blocks = nil // the list only needs names
		}
		if out[i].Routine != nil {
			for j := range out[i].Routine.Workouts {
				out[i].Routine.Workouts[j].Blocks = nil
			}
		}
	}
	return out, err
}

// lockShare loads a pending share sent to userID by a current friend.
func lockShare(ctx context.Context, tx pgx.Tx, userID, id string) (Share, error) {
	rows, err := tx.Query(ctx, `
		select `+shareCols+`
		from shares sh join users u on u.id = sh.from_user
		left join profiles p on p.user_id = u.id
		where sh.id = $2::uuid and sh.to_user = $1::uuid and sh.status = 'pending'
		  and sh.from_user in (`+friendIDsSQL+`)
		for update of sh`, userID, id)
	if err != nil {
		return Share{}, err
	}
	sh, err := pgx.CollectExactlyOneRow(rows, scanShare)
	return sh, notFound(err)
}

func respond(ctx context.Context, tx pgx.Tx, id, status string) error {
	_, err := tx.Exec(ctx, `update shares set status = $2, responded_at = now() where id = $1::uuid`, id, status)
	return err
}

// ShareKind returns the kind of a pending share sent to the user.
func (s *Store) ShareKind(ctx context.Context, userID, id string) (kind string, date Date, err error) {
	var raw []byte
	err = s.Pool.QueryRow(ctx, `select kind, payload from shares where id = $1::uuid and to_user = $2::uuid and status = 'pending'`, id, userID).Scan(&kind, &raw)
	if err != nil {
		return "", date, notFound(err)
	}
	if kind == "meal" {
		var m SharedMeal
		_ = json.Unmarshal(raw, &m)
		date = m.Date
	}
	return kind, date, nil
}

// AcceptMealShare logs the friend's part of a shared meal on date.
func (s *Store) AcceptMealShare(ctx context.Context, userID, id string, d Date, slotID, mealName *string) (Entry, error) {
	var out Entry
	err := s.tx(ctx, func(tx pgx.Tx) error {
		sh, err := lockShare(ctx, tx, userID, id)
		if err != nil {
			return err
		}
		if sh.Meal == nil {
			return ErrNotFound
		}
		out, err = addEntry(ctx, tx, userID, d, NewEntry{
			MealSlotID: slotID, MealName: mealName, Name: sh.Meal.Name, Origin: "shared",
			Items: sh.Meal.Items, Macros: sh.Meal.Macros,
		})
		if err != nil {
			return err
		}
		return respond(ctx, tx, id, "accepted")
	})
	return out, err
}

// AcceptTemplateShare copies a shared template into the user's templates.
// Library exercises are used as they are; the sender's own exercises are
// matched by name in the user's library, or created there.
func (s *Store) AcceptTemplateShare(ctx context.Context, userID, id string) (Template, error) {
	var tplID string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		sh, err := lockShare(ctx, tx, userID, id)
		if err != nil {
			return err
		}
		if sh.Template == nil {
			return ErrNotFound
		}
		w, err := copyWorkout(ctx, tx, userID, *sh.Template, sh.From.Name)
		if err != nil {
			return err
		}
		if tplID, err = createTemplate(ctx, tx, userID, w.Name, w.Blocks); err != nil {
			return err
		}
		return respond(ctx, tx, id, "accepted")
	})
	if err != nil {
		return Template{}, err
	}
	return s.GetTemplate(ctx, userID, tplID)
}

// AcceptRoutineShare copies a shared routine and its workouts into the
// user's account. Their week is left alone until they apply it.
func (s *Store) AcceptRoutineShare(ctx context.Context, userID, id string) (Routine, error) {
	var routineID string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		sh, err := lockShare(ctx, tx, userID, id)
		if err != nil {
			return err
		}
		if sh.Routine == nil {
			return ErrNotFound
		}
		seed, err := routineSeedFrom(ctx, tx, userID, *sh.Routine, sh.From.Name)
		if err != nil {
			return err
		}
		if routineID, err = seedRoutine(ctx, tx, userID, seed); err != nil {
			return err
		}
		return respond(ctx, tx, id, "accepted")
	})
	if err != nil {
		return Routine{}, err
	}
	return s.GetRoutine(ctx, userID, routineID)
}

// routineSeedFrom copies a routine snapshot's workouts into userID's account
// and maps its days onto them.
func routineSeedFrom(ctx context.Context, tx pgx.Tx, userID string, r SharedRoutine, fromName string) (RoutineSeed, error) {
	seed := RoutineSeed{Name: r.Name, Description: r.Description, Days: map[int]int{}, MakeRoutine: true}
	for _, t := range r.Workouts {
		w, err := copyWorkout(ctx, tx, userID, t, fromName)
		if err != nil {
			return seed, err
		}
		seed.Workouts = append(seed.Workouts, w)
	}
	for i, d := range Weekdays {
		if w := r.Days[d]; w != nil && *w >= 0 && *w < len(seed.Workouts) {
			seed.Days[i] = *w
		}
	}
	return seed, nil
}

// copyName keeps a shared template's name unless the user already has one
// called that, then adds the sender's first name: "Lower-1 (Sam)".
func copyName(ctx context.Context, tx pgx.Tx, userID, name, from string) (string, error) {
	var taken bool
	if err := tx.QueryRow(ctx, `select exists(select 1 from templates where user_id = $1::uuid and archived_at is null and lower(name) = lower($2))`,
		userID, name).Scan(&taken); err != nil || !taken {
		return name, err
	}
	first := strings.Fields(from)
	if len(first) == 0 {
		return name, nil
	}
	suffix := " (" + first[0] + ")"
	if r := []rune(name); len(r)+len([]rune(suffix)) > 40 {
		name = strings.TrimSpace(string(r[:max(0, 40-len([]rune(suffix)))]))
	}
	return name + suffix, nil
}

// ownExercise finds the user's exercise with e's name, or creates it.
func ownExercise(ctx context.Context, tx pgx.Tx, userID string, e Exercise) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `select id::text from exercises where owner_id = $1::uuid and lower(name) = lower($2)`, userID, strings.TrimSpace(e.Name)).Scan(&id)
	if err == nil || !errors.Is(err, pgx.ErrNoRows) {
		return id, err
	}
	err = tx.QueryRow(ctx, `insert into exercises (owner_id, name, kind, muscle_group, equipment) values ($1::uuid, $2, $3, $4, $5) returning id::text`,
		userID, strings.TrimSpace(e.Name), e.Kind, e.MuscleGroup, e.Equipment).Scan(&id)
	return id, err
}

// DeclineShare turns down a share sent to the user.
func (s *Store) DeclineShare(ctx context.Context, userID, id string) error {
	ct, err := s.Pool.Exec(ctx, `update shares set status = 'declined', responded_at = now() where id = $1::uuid and to_user = $2::uuid and status = 'pending'`, id, userID)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}
