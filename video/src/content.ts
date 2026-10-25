// Every word on screen, in one place. Copy rules (docs/brand/BRAND.md): always
// lowercase "adebite"; short, friendly, plain. Notification lines are the real push
// copy from api/internal/handlers (gym.go, streaks.go, social.go, reminders.go).

/** A headline is a list of words; `tone` picks the ink. */
export type Tone = "ink" | "dim" | "rose";
export type Word = { text: string; tone?: Tone };
const w = (line: string, tone: Tone = "ink"): Word[] =>
  line.split(" ").map((text) => ({ text, tone }));

export const copy = {
  hook: {
    // The number is drawn separately: it counts up as each app lands.
    before: w("Why do you have"),
    after: w("fitness apps?"),
  },
  merge: [...w("What if they were"), { text: "one?", tone: "rose" as Tone }],
  calories: [...w("Calories,"), ...w("from one photo.", "dim")],
  lifts: [...w("Lifts,"), ...w("logged set by set.", "dim")],
  friends: [...w("Friends,"), ...w("cheering every rep.", "dim")],
  pro: [
    w("Refer 8 friends."),
    w("Get Pro free."),
    [...w("First 50 get Pro"), { text: "forever.", tone: "rose" as Tone }],
  ],
  close: {
    tagline: [...w("Eat. Lift."), { text: "Together.", tone: "rose" as Tone }],
    url: "adebite.com",
  },

  today: {
    title: "Today",
    date: "Sat 25 Oct",
    target: 2150,
    eaten: 1510,
    meal: { name: "Breakfast", item: "Eggs on toast", kcal: 420 },
    lunch: { name: "Lunch", item: "Chicken rice bowl", kcal: 640 },
    estimate: "Photo estimate",
    macros: [
      { label: "Protein", value: 96, target: 140, color: "rose" },
      { label: "Carbs", value: 168, target: 230, color: "carbs" },
      { label: "Fat", value: 48, target: 70, color: "fat" },
    ] as const,
  },

  workout: {
    title: "Push day",
    sub: "Week 3 · Day 1",
    exercise: "Bench press",
    sets: [
      { kg: 60, reps: 8 },
      { kg: 65, reps: 8 },
      { kg: 67.5, reps: 6 },
      { kg: 70, reps: 6 },
    ],
    pr: "New record",
    next: "Incline dumbbell press",
  },

  notifications: [
    { app: "adebite", title: "Jonah worked out today 💪", body: "Push day · 5 exercises", who: "peach" },
    { app: "adebite", title: "Amara is on a 12-day streak 🔥", body: "Send them a cheer.", who: "strawberry" },
    { app: "adebite", title: "Jonah cheered you on 🙌", body: "New record: Bench press 70 kg × 6", who: "peach" },
    { app: "adebite", title: "Amara hit their food goal this week 🎉", body: "6/7 days on target. Send them a cheer.", who: "strawberry" },
    { app: "adebite", title: "Your week: 6/7 days on target", body: "6/7 on protein · 🔥 12-day streak", who: "me" },
  ] as const,

  referral: { label: "friends joined", of: 8, pro: "Pro, for good" },
} as const;
