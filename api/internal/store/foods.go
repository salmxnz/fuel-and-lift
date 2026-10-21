package store

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Food is a food with macros per 100 g.
type Food struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Brand        *string  `json:"brand"`
	Per100g      Macros   `json:"per_100g"`
	ServingName  *string  `json:"serving_name"`
	ServingGrams *float64 `json:"serving_grams"`
	Source       string   `json:"source"`
	Barcode      *string  `json:"barcode"`
	Chain        *string  `json:"chain"`
}

const foodCols = `id::text, name, brand, kcal_100g::float8, protein_100g::float8, carbs_100g::float8, fat_100g::float8,
	serving_name, serving_grams::float8, source, barcode, chain`

func scanFood(r pgx.CollectableRow) (Food, error) {
	var f Food
	return f, r.Scan(&f.ID, &f.Name, &f.Brand, &f.Per100g.Kcal, &f.Per100g.ProteinG, &f.Per100g.CarbsG, &f.Per100g.FatG,
		&f.ServingName, &f.ServingGrams, &f.Source, &f.Barcode, &f.Chain)
}

// ListFoods searches the user's custom foods and the shared ones.
func (s *Store) ListFoods(ctx context.Context, userID, q string) ([]Food, error) {
	q = "%" + strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(q), "%", ""), "_", "") + "%"
	rows, err := s.Pool.Query(ctx, `
		select `+foodCols+` from foods
		where (owner_id = $1::uuid or owner_id is null)
		  and (name ilike $2 or coalesce(brand, '') ilike $2 or coalesce(chain, '') ilike $2)
		order by (owner_id is null), name limit 50`, userID, q)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, scanFood)
	if out == nil {
		out = []Food{}
	}
	return out, err
}

// CreateFood adds a custom food (ownerID set) or a shared one (ownerID "").
func (s *Store) CreateFood(ctx context.Context, ownerID string, f Food) (Food, error) {
	var owner any
	if ownerID != "" {
		owner = ownerID
	}
	rows, err := s.Pool.Query(ctx, `
		insert into foods (owner_id, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_name, serving_grams, source, barcode, chain)
		values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning `+foodCols,
		owner, f.Name, f.Brand, f.Per100g.Kcal, f.Per100g.ProteinG, f.Per100g.CarbsG, f.Per100g.FatG,
		f.ServingName, f.ServingGrams, f.Source, f.Barcode, f.Chain)
	if err != nil {
		return Food{}, err
	}
	return pgx.CollectExactlyOneRow(rows, scanFood)
}

// FoodByBarcode returns a cached shared food for a barcode.
func (s *Store) FoodByBarcode(ctx context.Context, code string) (Food, error) {
	rows, err := s.Pool.Query(ctx, `select `+foodCols+` from foods where barcode = $1 and owner_id is null`, code)
	if err != nil {
		return Food{}, err
	}
	f, err := pgx.CollectExactlyOneRow(rows, scanFood)
	return f, notFound(err)
}
