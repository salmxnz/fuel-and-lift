package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/foodicon"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// --- meal slots --------------------------------------------------------------------

var validSchedules = map[string]bool{"daily": true, "gym_days": true}

// ListMealSlots handles GET /v1/meal-slots.
func (h *Handler) ListMealSlots(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListMealSlots(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"meal_slots": list})
}

// CreateMealSlot handles POST /v1/meal-slots.
func (h *Handler) CreateMealSlot(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string  `json:"name"`
		Schedule string  `json:"schedule"`
		RemindAt *string `json:"remind_at"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validClock(in.RemindAt) {
		badRequest(w, `remind_at is a time like "12:30"`)
		return
	}
	name, ok := cleanName(in.Name, 30)
	if !ok {
		badRequest(w, "name must be 1 to 30 characters")
		return
	}
	if in.Schedule == "" {
		in.Schedule = "daily"
	}
	if !validSchedules[in.Schedule] {
		badRequest(w, "schedule must be daily or gym_days")
		return
	}
	m, err := h.Store.CreateMealSlot(r.Context(), auth.UserID(r), name, in.Schedule, in.RemindAt)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"meal_slot": m})
}

// UpdateMealSlot handles PATCH /v1/meal-slots/{id}.
func (h *Handler) UpdateMealSlot(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Name     *string          `json:"name"`
		Schedule *string          `json:"schedule"`
		RemindAt optional[string] `json:"remind_at"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validClock(in.RemindAt.Value) {
		badRequest(w, `remind_at is a time like "12:30"`)
		return
	}
	if in.Name != nil {
		name, ok := cleanName(*in.Name, 30)
		if !ok {
			badRequest(w, "name must be 1 to 30 characters")
			return
		}
		in.Name = &name
	}
	if in.Schedule != nil && !validSchedules[*in.Schedule] {
		badRequest(w, "schedule must be daily or gym_days")
		return
	}
	m, err := h.Store.UpdateMealSlot(r.Context(), auth.UserID(r), id, in.Name, in.Schedule, in.RemindAt.Set, in.RemindAt.Value)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"meal_slot": m})
}

// ReorderMealSlots handles PUT /v1/meal-slots/order.
func (h *Handler) ReorderMealSlots(w http.ResponseWriter, r *http.Request) {
	var in struct {
		IDs []string `json:"ids"`
	}
	if !decode(w, r, &in) {
		return
	}
	for _, id := range in.IDs {
		if !isUUID(id) {
			badRequest(w, "ids must be meal slot ids")
			return
		}
	}
	userID := auth.UserID(r)
	if err := h.Store.ReorderMealSlots(r.Context(), userID, in.IDs); err != nil {
		if errors.Is(err, store.ErrConflict) {
			badRequest(w, "ids must list every one of your meals exactly once")
			return
		}
		h.storeError(w, r, err)
		return
	}
	h.ListMealSlots(w, r)
}

// DeleteMealSlot handles DELETE /v1/meal-slots/{id}.
func (h *Handler) DeleteMealSlot(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.ArchiveMealSlot(r.Context(), auth.UserID(r), id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}

// --- day and entries -----------------------------------------------------------------

// target is the user's daily target from their active goal (zero without one).
func (h *Handler) target(ctx context.Context, userID string) store.Macros {
	return h.Store.Target(ctx, userID)
}

func (h *Handler) day(ctx context.Context, userID string, d store.Date) (store.Day, error) {
	day, err := h.Store.GetDay(ctx, userID, d, h.target(ctx, userID))
	if err == nil {
		h.withExtras(ctx, userID, dayEntries(&day)...)
	}
	return day, err
}

// GetDay handles GET /v1/days/{date}.
func (h *Handler) GetDay(w http.ResponseWriter, r *http.Request) {
	d, ok := pathDate(w, r)
	if !ok {
		return
	}
	day, err := h.day(r.Context(), auth.UserID(r), d)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"day": day})
}

var validOrigins = map[string]bool{"saved": true, "ai": true, "manual": true, "search": true, "barcode": true, "restaurant": true}
var validItemSources = map[string]bool{"official": true, "ai": true, "user": true, "database": true}

// checkItems validates and tidies entry items.
func checkItems(items []store.EntryItem) ([]store.EntryItem, string) {
	if len(items) > 40 {
		return nil, "an entry can have at most 40 items"
	}
	out := make([]store.EntryItem, 0, len(items))
	for _, it := range items {
		name, ok := cleanName(it.Name, 80)
		if !ok {
			return nil, "every item needs a name (up to 80 characters)"
		}
		it.Name = name
		if it.Kcal < 0 || it.Kcal > 10000 || it.ProteinG < 0 || it.CarbsG < 0 || it.FatG < 0 ||
			it.ProteinG > 1000 || it.CarbsG > 1000 || it.FatG > 1000 {
			return nil, "item values must be between 0 and a sensible maximum"
		}
		if it.Grams != nil && (*it.Grams < 0 || *it.Grams > 5000) {
			return nil, "grams must be between 0 and 5000"
		}
		if it.Source == "" {
			it.Source = "user"
		}
		if !validItemSources[it.Source] {
			return nil, "item source must be official, ai, user or database"
		}
		out = append(out, it)
	}
	return out, ""
}

// checkIcon reads an optional food icon: nil stays nil (unchanged), "none"
// or "" becomes "" (no icon), a known key stays. Anything else writes a 400.
func checkIcon(w http.ResponseWriter, icon *string) (*string, bool) {
	if icon == nil {
		return nil, true
	}
	k := strings.TrimSpace(*icon)
	if k == "" || k == foodicon.None {
		k = ""
	} else if !foodicon.Valid(k) {
		badRequest(w, "icon is not one we know")
		return nil, false
	}
	return &k, true
}

// newIcon is checkIcon for something new: no icon is nil.
func newIcon(w http.ResponseWriter, icon *string) (*string, bool) {
	k, ok := checkIcon(w, icon)
	if k != nil && *k == "" {
		k = nil
	}
	return k, ok
}

type entryBody struct {
	Icon         *string           `json:"icon"`
	MealSlotID   *string           `json:"meal_slot_id"`
	MealName     *string           `json:"meal_name"`
	Name         string            `json:"name"`
	Origin       string            `json:"origin"`
	AIEstimateID *string           `json:"ai_estimate_id"`
	Items        []store.EntryItem `json:"items"`
	Kcal         float64           `json:"kcal"`
	ProteinG     float64           `json:"protein_g"`
	CarbsG       float64           `json:"carbs_g"`
	FatG         float64           `json:"fat_g"`
}

// AddEntry handles POST /v1/days/{date}/entries.
func (h *Handler) AddEntry(w http.ResponseWriter, r *http.Request) {
	d, ok := pathDate(w, r)
	if !ok {
		return
	}
	var in entryBody
	if !decode(w, r, &in) {
		return
	}
	name, ok := cleanName(in.Name, 80)
	if !ok {
		badRequest(w, "name is required (up to 80 characters)")
		return
	}
	if in.Origin == "" {
		in.Origin = "manual"
	}
	if !validOrigins[in.Origin] {
		badRequest(w, "origin must be saved, ai, manual, search, barcode or restaurant")
		return
	}
	if in.MealSlotID != nil && !isUUID(*in.MealSlotID) {
		badRequest(w, "meal_slot_id is not valid")
		return
	}
	if in.MealName != nil {
		mn, ok := cleanName(*in.MealName, 30)
		if !ok {
			badRequest(w, "meal_name must be 1 to 30 characters")
			return
		}
		in.MealName = &mn
	}
	if in.AIEstimateID != nil && !isUUID(*in.AIEstimateID) {
		in.AIEstimateID = nil
	}
	items, msg := checkItems(in.Items)
	if msg != "" {
		badRequest(w, msg)
		return
	}
	m := store.Macros{Kcal: in.Kcal, ProteinG: in.ProteinG, CarbsG: in.CarbsG, FatG: in.FatG}
	if len(items) == 0 && (m.Kcal < 0 || m.Kcal > 10000 || m.ProteinG < 0 || m.CarbsG < 0 || m.FatG < 0) {
		badRequest(w, "kcal and macros must be positive")
		return
	}
	icon, ok := newIcon(w, in.Icon)
	if !ok {
		return
	}
	userID := auth.UserID(r)
	e, err := h.Store.AddEntry(r.Context(), userID, d, store.NewEntry{
		MealSlotID: in.MealSlotID, MealName: in.MealName, Name: name, Origin: in.Origin,
		AIEstimateID: in.AIEstimateID, Items: items, Macros: m, Icon: icon,
	})
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	skipped := 0
	if in.AIEstimateID != nil {
		skipped = h.attachPhotos(context.WithoutCancel(r.Context()), userID, *in.AIEstimateID, e.ID)
	}
	h.withExtras(r.Context(), userID, &e)
	day, err := h.day(r.Context(), userID, d)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if d == h.today(r.Context(), userID) {
		h.celebrateStreak(context.WithoutCancel(r.Context()), userID)
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"entry": e, "day": day, "photos_skipped": skipped})
}

// UpdateEntry handles PATCH /v1/entries/{id}.
func (h *Handler) UpdateEntry(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Name       *string            `json:"name"`
		MealSlotID *string            `json:"meal_slot_id"`
		MealName   *string            `json:"meal_name"`
		Items      *[]store.EntryItem `json:"items"`
		Icon       *string            `json:"icon"` // "none" removes it
	}
	if !decode(w, r, &in) {
		return
	}
	icon, ok := checkIcon(w, in.Icon)
	if !ok {
		return
	}
	if in.Name != nil {
		n, ok := cleanName(*in.Name, 80)
		if !ok {
			badRequest(w, "name must be 1 to 80 characters")
			return
		}
		in.Name = &n
	}
	if in.MealSlotID != nil && *in.MealSlotID != "" && !isUUID(*in.MealSlotID) {
		badRequest(w, "meal_slot_id is not valid")
		return
	}
	if in.Items != nil {
		items, msg := checkItems(*in.Items)
		if msg != "" {
			badRequest(w, msg)
			return
		}
		in.Items = &items
	}
	userID := auth.UserID(r)
	e, err := h.Store.UpdateEntry(r.Context(), userID, id, store.EntryPatch{Name: in.Name, MealSlotID: in.MealSlotID, MealName: in.MealName, Items: in.Items, Icon: icon})
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.withExtras(r.Context(), userID, &e)
	day, err := h.day(r.Context(), userID, e.Date)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"entry": e, "day": day})
}

// DeleteEntry handles DELETE /v1/entries/{id}.
func (h *Handler) DeleteEntry(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := auth.UserID(r)
	keys, err := h.Store.DeleteEntryPhotos(r.Context(), userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	d, err := h.Store.DeleteEntry(r.Context(), userID, id)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.deleteObjects(context.WithoutCancel(r.Context()), keys)
	day, err := h.day(r.Context(), userID, d)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"day": day})
}

// --- saved meals -----------------------------------------------------------------

// ListSavedMeals handles GET /v1/saved-meals.
func (h *Handler) ListSavedMeals(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListSavedMeals(r.Context(), auth.UserID(r))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"saved_meals": list})
}

// SaveMeal handles POST /v1/saved-meals and PUT /v1/saved-meals/{id}.
func (h *Handler) SaveMeal(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id != "" && !isUUID(id) {
		httpx.Error(w, http.StatusNotFound, "not found")
		return
	}
	var in struct {
		Name              string  `json:"name"`
		DefaultMealSlotID *string `json:"default_meal_slot_id"`
		Items             []struct {
			store.EntryItem
			IsAddon bool `json:"is_addon"`
		} `json:"items"`
		Visibility *string `json:"visibility"` // creating only; see PUT …/visibility
		Icon       *string `json:"icon"`       // left out keeps it; "none" removes it
	}
	if !decode(w, r, &in) {
		return
	}
	icon, ok := checkIcon(w, in.Icon)
	if !ok {
		return
	}
	if !validVisibility(w, in.Visibility) {
		return
	}
	name, ok := cleanName(in.Name, 60)
	if !ok {
		badRequest(w, "name is required (up to 60 characters)")
		return
	}
	if len(in.Items) == 0 {
		badRequest(w, "a saved meal needs at least one item")
		return
	}
	if in.DefaultMealSlotID != nil && !isUUID(*in.DefaultMealSlotID) {
		in.DefaultMealSlotID = nil
	}
	raw := make([]store.EntryItem, len(in.Items))
	for i, it := range in.Items {
		raw[i] = it.EntryItem
	}
	clean, msg := checkItems(raw)
	if msg != "" {
		badRequest(w, msg)
		return
	}
	items := make([]store.SavedItem, len(clean))
	for i, it := range clean {
		itemID, err := auth.RandomToken(6)
		if err != nil {
			h.storeError(w, r, err)
			return
		}
		items[i] = store.SavedItem{ID: itemID, EntryItem: it, IsAddon: in.Items[i].IsAddon}
	}
	userID := auth.UserID(r)
	vis := in.Visibility
	if id == "" && vis == nil {
		d := h.Store.DefaultVisibility(r.Context(), userID) // left out: the user's default
		vis = &d
	}
	m, err := h.Store.SaveMeal(r.Context(), userID, id, name, in.DefaultMealSlotID, items, vis, icon)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	status := http.StatusOK
	if id == "" {
		status = http.StatusCreated
		if *vis != "private" {
			h.announceItem(context.WithoutCancel(r.Context()), userID, "meal", m.ID, m.Name)
		}
	}
	httpx.JSON(w, status, map[string]any{"saved_meal": m})
}

// DeleteSavedMeal handles DELETE /v1/saved-meals/{id}.
func (h *Handler) DeleteSavedMeal(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.ArchiveSavedMeal(r.Context(), auth.UserID(r), id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}

// LogSavedMeal handles POST /v1/days/{date}/saved-meals/{id}.
func (h *Handler) LogSavedMeal(w http.ResponseWriter, r *http.Request) {
	d, ok := pathDate(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		MealSlotID *string  `json:"meal_slot_id"`
		MealName   *string  `json:"meal_name"`
		AddonIDs   []string `json:"addon_ids"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.MealSlotID != nil && !isUUID(*in.MealSlotID) {
		badRequest(w, "meal_slot_id is not valid")
		return
	}
	userID := auth.UserID(r)
	e, err := h.Store.LogSavedMeal(r.Context(), userID, d, id, in.MealSlotID, in.MealName, in.AddonIDs)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	h.withExtras(r.Context(), userID, &e)
	day, err := h.day(r.Context(), userID, d)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if d == h.today(r.Context(), userID) {
		h.celebrateStreak(context.WithoutCancel(r.Context()), userID)
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"entry": e, "day": day})
}

// --- foods -----------------------------------------------------------------------

// ListFoods handles GET /v1/foods?q=.
func (h *Handler) ListFoods(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListFoods(r.Context(), auth.UserID(r), r.URL.Query().Get("q"))
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"foods": list})
}

// CreateFood handles POST /v1/foods.
func (h *Handler) CreateFood(w http.ResponseWriter, r *http.Request) {
	var in store.Food
	if !decode(w, r, &in) {
		return
	}
	name, ok := cleanName(in.Name, 80)
	if !ok {
		badRequest(w, "name is required (up to 80 characters)")
		return
	}
	p := in.Per100g
	if p.Kcal < 0 || p.Kcal > 950 || p.ProteinG < 0 || p.CarbsG < 0 || p.FatG < 0 || p.ProteinG+p.CarbsG+p.FatG > 105 {
		badRequest(w, "per_100g values don't add up for 100 g of food")
		return
	}
	if in.ServingGrams != nil && (*in.ServingGrams <= 0 || *in.ServingGrams > 5000) {
		badRequest(w, "serving_grams must be between 0 and 5000")
		return
	}
	in.Name, in.Source, in.Barcode, in.Chain = name, "custom", nil, nil
	f, err := h.Store.CreateFood(r.Context(), auth.UserID(r), in)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"food": f})
}

var barcodeRe = regexp.MustCompile(`^[0-9]{6,14}$`)

// FoodByBarcode handles GET /v1/foods/barcode/{code}: the shared cache first,
// then Open Food Facts, caching what it finds.
func (h *Handler) FoodByBarcode(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	if !barcodeRe.MatchString(code) {
		badRequest(w, "a barcode is 6 to 14 digits")
		return
	}
	f, err := h.Store.FoodByBarcode(r.Context(), code)
	if err == nil {
		httpx.JSON(w, http.StatusOK, map[string]any{"food": f})
		return
	}
	if !errors.Is(err, store.ErrNotFound) {
		h.storeError(w, r, err)
		return
	}
	lookup := h.FoodLookup
	if lookup == nil {
		lookup = OpenFoodFacts
	}
	found, err := lookup(r.Context(), code)
	if errors.Is(err, store.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, "we couldn't find that barcode — add it as a custom food")
		return
	}
	if err != nil {
		h.Log.Warn("open food facts", "err", err)
		httpx.Error(w, http.StatusBadGateway, "the barcode service didn't answer, try again")
		return
	}
	f, err = h.Store.CreateFood(r.Context(), "", found)
	if err != nil {
		// Two lookups racing: the other one cached it.
		if cached, cerr := h.Store.FoodByBarcode(r.Context(), code); cerr == nil {
			f, err = cached, nil
		}
	}
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"food": f})
}

var offClient = &http.Client{Timeout: 8 * time.Second}

// OpenFoodFacts looks a barcode up on world.openfoodfacts.org.
func OpenFoodFacts(ctx context.Context, code string) (store.Food, error) {
	url := "https://world.openfoodfacts.org/api/v2/product/" + code + ".json?fields=product_name,brands,nutriments,serving_size,serving_quantity"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return store.Food{}, err
	}
	req.Header.Set("User-Agent", "adebite/1.0 (personal tracker)")
	res, err := offClient.Do(req)
	if err != nil {
		return store.Food{}, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return store.Food{}, store.ErrNotFound
	}
	if res.StatusCode != http.StatusOK {
		return store.Food{}, fmt.Errorf("open food facts: %s", res.Status)
	}
	var out struct {
		Status  int `json:"status"`
		Product struct {
			Name            string          `json:"product_name"`
			Brands          string          `json:"brands"`
			Nutriments      map[string]any  `json:"nutriments"`
			ServingSize     string          `json:"serving_size"`
			ServingQuantity json.RawMessage `json:"serving_quantity"`
		} `json:"product"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 2<<20)).Decode(&out); err != nil {
		return store.Food{}, err
	}
	p := out.Product
	kcal := num(p.Nutriments["energy-kcal_100g"])
	if out.Status != 1 || strings.TrimSpace(p.Name) == "" || kcal <= 0 {
		return store.Food{}, store.ErrNotFound
	}
	f := store.Food{
		Name: strings.TrimSpace(p.Name), Source: "openfoodfacts", Barcode: &code,
		Per100g: store.Macros{Kcal: kcal, ProteinG: num(p.Nutriments["proteins_100g"]), CarbsG: num(p.Nutriments["carbohydrates_100g"]), FatG: num(p.Nutriments["fat_100g"])},
	}
	if b := strings.TrimSpace(strings.Split(p.Brands, ",")[0]); b != "" {
		f.Brand = &b
	}
	if s := strings.TrimSpace(p.ServingSize); s != "" {
		f.ServingName = &s
		var q float64
		if json.Unmarshal(p.ServingQuantity, &q) != nil {
			var qs string
			if json.Unmarshal(p.ServingQuantity, &qs) == nil {
				fmt.Sscan(qs, &q) //nolint:errcheck
			}
		}
		if q > 0 {
			f.ServingGrams = &q
		}
	}
	return f, nil
}

func num(v any) float64 {
	switch x := v.(type) {
	case float64:
		return math.Round(x*10) / 10
	case string:
		var f float64
		fmt.Sscan(x, &f) //nolint:errcheck
		return math.Round(f*10) / 10
	}
	return 0
}
