package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// The community: workouts (templates), saved meals and routines can be
// private, shown to friends, or public. Everything other people may see goes
// through sharedWith, with the viewer as $1.

// ErrOwnItem is returned when adding your own item from the Shop.
var ErrOwnItem = errors.New("that's already yours")

// Community is how an item shows up to other people.
type Community struct {
	Visibility  string     `json:"visibility"` // private | friends | public
	PublishedAt *time.Time `json:"published_at"`
	AddCount    int        `json:"add_count"`
	Hidden      bool       `json:"hidden"` // removed from the Shop by a moderator
	CopiedFrom  *Person    `json:"copied_from"`
}

// Visibilities are the allowed visibility values.
var Visibilities = map[string]bool{"private": true, "friends": true, "public": true}

// Item kinds and their tables.
var kindTables = map[string]string{"template": "templates", "meal": "saved_meals", "routine": "routines"}

// IsKind reports whether kind is template, meal or routine.
func IsKind(kind string) bool { _, ok := kindTables[kind]; return ok }

// sharedWith is the condition that the viewer ($1) may see someone else's
// item (alias a): it's public, or friends-only and they're friends, and a
// moderator hasn't hidden it.
func sharedWith(a string) string {
	return `(` + a + `.user_id <> $1::uuid and ` + a + `.archived_at is null and ` + a + `.hidden_at is null and (` +
		a + `.visibility = 'public' or (` + a + `.visibility = 'friends' and ` + a + `.user_id in (` + friendIDsSQL + `))))`
}

// SetVisibility changes who sees one of the user's items. published_at is
// set the first time it leaves private and kept after, so switching back and
// forth doesn't put it back at the top of "newest".
func (s *Store) SetVisibility(ctx context.Context, userID, kind, id, vis string) (Community, error) {
	table, ok := kindTables[kind]
	if !ok || !Visibilities[vis] {
		return Community{}, ErrNotFound
	}
	var c Community
	err := s.Pool.QueryRow(ctx, `
		update `+table+` set visibility = $3,
		       published_at = case when $3 <> 'private' then coalesce(published_at, now()) else published_at end
		where id = $1::uuid and user_id = $2::uuid and archived_at is null
		returning visibility, published_at, add_count, hidden_at is not null`, id, userID, vis).
		Scan(&c.Visibility, &c.PublishedAt, &c.AddCount, &c.Hidden)
	return c, notFound(err)
}

// --- the Shop ----------------------------------------------------------------------

// ShopItem is a card in the Shop or on someone's profile.
type ShopItem struct {
	Kind        string     `json:"kind"`
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Creator     Person     `json:"creator"`
	Visibility  string     `json:"visibility"`
	AddCount    int        `json:"add_count"`
	PublishedAt *time.Time `json:"published_at"`
	Added       bool       `json:"added"` // the viewer has added it before
	Mine        bool       `json:"mine"`
	Hidden      bool       `json:"hidden"`
	// template: its exercises; meal: its items
	Names []string `json:"names"`
	// meal: base macros
	Macros *Macros `json:"macros,omitempty"`
	// routine: weekday → workout name (null = rest)
	Days        map[string]*string `json:"days,omitempty"`
	Description *string            `json:"description,omitempty"`
}

// ShopQuery filters the Shop.
type ShopQuery struct {
	Kind   string
	Sort   string // new | popular
	Q      string
	Offset int
}

// ShopPage is the Shop's page size.
const ShopPage = 30

type shopRef struct {
	id      string
	creator Person
	added   bool
	mine    bool
}

// likePattern matches q anywhere in a name, with LIKE's wildcards escaped.
func likePattern(q string) string {
	q = strings.ToLower(strings.TrimSpace(q))
	if q == "" {
		return ""
	}
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(q) + "%"
}

// shopRefs runs the listing query for kind: $1 viewer, $2 kind, $3 name
// pattern (” = any), $4 offset, $5 limit, then extra args from $6.
func (s *Store) shopRefs(ctx context.Context, viewer, kind, cond, order, q string, offset, limit int, extra ...any) ([]shopRef, error) {
	table := kindTables[kind]
	rows, err := s.Pool.Query(ctx, `
		select x.id::text, u.id::text, coalesce(p.display_name, u.name), u.avatar_url,
		       exists(select 1 from item_adds ia where ia.user_id = $1::uuid and ia.kind = $2 and ia.item_id = x.id),
		       x.user_id = $1::uuid
		from `+table+` x join users u on u.id = x.user_id left join profiles p on p.user_id = u.id
		where `+cond+` and ($3 = '' or lower(x.name) like $3 escape '\')
		order by `+order+` offset $4 limit $5`,
		append([]any{viewer, kind, likePattern(q), offset, limit}, extra...)...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (shopRef, error) {
		var ref shopRef
		return ref, r.Scan(&ref.id, &ref.creator.ID, &ref.creator.Name, &ref.creator.AvatarURL, &ref.added, &ref.mine)
	})
}

// Shop lists items other people share with the viewer: everything public,
// plus friends' friends-only items. It returns whether there's another page.
func (s *Store) Shop(ctx context.Context, viewer string, q ShopQuery) ([]ShopItem, bool, error) {
	if !IsKind(q.Kind) {
		return nil, false, ErrNotFound
	}
	order := `x.published_at desc nulls last, x.id`
	if q.Sort == "popular" {
		order = `x.add_count desc, x.published_at desc nulls last, x.id`
	}
	refs, err := s.shopRefs(ctx, viewer, q.Kind, sharedWith("x"), order, q.Q, q.Offset, ShopPage+1)
	if err != nil {
		return nil, false, err
	}
	more := len(refs) > ShopPage
	if more {
		refs = refs[:ShopPage]
	}
	items, err := s.shopItems(ctx, q.Kind, refs)
	return items, more, err
}

// shopItems fills in refs (keeping their order).
func (s *Store) shopItems(ctx context.Context, kind string, refs []shopRef) ([]ShopItem, error) {
	out := make([]ShopItem, 0, len(refs))
	if len(refs) == 0 {
		return out, nil
	}
	ids := make([]string, len(refs))
	for i, r := range refs {
		ids[i] = r.id
	}
	byID := map[string]ShopItem{}
	switch kind {
	case "template":
		rows, err := s.templateRowsByIDs(ctx, ids)
		if err != nil {
			return nil, err
		}
		tpls, err := s.expand(ctx, rows)
		if err != nil {
			return nil, err
		}
		for _, t := range tpls {
			it := ShopItem{Name: t.Name, Visibility: t.Visibility, AddCount: t.AddCount, PublishedAt: t.PublishedAt, Hidden: t.Hidden, Names: []string{}}
			for _, b := range t.Blocks {
				if b.Exercise.ID != "" {
					it.Names = append(it.Names, b.Exercise.Name)
				}
			}
			byID[t.ID] = it
		}
	case "meal":
		meals, err := s.savedMealsByIDs(ctx, ids)
		if err != nil {
			return nil, err
		}
		for _, m := range meals {
			base := m.Base
			it := ShopItem{Name: m.Name, Visibility: m.Visibility, AddCount: m.AddCount, PublishedAt: m.PublishedAt, Hidden: m.Hidden, Names: []string{}, Macros: &base}
			for _, i := range m.Items {
				if !i.IsAddon {
					it.Names = append(it.Names, i.Name)
				}
			}
			byID[m.ID] = it
		}
	case "routine":
		list, err := s.routines(ctx, `r.id = any($1::uuid[]) and r.archived_at is null`, ids)
		if err != nil {
			return nil, err
		}
		for _, r := range list {
			it := ShopItem{Name: r.Name, Visibility: r.Visibility, AddCount: r.AddCount, PublishedAt: r.PublishedAt, Hidden: r.Hidden,
				Names: []string{}, Days: map[string]*string{}, Description: r.Description}
			seen := map[string]bool{}
			for _, d := range Weekdays {
				it.Days[d] = nil
				if day := r.Days[d]; day != nil {
					name := day.Name
					it.Days[d] = &name
					if !seen[day.TemplateID] {
						seen[day.TemplateID] = true
						it.Names = append(it.Names, name)
					}
				}
			}
			byID[r.ID] = it
		}
	}
	for _, r := range refs {
		it, ok := byID[r.id]
		if !ok {
			continue
		}
		it.Kind, it.ID, it.Creator, it.Added, it.Mine = kind, r.id, r.creator, r.added, r.mine
		out = append(out, it)
	}
	return out, nil
}

func (s *Store) savedMealsByIDs(ctx context.Context, ids []string) ([]SavedMeal, error) {
	rows, err := s.Pool.Query(ctx, `select `+savedCols+savedFrom+` where sm.id = any($1::uuid[]) and sm.archived_at is null`, ids)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanSaved)
}

// ShopDetail is one item in full, for its Shop page.
type ShopDetail struct {
	Item      ShopItem   `json:"item"`
	Template  *Template  `json:"template,omitempty"`
	SavedMeal *SavedMeal `json:"saved_meal,omitempty"`
	Routine   *Routine   `json:"routine,omitempty"`
}

// visibleCond is "the viewer may open this item": theirs, shared with them,
// or anything when the admin parameter is true.
func visibleCond(a, admin string) string {
	return `(` + a + `.archived_at is null and (` + a + `.user_id = $1::uuid or ` + admin + `::bool or ` + sharedWith(a) + `))`
}

// GetShopItem returns an item the viewer may see (admins see everything,
// hidden items included); ErrNotFound otherwise.
func (s *Store) GetShopItem(ctx context.Context, viewer, kind, id string, admin bool) (ShopDetail, error) {
	if !IsKind(kind) {
		return ShopDetail{}, ErrNotFound
	}
	refs, err := s.shopRefs(ctx, viewer, kind, `x.id = $6::uuid and `+visibleCond("x", "$7"), `x.id`, "", 0, 1, id, admin)
	if err != nil {
		return ShopDetail{}, err
	}
	items, err := s.shopItems(ctx, kind, refs)
	if err != nil {
		return ShopDetail{}, err
	}
	if len(items) == 0 {
		return ShopDetail{}, ErrNotFound
	}
	out := ShopDetail{Item: items[0]}
	switch kind {
	case "template":
		rows, err := s.templateRowsByIDs(ctx, []string{id})
		if err != nil {
			return out, err
		}
		tpls, err := s.expand(ctx, rows)
		if err != nil || len(tpls) == 0 {
			return out, notFoundIfEmpty(err)
		}
		out.Template = &tpls[0]
	case "meal":
		meals, err := s.savedMealsByIDs(ctx, []string{id})
		if err != nil || len(meals) == 0 {
			return out, notFoundIfEmpty(err)
		}
		if !out.Item.Mine {
			meals[0].DefaultMealSlotID = nil // their meal slot means nothing to the viewer
			meals[0].LastUsedAt = nil
		}
		out.SavedMeal = &meals[0]
	case "routine":
		r, err := s.routineWithTemplates(ctx, id)
		if err != nil {
			return out, err
		}
		out.Routine = &r
	}
	return out, nil
}

func notFoundIfEmpty(err error) error {
	if err != nil {
		return err
	}
	return ErrNotFound
}

// routineWithTemplates loads any routine with its workouts in full. Callers
// check access first: seeing a routine means seeing its workouts.
func (s *Store) routineWithTemplates(ctx context.Context, id string) (Routine, error) {
	list, err := s.routines(ctx, `r.id = $1::uuid and r.archived_at is null`, id)
	if err != nil {
		return Routine{}, err
	}
	if len(list) == 0 {
		return Routine{}, ErrNotFound
	}
	r := list[0]
	var ids []string
	for _, d := range Weekdays {
		if day := r.Days[d]; day != nil {
			ids = append(ids, day.TemplateID)
		}
	}
	rows, err := s.templateRowsByIDs(ctx, ids)
	if err != nil {
		return r, err
	}
	if r.Templates, err = s.expand(ctx, rows); err != nil {
		return r, err
	}
	return r, nil
}

// AddToMine copies someone else's item into the viewer's account. The copy
// starts private and credits the creator; adds count once per person.
// It returns the new item's id.
func (s *Store) AddToMine(ctx context.Context, viewer, kind, id string) (string, error) {
	table, ok := kindTables[kind]
	if !ok {
		return "", ErrNotFound
	}
	var newID string
	err := s.tx(ctx, func(tx pgx.Tx) error {
		var owner, ownerName string
		err := tx.QueryRow(ctx, `
			select x.user_id::text, coalesce(p.display_name, u.name, '') from `+table+` x
			join users u on u.id = x.user_id left join profiles p on p.user_id = u.id
			where x.id = $2::uuid and ((x.user_id = $1::uuid and x.archived_at is null) or `+sharedWith("x")+`)
			for update of x`, viewer, id).Scan(&owner, &ownerName)
		if err != nil {
			return notFound(err)
		}
		if owner == viewer {
			return ErrOwnItem
		}
		switch kind {
		case "template":
			newID, err = s.copyTemplate(ctx, tx, viewer, id, owner, ownerName)
		case "meal":
			err = tx.QueryRow(ctx, `
				insert into saved_meals (user_id, name, items, icon, copied_from_id, copied_from_user)
				select $1::uuid, name, items, icon, id, user_id from saved_meals where id = $2::uuid returning id::text`, viewer, id).Scan(&newID)
		case "routine":
			newID, err = s.copyRoutine(ctx, tx, viewer, id, owner, ownerName)
		}
		if err != nil {
			return err
		}
		ct, err := tx.Exec(ctx, `insert into item_adds (user_id, kind, item_id) values ($1::uuid, $2, $3::uuid) on conflict do nothing`, viewer, kind, id)
		if err != nil {
			return err
		}
		if ct.RowsAffected() > 0 {
			_, err = tx.Exec(ctx, `update `+table+` set add_count = add_count + 1 where id = $1::uuid`, id)
		}
		return err
	})
	return newID, err
}

func (s *Store) copyTemplate(ctx context.Context, tx pgx.Tx, viewer, id, owner, ownerName string) (string, error) {
	rows, err := s.templateRowsByIDs(ctx, []string{id})
	if err != nil {
		return "", err
	}
	tpls, err := s.expand(ctx, rows)
	if err != nil || len(tpls) == 0 {
		return "", notFoundIfEmpty(err)
	}
	w, err := copyWorkout(ctx, tx, viewer, snapshotTemplate(tpls[0]), ownerName)
	if err != nil {
		return "", err
	}
	newID, err := createTemplate(ctx, tx, viewer, w.Name, w.Blocks)
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(ctx, `update templates set copied_from_id = $2::uuid, copied_from_user = $3::uuid where id = $1::uuid`, newID, id, owner)
	return newID, err
}

func (s *Store) copyRoutine(ctx context.Context, tx pgx.Tx, viewer, id, owner, ownerName string) (string, error) {
	r, err := s.routineWithTemplates(ctx, id)
	if err != nil {
		return "", err
	}
	snap, err := s.snapshotRoutine(ctx, r)
	if err != nil {
		return "", err
	}
	seed, err := routineSeedFrom(ctx, tx, viewer, snap, ownerName)
	if err != nil {
		return "", err
	}
	// snapshotRoutine numbers workouts in week order, like this.
	seen := map[string]bool{}
	for _, d := range Weekdays {
		if day := r.Days[d]; day != nil && !seen[day.TemplateID] {
			seen[day.TemplateID] = true
			seed.WorkoutsFrom = append(seed.WorkoutsFrom, day.TemplateID)
		}
	}
	seed.CopiedFromID, seed.CopiedFromUser = &id, &owner
	return seedRoutine(ctx, tx, viewer, seed)
}

// --- people ------------------------------------------------------------------------

// PersonView is someone's profile as the viewer sees it.
type PersonView struct {
	Person       Person     `json:"person"`
	IsMe         bool       `json:"is_me"`
	IsFriend     bool       `json:"is_friend"`
	FriendsSince *Date      `json:"friends_since"`
	Routines     []ShopItem `json:"routines"`
	Templates    []ShopItem `json:"templates"`
	Meals        []ShopItem `json:"meals"`
}

// GetPerson returns someone's profile and the items the viewer may see. It's
// ErrNotFound unless they're the viewer, a friend, or share something
// publicly, so a bare user id doesn't give away a name.
func (s *Store) GetPerson(ctx context.Context, viewer, personID string) (PersonView, error) {
	var v PersonView
	err := s.Pool.QueryRow(ctx, `select u.id::text, coalesce(p.display_name, u.name, ''), u.avatar_url
		from users u left join profiles p on p.user_id = u.id where u.id = $1::uuid`, personID).
		Scan(&v.Person.ID, &v.Person.Name, &v.Person.AvatarURL)
	if err != nil {
		return v, notFound(err)
	}
	v.IsMe = personID == viewer
	if !v.IsMe {
		a, b := viewer, personID
		if a > b {
			a, b = b, a
		}
		var since time.Time
		err := s.Pool.QueryRow(ctx, `select created_at from friendships where user_a = $1::uuid and user_b = $2::uuid`, a, b).Scan(&since)
		if err == nil {
			v.IsFriend = true
			d := DateOf(since)
			v.FriendsSince = &d
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return v, err
		}
	}
	// The owner sees what they've put out there, the same way others do.
	cond := `x.user_id = $6::uuid and ` + sharedWith("x")
	if v.IsMe {
		cond = `x.user_id = $6::uuid and x.user_id = $1::uuid and x.archived_at is null and x.visibility <> 'private'`
	}
	for _, k := range []struct {
		kind string
		dst  *[]ShopItem
	}{{"routine", &v.Routines}, {"template", &v.Templates}, {"meal", &v.Meals}} {
		refs, err := s.shopRefs(ctx, viewer, k.kind, cond, `x.published_at desc nulls last, x.id`, "", 0, 50, personID)
		if err != nil {
			return v, err
		}
		if *k.dst, err = s.shopItems(ctx, k.kind, refs); err != nil {
			return v, err
		}
	}
	if !v.IsMe && !v.IsFriend && len(v.Routines)+len(v.Templates)+len(v.Meals) == 0 {
		return PersonView{}, ErrNotFound
	}
	return v, nil
}

// --- moderation --------------------------------------------------------------------

// ReportReasons are the reasons someone can report an item for.
var ReportReasons = map[string]bool{"spam": true, "offensive": true, "unsafe": true, "other": true}

// Report flags an item someone else shares with the viewer. Reporting the
// same item twice is a no-op until a moderator deals with it.
func (s *Store) Report(ctx context.Context, viewer, kind, id, reason string, note *string) error {
	table, ok := kindTables[kind]
	if !ok {
		return ErrNotFound
	}
	ct, err := s.Pool.Exec(ctx, `
		insert into reports (reporter_id, kind, item_id, reason, note)
		select $1::uuid, $2, x.id, $4, $5 from `+table+` x where x.id = $3::uuid and `+sharedWith("x")+`
		on conflict do nothing`, viewer, kind, id, reason, note)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		// Either it's not visible to them, or they reported it already.
		var seen bool
		if err := s.Pool.QueryRow(ctx, `select exists(select 1 from reports where reporter_id = $1::uuid and kind = $2 and item_id = $3::uuid and resolved_at is null)`,
			viewer, kind, id).Scan(&seen); err != nil {
			return err
		}
		if !seen {
			return ErrNotFound
		}
	}
	return nil
}

// ReportGroup is the open reports about one item.
type ReportGroup struct {
	Kind          string         `json:"kind"`
	ItemID        string         `json:"item_id"`
	Name          string         `json:"name"`
	Creator       Person         `json:"creator"`
	Visibility    string         `json:"visibility"`
	Hidden        bool           `json:"hidden"`
	Count         int            `json:"count"`
	Reasons       map[string]int `json:"reasons"`
	Notes         []string       `json:"notes"`
	FirstReported time.Time      `json:"first_reported_at"`
}

// OpenReports lists items with unresolved reports, most reported first.
func (s *Store) OpenReports(ctx context.Context) ([]ReportGroup, error) {
	rows, err := s.Pool.Query(ctx, `
		select r.kind, r.item_id::text, count(*), min(r.created_at), array_agg(r.reason),
		       coalesce((array_agg(r.note order by r.created_at desc) filter (where r.note is not null))[1:5], '{}')
		from reports r where r.resolved_at is null
		group by r.kind, r.item_id order by count(*) desc, min(r.created_at) limit 100`)
	if err != nil {
		return nil, err
	}
	groups, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (ReportGroup, error) {
		var g ReportGroup
		var reasons []string
		if err := r.Scan(&g.Kind, &g.ItemID, &g.Count, &g.FirstReported, &reasons, &g.Notes); err != nil {
			return g, err
		}
		g.Reasons = map[string]int{}
		for _, x := range reasons {
			g.Reasons[x]++
		}
		return g, nil
	})
	if err != nil {
		return nil, err
	}
	out := make([]ReportGroup, 0, len(groups))
	for _, g := range groups {
		err := s.Pool.QueryRow(ctx, `
			select x.name, x.visibility, x.hidden_at is not null, u.id::text, coalesce(p.display_name, u.name, ''), u.avatar_url
			from `+kindTables[g.Kind]+` x join users u on u.id = x.user_id left join profiles p on p.user_id = u.id
			where x.id = $1::uuid`, g.ItemID).Scan(&g.Name, &g.Visibility, &g.Hidden, &g.Creator.ID, &g.Creator.Name, &g.Creator.AvatarURL)
		if errors.Is(err, pgx.ErrNoRows) {
			continue // the owner's account is gone
		}
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, nil
}

// SetHidden hides an item from everyone but its owner (or shows it again).
// Hiding resolves its open reports. It returns the owner and the item's name.
func (s *Store) SetHidden(ctx context.Context, adminID, kind, id string, hidden bool) (owner, name string, err error) {
	table, ok := kindTables[kind]
	if !ok {
		return "", "", ErrNotFound
	}
	err = s.tx(ctx, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `
			update `+table+` set hidden_at = case when $3 then coalesce(hidden_at, now()) end,
			       hidden_by = case when $3 then $2::uuid end
			where id = $1::uuid returning user_id::text, name`, id, adminID, hidden).Scan(&owner, &name)
		if err != nil {
			return notFound(err)
		}
		if hidden {
			return resolveReports(ctx, tx, adminID, kind, id, "hidden")
		}
		return nil
	})
	return owner, name, err
}

// DismissReports closes an item's open reports without hiding it.
func (s *Store) DismissReports(ctx context.Context, adminID, kind, id string) error {
	if !IsKind(kind) {
		return ErrNotFound
	}
	return s.tx(ctx, func(tx pgx.Tx) error { return resolveReports(ctx, tx, adminID, kind, id, "dismissed") })
}

func resolveReports(ctx context.Context, tx pgx.Tx, adminID, kind, id, resolution string) error {
	_, err := tx.Exec(ctx, `update reports set resolved_at = now(), resolution = $4, resolved_by = $1::uuid
		where kind = $2 and item_id = $3::uuid and resolved_at is null`, adminID, kind, id, resolution)
	return err
}
