package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/push"
	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// Local times for the scheduled pushes that aren't set by the user.
const (
	weighInAt    = "08:00"
	workoutDayAt = "09:00"
	weeklyAt     = "19:00" // Sundays: the recap and friends' goals
	streakRiskAt = "20:00"
	friendDayAt  = "20:30" // a friend hit their target today and you haven't yet
)

// reminderWindow is how long after its time a reminder may still go out, so a
// restart or a slow tick doesn't lose it.
const reminderWindow = time.Hour

// RunReminders sends scheduled pushes (meal reminders, streak at risk, the
// weekly recap…) once a minute until ctx ends. Each push is claimed in
// notification_log first, so it goes out once even with several instances.
func (h *Handler) RunReminders(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		h.RemindOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// RemindOnce checks every onboarded user once.
func (h *Handler) RemindOnce(ctx context.Context) {
	users, err := h.Store.ReminderCandidates(ctx)
	if err != nil {
		if ctx.Err() == nil {
			h.Log.Error("reminders: load users", "err", err)
		}
		return
	}
	now := h.now()
	for _, u := range users {
		if ctx.Err() != nil {
			return
		}
		if err := h.remindUser(ctx, u, now); err != nil && ctx.Err() == nil {
			h.Log.Error("reminders", "user", u.ID, "err", err)
		}
	}
}

// due reports whether local is at or up to reminderWindow after the clock
// time at ("HH:MM") on the same day.
func due(local time.Time, at string) bool {
	t, err := time.Parse("15:04", at)
	if err != nil {
		return false
	}
	start := time.Date(local.Year(), local.Month(), local.Day(), t.Hour(), t.Minute(), 0, 0, local.Location())
	return !local.Before(start) && local.Sub(start) < reminderWindow
}

// weighInDue reports whether the weigh-in cadence asks for one on d.
func weighInDue(cadence string, d time.Time) bool {
	switch cadence {
	case "few_per_week":
		wd := d.Weekday()
		return wd == time.Monday || wd == time.Wednesday || wd == time.Friday
	case "weekly":
		return d.Weekday() == time.Monday
	case "monthly":
		return d.Day() == 1
	case "quarterly":
		return d.Day() == 1 && (d.Month()-1)%3 == 0
	}
	return false
}

// remind claims (kind, ref) for userID and sends msg if it wasn't sent before.
func (h *Handler) remind(ctx context.Context, userID, kind, ref string, msg push.Message) error {
	ok, err := h.Store.ClaimNotification(ctx, userID, kind, ref)
	if err != nil || !ok {
		return err
	}
	if msg.Kind == "" {
		msg.Kind = kind
	}
	h.Notifier.NotifyNow(ctx, []string{userID}, msg)
	return nil
}

func (h *Handler) remindUser(ctx context.Context, u store.ReminderUser, now time.Time) error {
	loc, err := time.LoadLocation(u.Timezone)
	if err != nil {
		loc = time.UTC
	}
	local := now.In(loc)
	today := store.DateOf(local)
	date := today.String()

	// Friends hear about this user's goal even if this user has no device.
	if local.Weekday() == time.Sunday && due(local, weeklyAt) {
		if err := h.weekly(ctx, u, today); err != nil {
			return err
		}
	}
	if !u.HasPush {
		return nil
	}

	if u.Prefs.MealNudges {
		if err := h.remindMeals(ctx, u.ID, local, today); err != nil {
			return err
		}
	}

	if u.Prefs.StreakRisk && due(local, streakRiskAt) {
		st, err := h.Store.Streak(ctx, u.ID, today)
		if err != nil {
			return err
		}
		if st.Current >= 2 && !st.ActiveToday {
			if err := h.remind(ctx, u.ID, "streak_risk", date, push.Message{
				Title: fmt.Sprintf("Your %d-day streak is on the line 🔥", st.Current),
				Body:  "One meal or one workout before midnight keeps it alive.",
				URL:   "/today", Tag: "streak-risk",
			}); err != nil {
				return err
			}
		}
	}

	if u.Prefs.WeighIn && due(local, weighInAt) && weighInDue(u.WeighInCadence, local) {
		done, err := h.Store.WeighedIn(ctx, u.ID, today)
		if err != nil {
			return err
		}
		if !done {
			if err := h.remind(ctx, u.ID, "weigh_in", date, push.Message{
				Title: "Weigh-in day ⚖️",
				Body:  "Step on the scale before breakfast for the steadiest trend.",
				URL:   "/weigh-in", Tag: "weigh-in",
			}); err != nil {
				return err
			}
		}
	}

	if u.Prefs.FriendGoals && due(local, friendDayAt) {
		if err := h.friendDay(ctx, u.ID, today); err != nil {
			return err
		}
	}

	if u.Prefs.WorkoutDay && due(local, workoutDayAt) {
		planned, done, err := h.Store.PlannedWorkout(ctx, u.ID, today)
		if err != nil {
			return err
		}
		if planned && !done {
			if err := h.remind(ctx, u.ID, "workout_day", date, push.Message{
				Title: "It's a gym day 💪",
				Body:  "Your plan's got a workout today. Let's get it.",
				URL:   "/gym", Tag: "workout-day",
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

// remindMeals nudges for each meal with a reminder time that's due and still
// empty today. Gym-day meals only count on gym days.
func (h *Handler) remindMeals(ctx context.Context, userID string, local time.Time, today store.Date) error {
	slots, err := h.Store.ListMealSlots(ctx, userID)
	if err != nil {
		return err
	}
	var gym *bool
	for _, sl := range slots {
		if sl.RemindAt == nil || !due(local, *sl.RemindAt) {
			continue
		}
		if sl.Schedule == "gym_days" {
			if gym == nil {
				g, err := h.Store.IsGymDay(ctx, userID, today)
				if err != nil {
					return err
				}
				gym = &g
			}
			if !*gym {
				continue
			}
		}
		logged, err := h.Store.SlotLogged(ctx, userID, sl.ID, today)
		if err != nil {
			return err
		}
		if logged {
			continue
		}
		if err := h.remind(ctx, userID, "meal", today.String()+":"+sl.ID, push.Message{
			Title: "Log your " + strings.ToLower(sl.Name) + "?",
			Body:  "Add it now while you remember.",
			URL:   "/today?add=food", Tag: "meal-" + sl.ID,
		}); err != nil {
			return err
		}
	}
	return nil
}

// weekly is Sunday evening: the user's own recap, and a push to friends when
// they hit their goal (if they share their week).
func (h *Handler) weekly(ctx context.Context, u store.ReminderUser, today store.Date) error {
	wk, err := h.Store.WeekSummary(ctx, u.ID, today, h.Store.Target(ctx, u.ID), false)
	if err != nil {
		return err
	}
	ref := wk.WeekStart.String()
	if u.HasPush && u.Prefs.WeeklyCheckin && wk.DaysLogged > 0 {
		title := fmt.Sprintf("Your week: %d/7 days on target", wk.DaysOnTarget)
		if wk.GoalHit {
			title = fmt.Sprintf("You hit your goal this week 🎉 %d/7 on target", wk.DaysOnTarget)
		}
		body := fmt.Sprintf("%d/7 on protein", wk.DaysProteinHit)
		if wk.Streak > 1 {
			body += fmt.Sprintf(" · 🔥 %d-day streak", wk.Streak)
		}
		if err := h.remind(ctx, u.ID, "weekly_recap", ref, push.Message{
			Title: title, Body: body, URL: "/friends", Tag: "weekly-recap",
		}); err != nil {
			return err
		}
	}
	if !wk.GoalHit {
		return nil
	}
	sh, err := h.Store.GetSharing(ctx, u.ID)
	if err != nil || !sh.WeeklySummary {
		return err
	}
	friends, err := h.Store.FriendsToNotifyOfGoals(ctx, u.ID)
	if err != nil {
		return err
	}
	msg := push.Message{
		Title: u.Name + " smashed their food goal this week 🎉",
		Body:  fmt.Sprintf("%d/7 days on target. Send them a cheer.", wk.DaysOnTarget),
		URL:   "/people/" + u.ID, Tag: "friend-goal-" + u.ID,
	}
	for _, f := range friends {
		if err := h.remind(ctx, f, "friend_goal", u.ID+":"+ref, msg); err != nil {
			return err
		}
	}
	return nil
}

// friendDay nudges once a day when friends who share their week are on
// target today and the user still has a fair bit to eat.
func (h *Handler) friendDay(ctx context.Context, userID string, today store.Date) error {
	// Checked once a day, whatever the answer, so the minute loop stays cheap.
	if ok, err := h.Store.ClaimNotification(ctx, userID, "friend_day_check", today.String()); err != nil || !ok {
		return err
	}
	day, err := h.day(ctx, userID, today)
	if err != nil {
		return err
	}
	left := day.Target.Kcal - day.Totals.Kcal
	if left < 250 {
		return nil
	}
	friends, err := h.Store.ListFriends(ctx, userID)
	if err != nil {
		return err
	}
	var hit []string
	for _, f := range friends {
		sh, err := h.Store.GetSharing(ctx, f.ID)
		if err != nil {
			return err
		}
		if !sh.WeeklySummary {
			continue
		}
		theirToday := h.today(ctx, f.ID)
		wk, err := h.Store.WeekSummary(ctx, f.ID, theirToday, h.Store.Target(ctx, f.ID), false)
		if err != nil {
			return err
		}
		for _, d := range wk.Days {
			if d.Date.String() == theirToday.String() && d.OnTarget {
				hit = append(hit, f.Name)
			}
		}
	}
	if len(hit) == 0 {
		return nil
	}
	who := hit[0]
	if len(hit) == 2 {
		who += " and " + hit[1]
	} else if len(hit) > 2 {
		who += fmt.Sprintf(" and %d others", len(hit)-1)
	}
	return h.remind(ctx, userID, "friend_day", today.String(), push.Message{
		Title: who + " smashed their target today 🎯",
		Body:  fmt.Sprintf("You've got %d kcal to go. Dinner's calling.", int(left)),
		URL:   "/today", Tag: "friend-day",
	})
}
