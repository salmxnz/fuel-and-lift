# adebite video

Remotion project for adebite promo videos. The structure follows the DopplerAI video
project: a written brand spec, per-video briefs, `public/` assets and one theme file.

## Layout

```
video/
├── BRAND.md            # the brand spec the theme is built from (colour, type, logo, motion)
├── content/            # per-video briefs: angle, copy, storyboard
├── scripts/
│   ├── beats.sh        # ffmpeg onset scan of a song → tempo, hits, loudness per second
│   └── stills.sh       # half-size draft render + contact sheet of every scene (check/)
├── public/             # everything a scene can load with staticFile()
│   ├── logo/           # lockups, symbol, wordmark, app icon (copied from docs/brand/logo)
│   ├── music/          # song.mp3, the soundtrack
│   ├── assets/
│   │   ├── fonts/      # Schibsted Grotesk, the same woff2 files the PWA ships
│   │   ├── illustrations/  # email heroes and icon tiles (web/public/email)
│   │   ├── food/       # pixel food icons (web/public/food)
│   │   └── apps/       # competitor app icons for the hook (App Store artwork)
│   ├── backgrounds/
│   └── look/           # reference frames and the email sheet (not rendered)
└── src/
    ├── theme.ts        # single source of truth: colours, type, easing, springs, assets
    ├── timeline.ts     # beat times in seconds on the song
    ├── content.ts      # every word on screen
    ├── layout.ts       # useLayout(): 16:9 vs 9:16
    ├── clock.tsx       # <Scene> + useClock(): scenes timed in global seconds
    ├── Root.tsx        # composition registry
    ├── components/     # backdrop, headline reveal, phone, Today screen, workout card…
    └── scenes/         # Promo.tsx + one file per scene in scenes/promo/
```

## Commands

```bash
npm install
npm run studio           # Remotion Studio preview
npm run still:theme      # theme check card → check/theme-check.png
npm run stills           # draft renders + contact sheets → check/sheet-*.png
npm run render           # 1920×1080 → out/adebite-promo.mp4
npm run render:vertical  # 1080×1920 → out/adebite-promo-vertical.mp4
npm run beats            # re-scan the song if it changes
```

## Videos

| Composition | Size | Brief |
|---|---|---|
| `AdebitePromo` (24.5s) | 1920×1080 | `content/promo.md` |
| `AdebitePromoVertical` (24.5s) | 1080×1920 | same scenes, stacked layout |

Both compositions render the same scenes. Each scene reads `useLayout()` and lays itself
out in a row for 16:9 or stacked for 9:16, keeping the bottom 300px clear for platform UI.

If you change the song, run `npm run beats`, move the times in `src/timeline.ts`, and
update `T.total`.
