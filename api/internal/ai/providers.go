package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 60 * time.Second}

func postJSON(ctx context.Context, url string, headers map[string]string, body any, out any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode/100 != 2 {
		msg := strings.TrimSpace(string(b))
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return fmt.Errorf("%s: %s", res.Status, msg)
	}
	return json.Unmarshal(b, out)
}

// parseJSONText decodes model text that should be JSON, tolerating code fences.
func parseJSONText(s string, out any) error {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	if i := strings.Index(s, "{"); i > 0 {
		s = s[i:]
	}
	return json.Unmarshal([]byte(strings.TrimSpace(s)), out)
}

// --- OpenRouter (OpenAI-compatible; Gemini Flash by default) -----------------

// OpenRouter calls https://openrouter.ai.
type OpenRouter struct {
	APIKey  string
	ModelID string
	BaseURL string // default https://openrouter.ai/api/v1
	AppURL  string // sent as HTTP-Referer
	AppName string
}

// Name implements Provider.
func (o *OpenRouter) Name() string { return "openrouter" }

// Model implements Provider.
func (o *OpenRouter) Model() string { return o.ModelID }

// Estimate implements Provider.
func (o *OpenRouter) Estimate(ctx context.Context, req Request) (Estimate, Usage, error) {
	base := o.BaseURL
	if base == "" {
		base = "https://openrouter.ai/api/v1"
	}
	content := []map[string]any{{"type": "text", "text": UserPrompt(req)}}
	for _, img := range req.Images {
		content = append(content, map[string]any{
			"type":      "image_url",
			"image_url": map[string]string{"url": "data:" + img.MediaType + ";base64," + img.Data},
		})
	}
	body := map[string]any{
		"model": o.ModelID,
		"messages": []map[string]any{
			{"role": "system", "content": SystemPrompt(req.Voice)},
			{"role": "user", "content": content},
		},
		"temperature": 0.2,
		"max_tokens":  1500,
		"response_format": map[string]any{
			"type":        "json_schema",
			"json_schema": map[string]any{"name": "meal_estimate", "strict": true, "schema": Schema},
		},
		"usage": map[string]bool{"include": true},
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int     `json:"prompt_tokens"`
			CompletionTokens int     `json:"completion_tokens"`
			Cost             float64 `json:"cost"`
		} `json:"usage"`
	}
	headers := map[string]string{"Authorization": "Bearer " + o.APIKey}
	if o.AppURL != "" {
		headers["HTTP-Referer"] = o.AppURL
	}
	if o.AppName != "" {
		headers["X-Title"] = o.AppName
	}
	if err := postJSON(ctx, base+"/chat/completions", headers, body, &out); err != nil {
		return Estimate{}, Usage{}, err
	}
	usage := Usage{InputTokens: out.Usage.PromptTokens, OutputTokens: out.Usage.CompletionTokens, CostUSD: out.Usage.Cost}
	if len(out.Choices) == 0 {
		return Estimate{}, usage, errors.New("empty response")
	}
	var est Estimate
	if err := parseJSONText(out.Choices[0].Message.Content, &est); err != nil {
		return Estimate{}, usage, fmt.Errorf("model did not return valid JSON: %w", err)
	}
	return est, usage, nil
}

// --- Anthropic (Claude, tool use for structured output) -----------------------

// Anthropic calls the Claude Messages API.
type Anthropic struct {
	APIKey  string
	ModelID string
	BaseURL string // default https://api.anthropic.com
	// Prices in USD per million tokens, for the budget cap.
	PriceInPerM  float64
	PriceOutPerM float64
}

// Name implements Provider.
func (a *Anthropic) Name() string { return "anthropic" }

// Model implements Provider.
func (a *Anthropic) Model() string { return a.ModelID }

// Estimate implements Provider.
func (a *Anthropic) Estimate(ctx context.Context, req Request) (Estimate, Usage, error) {
	base := a.BaseURL
	if base == "" {
		base = "https://api.anthropic.com"
	}
	var content []map[string]any
	for _, img := range req.Images {
		content = append(content, map[string]any{
			"type":   "image",
			"source": map[string]string{"type": "base64", "media_type": img.MediaType, "data": img.Data},
		})
	}
	content = append(content, map[string]any{"type": "text", "text": UserPrompt(req)})
	body := map[string]any{
		"model":      a.ModelID,
		"max_tokens": 1500,
		"system":     SystemPrompt(req.Voice),
		"messages":   []map[string]any{{"role": "user", "content": content}},
		"tools": []map[string]any{{
			"name":         "record_estimate",
			"description":  "Record the itemised meal estimate.",
			"input_schema": Schema,
		}},
		"tool_choice": map[string]string{"type": "tool", "name": "record_estimate"},
	}
	var out struct {
		Content []struct {
			Type  string          `json:"type"`
			Input json.RawMessage `json:"input"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	headers := map[string]string{"x-api-key": a.APIKey, "anthropic-version": "2023-06-01"}
	if err := postJSON(ctx, base+"/v1/messages", headers, body, &out); err != nil {
		return Estimate{}, Usage{}, err
	}
	usage := Usage{
		InputTokens: out.Usage.InputTokens, OutputTokens: out.Usage.OutputTokens,
		CostUSD: float64(out.Usage.InputTokens)*a.PriceInPerM/1e6 + float64(out.Usage.OutputTokens)*a.PriceOutPerM/1e6,
	}
	for _, c := range out.Content {
		if c.Type == "tool_use" {
			var est Estimate
			if err := json.Unmarshal(c.Input, &est); err != nil {
				return Estimate{}, usage, fmt.Errorf("model returned a malformed estimate: %w", err)
			}
			return est, usage, nil
		}
	}
	return Estimate{}, usage, errors.New("model did not call the estimate tool")
}
