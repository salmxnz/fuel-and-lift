package email

import (
	"fmt"
	"strconv"
)

// Template data. Field names must match the Go tokens in templates/, which
// emails/scripts/export.tsx writes from the React Email sources: change both
// together. Every message embeds Base, which the Mailer fills in on send.

// Base is what every template's header, footer and images need.
type Base struct {
	AppURL    string
	AssetsURL string // where web/public is served; images are ${AssetsURL}/email/*.png
}

func (b *Base) base() *Base { return b }

// Welcome is sent once, when someone finishes onboarding.
type Welcome struct {
	Base
	FirstName           string
	Calories            string // "2,150"
	Protein, Carbs, Fat string // grams, "160"
	ReferralsForPro     int
}

func (*Welcome) template() string { return "welcome" }
func (m *Welcome) subject() string {
	return fmt.Sprintf("Welcome to adebite, %s. Your plan is ready", m.FirstName)
}

// FriendJoined tells an inviter that someone who joined through their link has
// finished onboarding and counts towards Pro.
type FriendJoined struct {
	Base
	FirstName  string
	FriendName string
	Referrals  int // counted so far, 0–8 (the progress images are drawn for 8)
	Needed     int
	Remaining  int
}

func (*FriendJoined) template() string { return "friend-joined" }
func (m *FriendJoined) subject() string {
	return fmt.Sprintf("%s joined adebite through your link", m.FriendName)
}

// ProUnlocked is sent when an inviter reaches the referral goal.
type ProUnlocked struct {
	Base
	FirstName string
	Needed    int
}

func (*ProUnlocked) template() string { return "pro-unlocked" }
func (*ProUnlocked) subject() string  { return "You've got Pro, for good" }

// PhotoLimit is sent when a free user uses their last photo estimate of the month.
type PhotoLimit struct {
	Base
	FirstName string
	Limit     int
	Month     string // "October"
	ResetsOn  string // "1 November"
	Referrals int
	Needed    int
}

func (*PhotoLimit) template() string { return "photo-limit" }
func (m *PhotoLimit) subject() string {
	return fmt.Sprintf("You've used your %d photo estimates for %s", m.Limit, m.Month)
}

// WeeklyRecap summarises the week before. The template exists; nothing sends
// it yet (it needs a scheduler and an opt-out in notification settings).
type WeeklyRecap struct {
	Base
	FirstName      string
	WeekRange      string // "13–19 Oct"
	DaysLogged     int
	AvgCalories    string
	TargetCalories string
	Workouts       int
	WeightChange   string // "−0.4 kg"
}

func (*WeeklyRecap) template() string { return "weekly-recap" }
func (*WeeklyRecap) subject() string  { return "Your week on adebite" }

// Thousands formats a whole number with comma separators: 2150 → "2,150".
func Thousands(n float64) string {
	s := strconv.FormatInt(int64(n+0.5), 10)
	neg := s[0] == '-'
	if neg {
		s = s[1:]
	}
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	if neg {
		s = "-" + s
	}
	return s
}
