// Beats on the song timeline, in seconds (public/music/song.mp3, 24.53s).
// Hit times come from `npm run beats`. The intro has kicks at 0.33 / 0.73 / 1.35 /
// 1.95, the drop lands at 3.14, the groove settles at ~6.07, and kicks return at
// 17.28 and 21.27. Scenes overlap by a few frames so exits and entrances cross.
export const T = {
  total: 24.53,
  hook: { start: 0, end: 3.2, headline: 0.09, icons: [0.33, 0.73, 1.35, 1.95, 2.5] },
  merge: {
    start: 3.14,
    end: 6.15,
    drop: 3.14,
    headline: 3.22,
    pull: 3.36, // icons blur and start orbiting in
    gone: 4.4,
    tile: 4.44, // adebite app tile springs out
    lockup: 5.13,
  },
  calories: {
    start: 6.07,
    end: 9.56,
    headline: 6.1,
    phone: 6.07,
    snap: 6.36, // polaroid lands, flash
    estimate: 6.97,
    meal: 7.28,
    fill: 7.43, // arc + number count
    fillEnd: 8.6,
    macros: 7.6,
  },
  lifts: {
    start: 9.48,
    end: 13.35,
    headline: 9.52,
    card: 9.48,
    sets: [10.15, 10.93, 11.43, 11.88],
    pr: 12.07,
  },
  friends: {
    start: 13.27,
    end: 17.36,
    headline: 13.3,
    list: 13.27,
    lines: [13.78, 14.5, 15.12, 15.72, 16.26],
  },
  pro: {
    start: 17.28,
    end: 21.35,
    lines: [17.3, 19.11, 20.18],
    coins: 17.6,
    coinStep: 0.19,
    rosette: 19.11,
  },
  close: {
    start: 21.27,
    end: 24.53,
    sun: 21.27,
    lockup: 21.4,
    tagline: 22.2,
    url: 22.9,
  },
} as const;
