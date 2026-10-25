package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/salmxnz/fuel-and-lift/api/internal/foodicon"
)

const lunchJSON = `{"title":"Fish curry with rice","items":[
 {"name":"White rice","grams":250,"kcal":325,"protein_g":6,"carbs_g":71,"fat_g":1,"assumption":"normal plate","confidence":0.7,"source":"ai"},
 {"name":"Fish, curried","grams":60,"kcal":90,"protein_g":15,"carbs_g":0,"fat_g":3,"assumption":"two big bites","confidence":0.6,"source":"ai"},
 {"name":"Curry sauce","grams":null,"kcal":70,"protein_g":1,"carbs_g":4,"fat_g":5,"assumption":"a few spoonfuls","confidence":0.5,"source":"ai"}],
 "questions":[{"id":"rice_portion","text":"How much rice?","options":[{"id":"small","label":"Small"},{"id":"normal","label":"Normal plate"}]}]}`

func TestNormalise(t *testing.T) {
	var e Estimate
	if err := json.Unmarshal([]byte(lunchJSON), &e); err != nil {
		t.Fatal(err)
	}
	e.Items = append(e.Items, Item{Name: "  ", Kcal: 50})                                                  // dropped
	e.Items[0].Kcal = -5                                                                                   // clamped
	e.Questions = append(e.Questions, Question{Text: "Only one option?", Options: []Option{{Label: "x"}}}) // dropped
	if err := Normalise(&e); err != nil {
		t.Fatal(err)
	}
	if len(e.Items) != 3 || e.Items[0].Kcal != 0 {
		t.Fatalf("items = %+v", e.Items)
	}
	if e.Totals.Kcal != 160 || e.Totals.ProteinG != 22 {
		t.Fatalf("totals = %+v", e.Totals)
	}
	if len(e.Questions) != 1 {
		t.Fatalf("questions = %+v", e.Questions)
	}
	if err := Normalise(&Estimate{}); err == nil {
		t.Fatal("empty estimate accepted")
	}
}

func TestOpenRouter(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer k" || r.URL.Path != "/chat/completions" {
			http.Error(w, "bad", 401)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"content": "```json\n" + lunchJSON + "\n```"}}},
			"usage":   map[string]any{"prompt_tokens": 1800, "completion_tokens": 400, "cost": 0.0015},
		})
	}))
	defer srv.Close()
	p := &OpenRouter{APIKey: "k", ModelID: "google/gemini-2.5-flash", BaseURL: srv.URL}
	imgs := []Image{{MediaType: "image/jpeg", Data: "AAAA"}, {MediaType: "image/jpeg", Data: "BBBB"}, {MediaType: "image/png", Data: "CCCC"}}
	res, _, err := (&Gateway{Providers: []Provider{p}}).Estimate(context.Background(), Request{Kind: "photo", Text: "lunch", Images: imgs})
	if err != nil {
		t.Fatal(err)
	}
	if est, usage := res.Estimate, res.Usage; est.Title != "Fish curry with rice" || len(est.Items) != 3 || usage.CostUSD != 0.0015 {
		t.Fatalf("est=%+v usage=%+v", est, usage)
	}
	msgs := got["messages"].([]any)
	user := msgs[1].(map[string]any)["content"].([]any)
	// The prompt, then every photo in order.
	if len(user) != 4 || !strings.HasPrefix(user[1].(map[string]any)["image_url"].(map[string]any)["url"].(string), "data:image/jpeg;base64,AAAA") ||
		user[3].(map[string]any)["image_url"].(map[string]any)["url"].(string) != "data:image/png;base64,CCCC" {
		t.Fatalf("images not sent: %v", user)
	}
	if prompt := user[0].(map[string]any)["text"].(string); !strings.Contains(prompt, "3 photos of one meal") || !strings.Contains(prompt, "Count each food once") {
		t.Fatalf("prompt: %s", prompt)
	}
}

func TestAnthropic(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "k" || r.Header.Get("anthropic-version") == "" {
			http.Error(w, "bad", 401)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"content": []map[string]any{{"type": "tool_use", "name": "record_estimate", "input": json.RawMessage(lunchJSON)}},
			"usage":   map[string]int{"input_tokens": 2000, "output_tokens": 500},
		})
	}))
	defer srv.Close()
	p := &Anthropic{APIKey: "k", ModelID: "claude-haiku-5-5", BaseURL: srv.URL, PriceInPerM: 1, PriceOutPerM: 5}
	res, _, err := (&Gateway{Providers: []Provider{p}}).Estimate(context.Background(), Request{Kind: "text", Text: "fish curry"})
	if err != nil {
		t.Fatal(err)
	}
	if est, usage := res.Estimate, res.Usage; len(est.Items) != 3 || usage.CostUSD < 0.0044 || usage.CostUSD > 0.0046 {
		t.Fatalf("est=%+v usage=%+v", est, usage)
	}
}

type stub struct {
	name string
	err  error
}

func (s stub) Name() string  { return s.name }
func (s stub) Model() string { return s.name + "-model" }
func (s stub) Structured(context.Context, Call) (json.RawMessage, Usage, error) {
	if s.err != nil {
		return nil, Usage{}, s.err
	}
	return json.RawMessage(lunchJSON), Usage{}, nil
}

func TestGatewayFallsBack(t *testing.T) {
	g := &Gateway{Providers: []Provider{stub{name: "a", err: errors.New("429")}, stub{name: "b"}}}
	res, failed, err := g.Estimate(context.Background(), Request{Kind: "text", Text: "x"})
	if err != nil || res.Provider != "b" || len(failed) != 1 || failed[0].Provider != "a" {
		t.Fatalf("res=%+v failed=%+v err=%v", res, failed, err)
	}
	g = &Gateway{Providers: []Provider{stub{name: "a", err: errors.New("down")}}}
	if _, _, err := g.Estimate(context.Background(), Request{}); err == nil {
		t.Fatal("expected failure")
	}
	if _, _, err := (&Gateway{}).Estimate(context.Background(), Request{}); !errors.Is(err, ErrNoProviders) {
		t.Fatalf("got %v", err)
	}
}

func TestNormaliseClipsLongNames(t *testing.T) {
	long := "Salad (onion, cucumber, tomato, lettuce, carrot, red cabbage, coriander and a squeeze of lemon)"
	e := Estimate{Title: long + " with chicken tikka and basmati rice", Items: []Item{{Name: long, Kcal: 15}}}
	if err := Normalise(&e); err != nil {
		t.Fatal(err)
	}
	if n := len([]rune(e.Items[0].Name)); n > 80 || n < 50 {
		t.Errorf("item name %q is %d characters", e.Items[0].Name, n)
	}
	if n := len([]rune(e.Title)); n > 60 {
		t.Errorf("title %q is %d characters", e.Title, n)
	}
	if got := Clip("  Basmati rice  ", 80); got != "Basmati rice" {
		t.Errorf("short names stay as they are: %q", got)
	}
	if got := Clip("ééééééééééé", 5); got != "ééééé" {
		t.Errorf("clips by character, not byte: %q", got)
	}
}

func TestNormaliseIcon(t *testing.T) {
	for in, want := range map[string]string{"rice_bowl": "rice_bowl", " pizza ": "pizza", "none": "", "spaceship": "", "": ""} {
		e := Estimate{Icon: in, Items: []Item{{Name: "Rice", Kcal: 300}}}
		if err := Normalise(&e); err != nil {
			t.Fatal(err)
		}
		if e.Icon != want {
			t.Errorf("icon %q → %q, want %q", in, e.Icon, want)
		}
	}
	icon := Schema["properties"].(map[string]any)["icon"].(map[string]any)
	enum := icon["enum"].([]string)
	if len(enum) != len(foodicon.Keys)+1 || enum[len(enum)-1] != foodicon.None {
		t.Fatalf("icon enum = %v", enum)
	}
}

func TestNormaliseExercise(t *testing.T) {
	lib := []LibraryExercise{{Name: "Pec deck", MuscleGroup: "chest", Equipment: "machine"}, {Name: "Chest press (machine)"}}
	w, reps := 52.4, 500
	g := ExerciseGuess{Found: true, Options: []ExerciseOption{{LibraryName: "pec DECK", Name: "N933 Pec Deck", Kind: "strength", MuscleGroup: "chest",
		Muscles: []string{"mid chest", "pecs", "mid chest"}, Equipment: "machine", PictureLike: "nope"}},
		WeightKg: &w, WeightSource: "pin", Sets: 0, Reps: &reps}
	if err := NormaliseExercise(&g, lib); err != nil {
		t.Fatal(err)
	}
	o := g.Options[0]
	if o.LibraryName != "Pec deck" || o.Name != "Pec deck" || o.PictureLike != "Pec deck" || len(o.Muscles) != 1 ||
		*g.WeightKg != 52.5 || g.Sets != 1 || g.Reps != nil {
		t.Fatalf("got %+v", g)
	}
	// Not in the library: keeps its own name, drops made-up words and
	// duplicate options, keeps at most three.
	g = ExerciseGuess{Found: true, Sets: 3, Options: []ExerciseOption{
		{LibraryName: "Plate chest press", Name: "Plate-loaded chest press", MuscleGroup: "pecs", Equipment: "plate machine", PictureLike: "Chest press (machine)"},
		{Name: "plate-loaded chest press"}, {Name: "B"}, {Name: "C"}, {Name: "D"},
	}}
	if err := NormaliseExercise(&g, lib); err != nil {
		t.Fatal(err)
	}
	o = g.Options[0]
	if len(g.Options) != 3 || g.Options[1].Name != "B" || o.LibraryName != "" || o.MuscleGroup != "" || o.Equipment != "" ||
		o.PictureLike != "Chest press (machine)" || g.WeightSource != "none" {
		t.Fatalf("got %+v", g)
	}
}

func TestNormaliseScreen(t *testing.T) {
	m, d, sp, k := 25.55, 4.123, 99.0, 310.4
	s := ScreenReading{Found: true, Minutes: &m, DistanceKm: &d, Speed: &sp, Kcal: &k}
	NormaliseScreen(&s)
	if *s.Minutes != 25.6 || *s.DistanceKm != 4.12 || s.Speed != nil || *s.Kcal != 310 || !s.Found {
		t.Fatalf("got %+v", s)
	}
	s = ScreenReading{Found: true}
	if NormaliseScreen(&s); s.Found {
		t.Fatal("empty reading counted as found")
	}
}
