// Package nutrition turns a person's stats and goal into calorie and macro
// targets, and estimates expenditure from logged intake and weight trend.
package nutrition

import (
	"errors"
	"fmt"
	"math"
	"time"
)

// KcalPerKg is the starting assumption for converting a weight change to energy.
// The adaptive estimate (Adapt) corrects for it from real data.
const KcalPerKg = 7700.0

// Sex for the BMR formula.
type Sex string

const (
	Male   Sex = "male"
	Female Sex = "female"
)

// Mode is the goal direction.
type Mode string

const (
	Gain     Mode = "gain"
	Lose     Mode = "lose"
	Maintain Mode = "maintain"
)

// Pace is the chosen speed.
type Pace string

const (
	Slow     Pace = "slow"
	Standard Pace = "standard"
	Fast     Pace = "fast"
)

// Paces lists the paces in display order.
var Paces = []Pace{Slow, Standard, Fast}

// activityFactors maps the six onboarding levels to TDEE multipliers.
var activityFactors = map[int]float64{1: 1.2, 2: 1.375, 3: 1.46, 4: 1.55, 5: 1.725, 6: 1.9}

// ratePct is weekly change as a percentage of body weight.
var ratePct = map[Mode]map[Pace]float64{
	Gain: {Slow: 0.25, Standard: 0.5, Fast: 0.75},
	Lose: {Slow: 0.5, Standard: 0.75, Fast: 1.0},
}

// Input is everything a plan needs.
type Input struct {
	Sex           Sex
	DateOfBirth   time.Time
	HeightCm      float64
	WeightKg      float64
	ActivityLevel int
	Mode          Mode
	GoalWeightKg  *float64
	Pace          Pace
	Today         time.Time // the day the plan starts (user's local date)
	// MaintenanceOverride replaces the formula estimate with an adaptive one.
	MaintenanceOverride *float64
}

// Macros in grams.
type Macros struct {
	ProteinG float64 `json:"protein_g"`
	FatG     float64 `json:"fat_g"`
	CarbsG   float64 `json:"carbs_g"`
}

// Plan is the computed target.
type Plan struct {
	BMRKcal         float64  `json:"bmr_kcal"`
	MaintenanceKcal float64  `json:"maintenance_kcal"`
	TargetKcal      float64  `json:"target_kcal"`
	DeltaKcal       float64  `json:"delta_kcal"`
	RateKgPerWeek   float64  `json:"rate_kg_per_week"`
	WeeksToGoal     *float64 `json:"weeks_to_goal"`
	ForecastDate    *string  `json:"forecast_date"`
	Macros          Macros   `json:"macros"`
	Warnings        []string `json:"warnings"`
}

// ValidationError is a problem with the input the user can fix.
type ValidationError struct{ Msg string }

func (e ValidationError) Error() string { return e.Msg }

// AgeOn returns whole years between dob and day.
func AgeOn(dob, day time.Time) int {
	age := day.Year() - dob.Year()
	if day.YearDay() < dob.YearDay() {
		age--
	}
	return age
}

// BMR is Mifflin-St Jeor resting energy in kcal/day.
func BMR(sex Sex, weightKg, heightCm float64, age int) float64 {
	b := 10*weightKg + 6.25*heightCm - 5*float64(age)
	if sex == Female {
		return b - 161
	}
	return b + 5
}

// Validate checks an input without computing.
func Validate(in Input) error {
	switch in.Sex {
	case Male, Female:
	default:
		return ValidationError{"sex must be male or female"}
	}
	if in.HeightCm < 120 || in.HeightCm > 230 {
		return ValidationError{"height must be between 120 and 230 cm"}
	}
	if in.WeightKg < 30 || in.WeightKg > 300 {
		return ValidationError{"weight must be between 30 and 300 kg"}
	}
	if _, ok := activityFactors[in.ActivityLevel]; !ok {
		return ValidationError{"activity_level must be 1 to 6"}
	}
	if age := AgeOn(in.DateOfBirth, in.Today); age < 16 || age > 100 {
		return ValidationError{"you need to be at least 16 to use adebite"}
	}
	switch in.Mode {
	case Maintain:
	case Gain, Lose:
		if _, ok := ratePct[in.Mode][in.Pace]; !ok {
			return ValidationError{"pace must be slow, standard or fast"}
		}
		if in.GoalWeightKg == nil {
			return ValidationError{"goal_weight_kg is required to gain or lose"}
		}
		g := *in.GoalWeightKg
		if in.Mode == Gain && g <= in.WeightKg {
			return ValidationError{"to gain, the goal weight must be above your current weight"}
		}
		if in.Mode == Lose && g >= in.WeightKg {
			return ValidationError{"to lose, the goal weight must be below your current weight"}
		}
		if in.Mode == Lose {
			h := in.HeightCm / 100
			if g/(h*h) < 18.5 {
				return ValidationError{fmt.Sprintf("a goal below %.1f kg is under a BMI of 18.5 for your height; pick a higher goal", math.Ceil(18.5*h*h*10)/10)}
			}
		}
	default:
		return ValidationError{"mode must be gain, lose or maintain"}
	}
	return nil
}

// Compute returns the plan for an input.
func Compute(in Input) (Plan, error) {
	if err := Validate(in); err != nil {
		return Plan{}, err
	}
	age := AgeOn(in.DateOfBirth, in.Today)
	bmr := BMR(in.Sex, in.WeightKg, in.HeightCm, age)
	maintenance := bmr * activityFactors[in.ActivityLevel]
	if in.MaintenanceOverride != nil && *in.MaintenanceOverride > 0 {
		maintenance = *in.MaintenanceOverride
	}

	p := Plan{BMRKcal: round(bmr, 1), MaintenanceKcal: round(maintenance, 10), Warnings: []string{}}

	if in.Mode != Maintain {
		pct := ratePct[in.Mode][in.Pace]
		rate := in.WeightKg * pct / 100
		if in.Mode == Lose {
			rate = -rate
		}
		p.RateKgPerWeek = round(rate, 0.01)
		p.DeltaKcal = round(rate*KcalPerKg/7, 1)

		weeks := math.Abs(*in.GoalWeightKg-in.WeightKg) / math.Abs(rate)
		w := round(weeks, 1)
		p.WeeksToGoal = &w
		d := in.Today.AddDate(0, 0, int(math.Ceil(weeks*7))).Format("2006-01-02")
		p.ForecastDate = &d

		if in.Mode == Gain && in.Pace == Fast {
			p.Warnings = append(p.Warnings, "Above 0.5% a week, more of the gain tends to be fat than muscle.")
		}
	}

	target := maintenance + p.DeltaKcal
	if in.Mode == Lose && target < bmr {
		target = bmr
		p.Warnings = append(p.Warnings, "Your target was raised to your resting energy; eating below it is not recommended.")
	}
	p.TargetKcal = round(target, 10)
	p.DeltaKcal = round(p.TargetKcal-p.MaintenanceKcal, 1)
	p.Macros = macros(in.Mode, in.WeightKg, p.TargetKcal)
	return p, nil
}

// macros splits a target: protein by body weight (more when losing, to keep
// muscle), fat at least 0.8 g/kg or a quarter of energy, carbs the rest.
func macros(mode Mode, weightKg, kcal float64) Macros {
	perKg := 1.8
	if mode == Lose {
		perKg = 2.0
	}
	protein := math.Round(weightKg * perKg)
	fat := math.Round(math.Max(0.8*weightKg, 0.25*kcal/9))
	carbs := math.Round((kcal - protein*4 - fat*9) / 4)
	if carbs < 0 {
		carbs = 0
	}
	return Macros{ProteinG: protein, FatG: fat, CarbsG: carbs}
}

func round(v, step float64) float64 { return math.Round(v/step) * step }

// --- Adaptive expenditure -------------------------------------------------

// DayPoint is one day of data for the adaptive estimate.
type DayPoint struct {
	Date     time.Time
	IntakeOK bool    // the day was logged
	Kcal     float64 // logged intake
}

// WeightPoint is one weigh-in.
type WeightPoint struct {
	Date     time.Time
	WeightKg float64
}

// Trend returns an exponentially smoothed weight per weigh-in (alpha 0.1 per
// day of gap, the usual "trend weight" used by Hacker's Diet style apps).
func Trend(points []WeightPoint) []WeightPoint {
	out := make([]WeightPoint, 0, len(points))
	var prev *WeightPoint
	for _, p := range points {
		if prev == nil {
			out = append(out, p)
			prev = &out[len(out)-1]
			continue
		}
		days := p.Date.Sub(prev.Date).Hours() / 24
		if days < 1 {
			days = 1
		}
		alpha := 1 - math.Pow(0.9, days)
		v := prev.WeightKg + alpha*(p.WeightKg-prev.WeightKg)
		out = append(out, WeightPoint{Date: p.Date, WeightKg: round(v, 0.01)})
		prev = &out[len(out)-1]
	}
	return out
}

// ErrNotEnoughData means the adaptive estimate needs more logs or weigh-ins.
var ErrNotEnoughData = errors.New("not enough data")

// Adapt estimates daily expenditure over the window: average logged intake
// minus the energy of the trend-weight change. It needs at least 10 logged
// days and two weigh-ins at least 10 days apart.
func Adapt(days []DayPoint, weights []WeightPoint) (float64, error) {
	var sum float64
	var n int
	for _, d := range days {
		if d.IntakeOK {
			sum += d.Kcal
			n++
		}
	}
	if n < 10 || len(weights) < 2 {
		return 0, ErrNotEnoughData
	}
	tr := Trend(weights)
	first, last := tr[0], tr[len(tr)-1]
	span := last.Date.Sub(first.Date).Hours() / 24
	if span < 10 {
		return 0, ErrNotEnoughData
	}
	intake := sum / float64(n)
	change := (last.WeightKg - first.WeightKg) * KcalPerKg / span
	return round(intake-change, 10), nil
}
