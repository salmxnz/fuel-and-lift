// theme.ts — single source of truth for the adebite look.
// Never inline a colour, font, easing or timing in a scene: add it here first.
// Values come from web/app/globals.css and docs/brand/BRAND.md: a blush page under
// a pink sky, white cards, plum ink, pink as the brand and rose for one accent.
import { Easing, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";

const FAMILY = "Schibsted Grotesk";

// The same variable woff2 files the PWA ships (web/app/fonts), weights 400–900.
export const fontsReady = Promise.all([
  loadFont({
    family: FAMILY,
    url: staticFile("assets/fonts/schibsted-grotesk-latin-wght-normal.woff2"),
    weight: "400 900",
    format: "woff2",
  }),
  loadFont({
    family: FAMILY,
    url: staticFile("assets/fonts/schibsted-grotesk-latin-ext-wght-normal.woff2"),
    weight: "400 900",
    format: "woff2",
    unicodeRange: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
  }),
]);

export const FPS = 30;

export const theme = {
  colors: {
    // light screens
    ground: "#FBEFF3",
    surface: "#FFFFFF",
    sheet: "#FFF8FA",
    field: "#FDF3F6",
    chip: "#F8E2EA",
    ink: "#2E1A24",
    inkSoft: "#4A3340",
    muted: "#765A67",
    dim: "#C9A9B6", // the "dash" token: words not lit yet
    line: "#ECD3DD",
    lineSoft: "#F7E8EE",

    // brand
    pink: "#F6B8CA",
    pinkSoft: "#FBDCE6",
    pinkDeep: "#EC9DB5",
    sunArc: "#F09CB8",
    rose: "#A82F61", // hero accent: max one element per frame
    berry: "#C83E78",
    carbs: "#EE8FB0",
    fat: "#F2B48C",
    cloudBack: "#F6C9D8",
    cloudShadow: "#F5C3D4",
    cloudFace: "#FCE4EC",

    // dark (the Pro coin card only)
    night: "#2E1A24",
    night2: "#452A37",
    night3: "#553646",
    nightLine: "#674454",
    nightMuted: "#CDB3BF",

    sky: "linear-gradient(180deg, #FFFFFF 0%, #FDEEF3 34%, #F9D3DF 78%, #F6C1D2 100%)",
    glow: "rgba(236,157,181,0.55)",
  },

  type: {
    family: `"${FAMILY}", system-ui, sans-serif`,
    // Landing-page headline: black weight, very tight.
    display: { weight: 900, tracking: "-0.05em", leading: 0.92 },
    title: { weight: 800, tracking: "-0.03em", leading: 1.05 },
    body: { weight: 500, tracking: "-0.01em", leading: 1.3 },
  },

  assets: {
    lockup: "logo/adebite-lockup-color.svg", // 806×256, pink symbol + plum wordmark
    lockupWhite: "logo/adebite-lockup-white.svg",
    icon: "logo/adebite-icon.svg", // white symbol on a pink rounded tile
    wordmark: "logo/adebite-wordmark-plum.svg", // 854×210
    song: "music/song.mp3",
    apps: [
      "assets/apps/myfitnesspal.jpg",
      "assets/apps/hevy.jpg",
      "assets/apps/strava.jpg",
      "assets/apps/happyscale.jpg",
      "assets/apps/whatsapp.jpg",
    ],
    // each app's own glow colour, sampled from its icon
    appGlows: ["#1E6BFF", "#222222", "#FC5200", "#36C5F7", "#25D366"],
  },

  radius: { card: 18, tile: 14, button: 16, sheet: 26, phone: 64, pill: 9999 },

  shadow: {
    card: "0 18px 40px -18px rgba(168,47,97,0.28), 0 2px 6px rgba(46,26,36,0.05)",
    phone: "0 60px 120px -40px rgba(168,47,97,0.45), 0 20px 40px -20px rgba(46,26,36,0.25)",
    soft: "0 10px 24px -10px rgba(168,47,97,0.30)",
  },

  ease: {
    out: Easing.bezier(0.23, 1, 0.32, 1), // globals.css --ease-out
    inOut: Easing.bezier(0.77, 0, 0.175, 1), // globals.css --ease-in-out
    in: Easing.bezier(0.55, 0, 0.75, 0.2), // exits only
  },

  spring: {
    snappy: { damping: 16, stiffness: 170, mass: 0.6 },
    smooth: { damping: 22, stiffness: 90, mass: 1 },
    bouncy: { damping: 11, stiffness: 160, mass: 0.7 },
  },
} as const;
