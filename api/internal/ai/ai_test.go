package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
	est, usage, err := p.Estimate(context.Background(), Request{Kind: "photo", Text: "lunch", Image: &Image{MediaType: "image/jpeg", Data: "AAAA"}})
	if err != nil {
		t.Fatal(err)
	}
	if est.Title != "Fish curry with rice" || len(est.Items) != 3 || usage.CostUSD != 0.0015 {
		t.Fatalf("est=%+v usage=%+v", est, usage)
	}
	msgs := got["messages"].([]any)
	user := msgs[1].(map[string]any)["content"].([]any)
	if len(user) != 2 || !strings.HasPrefix(user[1].(map[string]any)["image_url"].(map[string]any)["url"].(string), "data:image/jpeg;base64,") {
		t.Fatalf("image not sent: %v", user)
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
	est, usage, err := p.Estimate(context.Background(), Request{Kind: "text", Text: "fish curry"})
	if err != nil {
		t.Fatal(err)
	}
	if len(est.Items) != 3 || usage.CostUSD < 0.0044 || usage.CostUSD > 0.0046 {
		t.Fatalf("est=%+v usage=%+v", est, usage)
	}
}

type stub struct {
	name string
	err  error
}

func (s stub) Name() string  { return s.name }
func (s stub) Model() string { return s.name + "-model" }
func (s stub) Estimate(context.Context, Request) (Estimate, Usage, error) {
	if s.err != nil {
		return Estimate{}, Usage{}, s.err
	}
	var e Estimate
	_ = json.Unmarshal([]byte(lunchJSON), &e)
	return e, Usage{}, nil
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
