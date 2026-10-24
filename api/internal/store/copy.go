package store

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// Copying something into another person's account: shares, and adds from
// the Shop. Templates are snapshotted with their exercises so a custom
// exercise can be recreated on the other side.

// copiedFrom is the person a copy came from, as scanned (all nullable).
type copiedFrom struct{ id, name, avatar *string }

func (c copiedFrom) person() *Person {
	if c.id == nil {
		return nil
	}
	p := Person{ID: *c.id, AvatarURL: c.avatar}
	if c.name != nil {
		p.Name = *c.name
	}
	return &p
}

// copiedFromCols and copiedFromJoin read an item's copied_from_user.
const copiedFromCols = `cu.id::text, coalesce(cp.display_name, cu.name), cu.avatar_url`

func copiedFromJoin(alias string) string {
	return `left join users cu on cu.id = ` + alias + `.copied_from_user left join profiles cp on cp.user_id = cu.id`
}

// snapshotTemplate is a template as it leaves its owner's account.
func snapshotTemplate(t Template) SharedTemplate {
	out := SharedTemplate{Name: t.Name, Exercises: []string{}, Blocks: []sharedBlock{}}
	for _, b := range t.Blocks {
		if b.Exercise.ID == "" {
			continue // an exercise that no longer exists
		}
		out.Exercises = append(out.Exercises, b.Exercise.Name)
		out.Blocks = append(out.Blocks, sharedBlock{Exercise: b.Exercise, Sets: b.Sets, Cardio: b.Cardio, RestSeconds: b.RestSeconds, Notes: b.Notes})
	}
	return out
}

// ownBlocks turns snapshotted blocks into blocks of userID's: exercises they
// can already use are kept, anyone else's are matched by name in their
// library or created there.
func ownBlocks(ctx context.Context, tx pgx.Tx, userID string, blocks []sharedBlock) ([]BlockInput, error) {
	ids := make([]string, 0, len(blocks))
	for _, b := range blocks {
		ids = append(ids, b.Exercise.ID)
	}
	visible, err := exercisesByID(ctx, tx, userID, ids)
	if err != nil {
		return nil, err
	}
	out := make([]BlockInput, 0, len(blocks))
	for _, b := range blocks {
		exID := b.Exercise.ID
		if _, ok := visible[exID]; !ok {
			if exID, err = ownExercise(ctx, tx, userID, b.Exercise); err != nil {
				return nil, err
			}
		}
		out = append(out, BlockInput{ExerciseID: exID, Sets: b.Sets, Cardio: b.Cardio, RestSeconds: b.RestSeconds, Notes: b.Notes})
	}
	return out, nil
}

// copyWorkout makes a NewWorkout of userID's from a snapshot, naming it
// after the original unless that name is taken.
func copyWorkout(ctx context.Context, tx pgx.Tx, userID string, t SharedTemplate, fromName string) (NewWorkout, error) {
	blocks, err := ownBlocks(ctx, tx, userID, t.Blocks)
	if err != nil {
		return NewWorkout{}, err
	}
	name, err := copyName(ctx, tx, userID, t.Name, fromName)
	return NewWorkout{Name: name, Blocks: blocks}, err
}
