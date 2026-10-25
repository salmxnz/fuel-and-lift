# adebite: brand and look for video

This is the video side of `docs/brand/BRAND.md`, and that file wins if the two disagree.
Every value here is mirrored in `src/theme.ts`. Scenes read the theme, never this file.

## Identity

- **What adebite is:** a private calorie and gym tracker for you and a few friends.
- **The video angle:** one app instead of five, and your friends are in it with you.
  You track the journey together and cheer each other on.
- **Lines used:** "Eat. Lift. Together." · the landing hero "Eat. Lift. Add it up." ·
  the footer "Eat, lift, and see it add up."
- **Website:** https://adebite.com
- **Name:** always lowercase "adebite", even at the start of a sentence.

## Logo

| File (in `public/logo/`) | Use |
|---|---|
| `adebite-lockup-color.svg` | Default, on white or blush |
| `adebite-icon.svg` | App tile (white symbol on a pink rounded tile) |
| `adebite-wordmark-plum.svg` | Wordmark alone, under the app tile |
| `adebite-lockup-white.svg` | On plum or photos |

- The wordmark is drawn. Never retype it in a font, and always render the SVG.
- Never put the pink symbol on pink. On the close it sits on a white sun, not a pink one.

## Colour

| Token (`theme.colors`) | Hex | Notes |
|---|---|---|
| `ground` | `#FBEFF3` | Blush page |
| `sky` | `#FFF → #FDEEF3 → #F9D3DF → #F6C1D2` | Landing hero sky, full-frame backdrop |
| `pink` / `pinkSoft` | `#F6B8CA` / `#FBDCE6` | Brand |
| `rose` | `#A82F61` | Hero accent: one word per headline, the PR pill |
| `ink` / `muted` / `dim` | `#2E1A24` / `#765A67` / `#C9A9B6` | Text, from strongest to unlit |
| `carbs` / `fat` | `#EE8FB0` / `#F2B48C` | Macro bars, illustrations |
| `night` / `night2` | `#2E1A24` / `#452A37` | Only the Pro referral card |

## Typography

- Schibsted Grotesk (variable, 400–900), loaded from `public/assets/fonts/` with `@remotion/fonts`.
- Headlines use the landing-page style: weight 900, tracking −0.05em, leading 0.92.
  The first word is ink and the rest dim, and one word can be rose.

## Look and motion

- References in `public/look/`:
  - `ref-hook-five-apps.png`: glowing icons under a one-number question
  - `ref-merge-one.png`: icons blur into one
  - `ref-lyrics-list.png`: one bright line in a dim list
  - `ref-stacked-lines.png`: lines that light up in turn
  - `email_adebite.png`: the brand's illustrations
- Background stack: pink sky → sparkles + drifting clouds → scalloped cloud bank →
  content → pink soft-light grade → grain → rose vignette.
- Motion: words rise from an 8px blur, staggered 0.06s (the landing `reveal.tsx`).
  Entrances use springs. Exits push forward, blur and fade in ~0.22s.
- Easing: `cubic-bezier(0.23,1,0.32,1)` out and `(0.77,0,0.175,1)` in-out (globals.css).

## Sound

- `public/music/song.mp3` (24.53s) is the whole soundtrack. There's no VO.
- Cuts sit on the hits found by `npm run beats`: the intro kicks, the drop at 3.14s, and
  the kicks returning at 17.28s and 21.27s.
