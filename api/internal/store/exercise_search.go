package store

import (
	"sort"
	"strings"
	"unicode"
)

// Exercise search runs in Go: the library is a few hundred rows at most, and
// ranking with word order, aliases and typos is far simpler here than in SQL.

// searchDoc is an exercise broken into matchable words, by field.
type searchDoc struct {
	name, aliases, other []string // other = muscle group + equipment
	nameNorm             string
}

// normWords lowercases s, turns punctuation into spaces and splits it. It also
// adds each pair of neighbouring words joined ("stair master" → "stairmaster",
// "pull-up" → "pullup") so either spelling matches.
func normWords(s string) []string {
	f := strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	out := append([]string{}, f...)
	for i := 0; i+1 < len(f); i++ {
		out = append(out, f[i]+f[i+1])
	}
	return out
}

func normPhrase(s string) string { return strings.Join(normWordsPlain(s), " ") }

func normWordsPlain(s string) []string {
	return strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}

func newSearchDoc(e Exercise) searchDoc {
	d := searchDoc{name: normWords(e.Name), nameNorm: normPhrase(e.Name)}
	for _, a := range e.Aliases {
		d.aliases = append(d.aliases, normWords(a)...)
	}
	if e.MuscleGroup != nil {
		d.other = append(d.other, normWords(*e.MuscleGroup)...)
	}
	if e.Equipment != nil {
		d.other = append(d.other, normWords(*e.Equipment)...)
	}
	return d
}

// wordScore is how well query word t matches one document word w: exact 3,
// prefix 2, substring 1.5, a small typo 1, otherwise 0.
func wordScore(t, w string) float64 {
	switch {
	case t == w:
		return 3
	case len(t) >= 2 && strings.HasPrefix(w, t):
		return 2
	case len(t) >= 3 && strings.Contains(w, t):
		return 1.5
	}
	if len(t) < 4 {
		return 0
	}
	max := 1
	if len(t) >= 7 {
		max = 2
	}
	// Compare with the whole word and with its start, so a half-typed word
	// with a typo ("benc prss") still counts.
	if editDistance(t, w) <= max {
		return 1
	}
	if len(w) > len(t) && editDistance(t, w[:len(t)]) <= max {
		return 1
	}
	return 0
}

func bestIn(t string, words []string) float64 {
	best := 0.0
	for _, w := range words {
		if s := wordScore(t, w); s > best {
			best = s
		}
	}
	return best
}

// score ranks one exercise for the query words; ok is false when any query
// word matches nothing (every word must match, in any order).
func (d searchDoc) score(q string, words []string) (score float64, viaAlias bool, ok bool) {
	nameOnly := true
	for _, t := range words {
		n := bestIn(t, d.name)
		a := bestIn(t, d.aliases) * 0.8
		o := bestIn(t, d.other) * 0.5
		best := n
		if a > best {
			best = a
		}
		if o > best {
			best = o
		}
		if best == 0 {
			return 0, false, false
		}
		if n < best {
			nameOnly = false
		}
		score += best
	}
	switch {
	case d.nameNorm == q:
		score += 100
	case strings.HasPrefix(d.nameNorm, q):
		score += 20
	}
	if nameOnly {
		score += 5
	}
	return score, !nameOnly, true
}

// RankExercises filters and orders exercises for a search query. An empty
// query returns everything by name. Query words may come in any order, match
// names, other names (aliases), muscle group or equipment, and allow a typo.
func RankExercises(list []Exercise, q string, limit int) []Exercise {
	words := normWordsPlain(q)
	if len(words) > 5 {
		words = words[:5]
	}
	type hit struct {
		e     Exercise
		score float64
	}
	var hits []hit
	phrase := strings.Join(words, " ")
	for _, e := range list {
		if len(words) == 0 {
			hits = append(hits, hit{e: e})
			continue
		}
		d := newSearchDoc(e)
		s, viaAlias, ok := d.score(phrase, words)
		if !ok {
			continue
		}
		e.MatchedAlias = nil
		if viaAlias {
			if a := matchedAlias(e.Aliases, words); a != "" {
				e.MatchedAlias = &a
			}
		}
		hits = append(hits, hit{e, s})
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].score != hits[j].score {
			return hits[i].score > hits[j].score
		}
		return strings.ToLower(hits[i].e.Name) < strings.ToLower(hits[j].e.Name)
	})
	if limit > 0 && len(hits) > limit {
		hits = hits[:limit]
	}
	out := make([]Exercise, len(hits))
	for i, h := range hits {
		out[i] = h.e
	}
	return out
}

// matchedAlias picks the alias that best explains a match, for the picker's
// "matches ‘stairmaster’" hint.
func matchedAlias(aliases []string, words []string) string {
	best, bestScore := "", 0.0
	for _, a := range aliases {
		aw := normWords(a)
		s := 0.0
		for _, t := range words {
			s += bestIn(t, aw)
		}
		if s > bestScore {
			best, bestScore = a, s
		}
	}
	return best
}

// editDistance is the optimal string alignment distance: insertions,
// deletions, substitutions and swaps of neighbouring letters each cost 1.
func editDistance(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	d := make([][]int, len(ra)+1)
	for i := range d {
		d[i] = make([]int, len(rb)+1)
		d[i][0] = i
	}
	for j := 0; j <= len(rb); j++ {
		d[0][j] = j
	}
	for i := 1; i <= len(ra); i++ {
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			d[i][j] = min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost)
			if i > 1 && j > 1 && ra[i-1] == rb[j-2] && ra[i-2] == rb[j-1] {
				d[i][j] = min(d[i][j], d[i-2][j-2]+1)
			}
		}
	}
	return d[len(ra)][len(rb)]
}
