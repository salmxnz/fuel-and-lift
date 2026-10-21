package nutrition

import (
	"errors"
	"testing"
	"time"
)

func day(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func ptr(f float64) *float64 { return &f }

// The worked example from the spec: 53 kg, 175 cm, 24-year-old man, moderately
// active, gaining to 70 kg at the standard pace.
func base() Input {
	return Input{
		Sex: Male, DateOfBirth: day("2002-05-14"), HeightCm: 175, WeightKg: 53,
		ActivityLevel: 4, Mode: Gain, GoalWeightKg: ptr(70), Pace: Standard,
		Today: day("2026-10-21"),
	}
}

func TestComputeGainStandard(t *testing.T) {
	p, err := Compute(base())
	if err != nil {
		t.Fatal(err)
	}
	if p.BMRKcal != 1509 {
		t.Errorf("BMR = %v, want 1509", p.BMRKcal)
	}
	if p.MaintenanceKcal != 2340 {
		t.Errorf("maintenance = %v, want 2340", p.MaintenanceKcal)
	}
	if p.RateKgPerWeek != 0.27 {
		t.Errorf("rate = %v, want 0.27", p.RateKgPerWeek)
	}
	if p.TargetKcal != 2630 {
		t.Errorf("target = %v, want 2630", p.TargetKcal)
	}
	if p.WeeksToGoal == nil || *p.WeeksToGoal < 63 || *p.WeeksToGoal > 65 {
		t.Errorf("weeks = %v, want ~64", p.WeeksToGoal)
	}
	if p.ForecastDate == nil || (*p.ForecastDate)[:7] != "2028-01" {
		t.Errorf("forecast = %v, want January 2028", p.ForecastDate)
	}
	m := p.Macros
	if m.ProteinG != 95 {
		t.Errorf("protein = %v, want 95", m.ProteinG)
	}
	kcal := m.ProteinG*4 + m.FatG*9 + m.CarbsG*4
	if kcal < p.TargetKcal-10 || kcal > p.TargetKcal+10 {
		t.Errorf("macros add up to %v, target %v", kcal, p.TargetKcal)
	}
}

func TestPacesOrder(t *testing.T) {
	var prev float64
	for _, pace := range Paces {
		in := base()
		in.Pace = pace
		p, err := Compute(in)
		if err != nil {
			t.Fatal(err)
		}
		if p.TargetKcal <= prev {
			t.Errorf("%s target %v not above previous %v", pace, p.TargetKcal, prev)
		}
		prev = p.TargetKcal
	}
}

func TestLoseFloorsAtBMR(t *testing.T) {
	in := Input{
		Sex: Female, DateOfBirth: day("1990-01-01"), HeightCm: 160, WeightKg: 60,
		ActivityLevel: 1, Mode: Lose, GoalWeightKg: ptr(55), Pace: Fast, Today: day("2026-10-21"),
	}
	p, err := Compute(in)
	if err != nil {
		t.Fatal(err)
	}
	if p.TargetKcal < p.BMRKcal-10 {
		t.Errorf("target %v below BMR %v", p.TargetKcal, p.BMRKcal)
	}
	if len(p.Warnings) == 0 {
		t.Error("expected a warning when the floor applies")
	}
}

func TestValidation(t *testing.T) {
	cases := map[string]func(*Input){
		"gain goal below current":  func(in *Input) { in.GoalWeightKg = ptr(50) },
		"lose goal under BMI 18.5": func(in *Input) { in.Mode = Lose; in.WeightKg = 60; in.GoalWeightKg = ptr(50) },
		"too young":                func(in *Input) { in.DateOfBirth = day("2014-01-01") },
		"bad activity":             func(in *Input) { in.ActivityLevel = 9 },
		"missing goal":             func(in *Input) { in.GoalWeightKg = nil },
	}
	for name, mut := range cases {
		in := base()
		mut(&in)
		_, err := Compute(in)
		var ve ValidationError
		if !errors.As(err, &ve) {
			t.Errorf("%s: want ValidationError, got %v", name, err)
		}
	}
	in := base()
	in.Mode, in.GoalWeightKg = Maintain, nil
	p, err := Compute(in)
	if err != nil || p.DeltaKcal != 0 || p.ForecastDate != nil {
		t.Errorf("maintain: %+v %v", p, err)
	}
}

func TestAdapt(t *testing.T) {
	var days []DayPoint
	var weights []WeightPoint
	start := day("2026-01-01")
	for i := 0; i < 28; i++ {
		d := start.AddDate(0, 0, i)
		days = append(days, DayPoint{Date: d, IntakeOK: true, Kcal: 2600})
		// gaining 0.25 kg/week
		weights = append(weights, WeightPoint{Date: d, WeightKg: 53 + 0.25*float64(i)/7})
	}
	tdee, err := Adapt(days, weights)
	if err != nil {
		t.Fatal(err)
	}
	// 0.25 kg/week ≈ 275 kcal/day surplus, smoothed trend lags a little, so
	// expenditure lands a bit above 2600-275.
	if tdee < 2300 || tdee > 2450 {
		t.Errorf("tdee = %v, want ~2325-2400", tdee)
	}
	if _, err := Adapt(days[:5], weights[:5]); !errors.Is(err, ErrNotEnoughData) {
		t.Errorf("want ErrNotEnoughData, got %v", err)
	}
}
