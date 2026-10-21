// Package ai turns a meal photo or description into an itemised, editable
// estimate. Providers (OpenRouter, Anthropic) sit behind one interface and are
// tried in order, so one provider being down never blocks logging.
package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
)

// Image is a base64 encoded photo.
type Image struct {
	MediaType string `json:"media_type"`
	Data      string `json:"data"`
}

// Request is one estimate request.
type Request struct {
	Kind     string            // photo | text | restaurant
	Text     string            // what the user typed
	Images   []Image           // 0–3 photos of the same meal
	Answers  map[string]string // question id → option id, when refining
	Previous json.RawMessage   // the estimate being refined
	Context  string            // the user's saved foods and portions, to anchor guesses
	// When refining: what the user typed to correct the estimate, the name
	// they gave the dish, and their edited items (JSON). Their edits win.
	Correction string
	Title      string
	Edited     json.RawMessage
	Voice      string // neutral | casual (wording only)
}

// Option is one answer to a question.
type Option struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Question is a clarifying question with tap-to-answer options.
type Question struct {
	ID      string   `json:"id"`
	Text    string   `json:"text"`
	Options []Option `json:"options"`
}

// Item is one food in the estimate.
type Item struct {
	Name       string   `json:"name"`
	Grams      *float64 `json:"grams"`
	Kcal       float64  `json:"kcal"`
	ProteinG   float64  `json:"protein_g"`
	CarbsG     float64  `json:"carbs_g"`
	FatG       float64  `json:"fat_g"`
	Assumption string   `json:"assumption"`
	Confidence float64  `json:"confidence"`
	Source     string   `json:"source"` // ai | official
}

// Totals of an estimate.
type Totals struct {
	Kcal     float64 `json:"kcal"`
	ProteinG float64 `json:"protein_g"`
	CarbsG   float64 `json:"carbs_g"`
	FatG     float64 `json:"fat_g"`
}

// Estimate is the model's answer, normalised.
type Estimate struct {
	Title     string     `json:"title"`
	Items     []Item     `json:"items"`
	Questions []Question `json:"questions"`
	Totals    Totals     `json:"totals"`
}

// Usage is what a call cost.
type Usage struct {
	InputTokens  int
	OutputTokens int
	CostUSD      float64
}

// Provider is one AI backend.
type Provider interface {
	Name() string
	Model() string
	Estimate(ctx context.Context, req Request) (Estimate, Usage, error)
}

// Result is a successful estimate with where it came from.
type Result struct {
	Estimate Estimate
	Usage    Usage
	Provider string
	Model    string
	Latency  time.Duration
}

// ErrNoProviders means no API key is configured.
var ErrNoProviders = errors.New("AI is not configured")

// Gateway tries providers in order.
type Gateway struct {
	Providers []Provider
	Timeout   time.Duration
}

// Attempt is a failed call, kept for the usage log.
type Attempt struct {
	Provider string
	Model    string
	Err      error
	Latency  time.Duration
}

// Estimate returns the first provider's successful answer. Failed attempts are
// returned too so the caller can log them.
func (g *Gateway) Estimate(ctx context.Context, req Request) (Result, []Attempt, error) {
	if len(g.Providers) == 0 {
		return Result{}, nil, ErrNoProviders
	}
	timeout := g.Timeout
	if timeout == 0 {
		timeout = 45 * time.Second
	}
	var failed []Attempt
	for _, p := range g.Providers {
		start := time.Now()
		cctx, cancel := context.WithTimeout(ctx, timeout)
		est, usage, err := p.Estimate(cctx, req)
		cancel()
		if err == nil {
			err = Normalise(&est)
		}
		if err == nil {
			return Result{Estimate: est, Usage: usage, Provider: p.Name(), Model: p.Model(), Latency: time.Since(start)}, failed, nil
		}
		failed = append(failed, Attempt{Provider: p.Name(), Model: p.Model(), Err: err, Latency: time.Since(start)})
		if ctx.Err() != nil {
			break
		}
	}
	msgs := make([]string, len(failed))
	for i, f := range failed {
		msgs[i] = f.Provider + ": " + f.Err.Error()
	}
	return Result{}, failed, fmt.Errorf("every AI provider failed (%s)", strings.Join(msgs, "; "))
}

// Normalise cleans a model answer: drops empty items, clamps negatives, caps
// counts, recomputes totals from the items and makes sure question ids exist.
func Normalise(e *Estimate) error {
	r1 := func(v float64) float64 { return math.Round(v*10) / 10 }
	var items []Item
	for _, it := range e.Items {
		it.Name = strings.TrimSpace(it.Name)
		if it.Name == "" {
			continue
		}
		it.Kcal = math.Max(0, math.Round(it.Kcal))
		it.ProteinG, it.CarbsG, it.FatG = r1(math.Max(0, it.ProteinG)), r1(math.Max(0, it.CarbsG)), r1(math.Max(0, it.FatG))
		if it.Grams != nil {
			g := math.Max(0, math.Round(*it.Grams))
			it.Grams = &g
		}
		it.Confidence = math.Min(1, math.Max(0, it.Confidence))
		if it.Source != "official" {
			it.Source = "ai"
		}
		items = append(items, it)
		if len(items) == 25 {
			break
		}
	}
	if len(items) == 0 {
		return errors.New("the model found no food")
	}
	e.Items = items
	var t Totals
	for _, it := range items {
		t.Kcal += it.Kcal
		t.ProteinG += it.ProteinG
		t.CarbsG += it.CarbsG
		t.FatG += it.FatG
	}
	e.Totals = Totals{math.Round(t.Kcal), r1(t.ProteinG), r1(t.CarbsG), r1(t.FatG)}
	var qs []Question
	for i, q := range e.Questions {
		if strings.TrimSpace(q.Text) == "" || len(q.Options) < 2 {
			continue
		}
		if q.ID == "" {
			q.ID = fmt.Sprintf("q%d", i+1)
		}
		for j := range q.Options {
			if q.Options[j].ID == "" {
				q.Options[j].ID = fmt.Sprintf("o%d", j+1)
			}
		}
		qs = append(qs, q)
		if len(qs) == 2 {
			break
		}
	}
	if qs == nil {
		qs = []Question{}
	}
	e.Questions = qs
	e.Title = strings.TrimSpace(e.Title)
	if e.Title == "" {
		e.Title = items[0].Name
	}
	return nil
}

// Schema is the JSON schema every provider is asked to fill.
var Schema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"title", "items", "questions"},
	"properties": map[string]any{
		"title": map[string]any{"type": "string", "description": "Short name for the whole meal, e.g. \"Fish curry with rice\""},
		"items": map[string]any{
			"type": "array",
			"items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"name", "grams", "kcal", "protein_g", "carbs_g", "fat_g", "assumption", "confidence", "source"},
				"properties": map[string]any{
					"name":       map[string]any{"type": "string"},
					"grams":      map[string]any{"type": []string{"number", "null"}},
					"kcal":       map[string]any{"type": "number"},
					"protein_g":  map[string]any{"type": "number"},
					"carbs_g":    map[string]any{"type": "number"},
					"fat_g":      map[string]any{"type": "number"},
					"assumption": map[string]any{"type": "string", "description": "The portion or preparation assumed, in a few words"},
					"confidence": map[string]any{"type": "number", "description": "0 to 1"},
					"source":     map[string]any{"type": "string", "enum": []string{"ai", "official"}},
				},
			},
		},
		"questions": map[string]any{
			"type": "array",
			"items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"id", "text", "options"},
				"properties": map[string]any{
					"id":   map[string]any{"type": "string"},
					"text": map[string]any{"type": "string"},
					"options": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type":                 "object",
							"additionalProperties": false,
							"required":             []string{"id", "label"},
							"properties": map[string]any{
								"id":    map[string]any{"type": "string"},
								"label": map[string]any{"type": "string"},
							},
						},
					},
				},
			},
		},
	},
}

// SystemPrompt explains the job to the model.
func SystemPrompt(voice string) string {
	tone := "Write labels and questions in plain, neutral English."
	if voice == "casual" {
		tone = "Write labels and questions in friendly, casual English (short, a bit playful), but keep numbers precise."
	}
	return `You estimate the calories and macronutrients of a meal for a food diary.

Rules:
- Break the meal into separate items (each food, sauce, drink, spread or cooking fat), with grams when you can judge them.
- Base numbers on standard food composition data. Round kcal to whole numbers and grams of macros to one decimal.
- Hidden fat is the most common error: account for cooking oil, butter, ghee, cream, cheese and sauces whenever the dish usually has them, as their own items.
- Each item's "assumption" says the portion or preparation you assumed, in a few words ("normal plate, ~250 g cooked", "fried in ~5 g butter").
- Ask at most two questions, only when the answer would change the total by roughly 100 kcal or more (portion size, cooking method, amount of oil or butter). Give 2 to 4 short options each, ids in snake_case. Ask none when you are confident.
- For a restaurant or chain item, use the chain's published nutrition values when you know them well and set source to "official"; otherwise estimate and set source to "ai". Portions and recipes can differ by country.
- Local dishes (for example Mauritian rice and curry, dholl puri, farata) are common; estimate them like any home-cooked dish.
- When given a previous estimate and the user's answers, return the full revised estimate and only ask questions that are still open.
- When the user corrects the estimate, renames the dish or edits items, treat that as fact: keep their name as the title, keep items they edited unless their correction says otherwise, and recompute anything the correction changes (for example "cooked in oil only, no butter" removes the butter item and sizes the oil).
- Respond only with JSON matching the schema.
` + tone
}

// UserPrompt builds the text part of the request.
func UserPrompt(req Request) string {
	var b strings.Builder
	switch req.Kind {
	case "restaurant":
		b.WriteString("A restaurant or fast-food order.\n")
	case "photo":
		if len(req.Images) > 1 {
			fmt.Fprintf(&b, "%d photos of one meal, from different angles or of different parts (for example the plate, a side, the packaging). Count each food once, even if it shows in several photos.\n", len(req.Images))
		} else {
			b.WriteString("A photo of a meal.\n")
		}
	default:
		b.WriteString("A meal described in words.\n")
	}
	if strings.TrimSpace(req.Text) != "" {
		b.WriteString("The user says: \"" + strings.TrimSpace(req.Text) + "\"\n")
	}
	if strings.TrimSpace(req.Context) != "" {
		b.WriteString("For reference, foods this user logs often (their usual portions):\n" + req.Context + "\n")
	}
	if len(req.Previous) > 0 {
		b.WriteString("Previous estimate:\n" + string(req.Previous) + "\n")
	}
	if t := strings.TrimSpace(req.Title); t != "" {
		b.WriteString("The user named the dish: \"" + t + "\". Use it as the title and let it guide the items.\n")
	}
	if len(req.Edited) > 0 {
		b.WriteString("The user's current items, after their edits:\n" + string(req.Edited) + "\n")
	}
	if c := strings.TrimSpace(req.Correction); c != "" {
		b.WriteString("The user's correction: \"" + c + "\"\n")
	}
	if len(req.Answers) > 0 {
		ans, _ := json.Marshal(req.Answers)
		b.WriteString("The user's answers to your questions (question id → option id): " + string(ans) + "\n")
	}
	b.WriteString("Return the estimate as JSON.")
	return b.String()
}
