package store

import (
	"context"
	"encoding/json"
	"time"
)

// AIRecord is one AI call, successful or not.
type AIRecord struct {
	UserID       string
	Kind         string
	HasImage     bool
	ImageCount   int
	InputText    string
	Answers      map[string]string
	PreviousID   *string
	Provider     string
	Model        string
	Result       any
	OK           bool
	Error        string
	InputTokens  int
	OutputTokens int
	CostUSD      float64
	LatencyMS    int
}

// RecordAI stores an AI call and returns its id.
func (s *Store) RecordAI(ctx context.Context, r AIRecord) (string, error) {
	var answers, result []byte
	if len(r.Answers) > 0 {
		answers, _ = json.Marshal(r.Answers)
	}
	if r.Result != nil {
		result, _ = json.Marshal(r.Result)
	}
	var id string
	err := s.Pool.QueryRow(ctx, `
		insert into ai_estimates (user_id, kind, has_image, input_text, answers, previous_id, provider, model, result, ok, error,
		                          input_tokens, output_tokens, cost_usd, latency_ms, image_count)
		values ($1::uuid, $2, $3, nullif($4, ''), $5, $6::uuid, nullif($7, ''), nullif($8, ''), $9, $10, nullif($11, ''), $12, $13, $14, $15, $16)
		returning id::text`,
		r.UserID, r.Kind, r.HasImage, r.InputText, answers, r.PreviousID, r.Provider, r.Model, result, r.OK, r.Error,
		r.InputTokens, r.OutputTokens, r.CostUSD, r.LatencyMS, r.ImageCount).Scan(&id)
	return id, err
}

// PreviousEstimate returns the input and result of one of the user's estimates
// (to refine it with answers).
func (s *Store) PreviousEstimate(ctx context.Context, userID, id string) (kind, text string, result json.RawMessage, err error) {
	var t *string
	err = s.Pool.QueryRow(ctx, `select kind, input_text, result from ai_estimates where id = $1::uuid and user_id = $2::uuid and ok`, id, userID).
		Scan(&kind, &t, &result)
	if t != nil {
		text = *t
	}
	return kind, text, result, notFound(err)
}

// AIUsage counts a user's calls.
type AIUsage struct {
	CallsToday      int
	PhotosThisMonth int
	CallsLastMinute int
}

// GetAIUsage counts successful calls since dayStart and monthStart, and any
// call in the last minute. Failed calls don't use up the allowance.
func (s *Store) GetAIUsage(ctx context.Context, userID string, dayStart, monthStart time.Time) (AIUsage, error) {
	var u AIUsage
	err := s.Pool.QueryRow(ctx, `
		select count(*) filter (where ok and created_at >= $2),
		       count(*) filter (where ok and has_image and created_at >= $3),
		       count(*) filter (where created_at >= now() - interval '1 minute')
		from ai_estimates where user_id = $1::uuid and created_at >= least($2, $3, now() - interval '1 minute')`,
		userID, dayStart, monthStart).Scan(&u.CallsToday, &u.PhotosThisMonth, &u.CallsLastMinute)
	return u, err
}

// AISpendSince returns the total AI cost across everyone since t.
func (s *Store) AISpendSince(ctx context.Context, t time.Time) (float64, error) {
	var v float64
	err := s.Pool.QueryRow(ctx, `select coalesce(sum(cost_usd), 0)::float8 from ai_estimates where created_at >= $1`, t).Scan(&v)
	return v, err
}
