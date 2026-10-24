// Renders each template with Go text/template tokens as its props and writes
// <name>.html + <name>.txt into the API, where they are embedded into the
// binary (see api/internal/email/email.go). Run: npm run build
//
// `npm run preview` instead renders each template's PreviewProps, with images
// from web/public, into out/<name>.html for a quick look in a browser.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ReactElement } from "react";
import { plainTextSelectors, render } from "react-email";
import FriendJoined from "../emails/friend-joined";
import PhotoLimit from "../emails/photo-limit";
import ProUnlocked from "../emails/pro-unlocked";
import WeeklyRecap from "../emails/weekly-recap";
import Welcome from "../emails/welcome";

const here = dirname(fileURLToPath(import.meta.url));
const base = { appUrl: "{{.AppURL}}", assetsUrl: "{{.AssetsURL}}" };

const templates: Record<string, { go: ReactElement; preview: ReactElement }> = {
  welcome: {
    go: (
      <Welcome
        {...base}
        firstName="{{.FirstName}}"
        calories="{{.Calories}}"
        protein="{{.Protein}}"
        carbs="{{.Carbs}}"
        fat="{{.Fat}}"
        referralsForPro="{{.ReferralsForPro}}"
      />
    ),
    preview: <Welcome {...Welcome.PreviewProps} />,
  },
  "friend-joined": {
    go: (
      <FriendJoined
        {...base}
        firstName="{{.FirstName}}"
        friendName="{{.FriendName}}"
        referrals="{{.Referrals}}"
        needed="{{.Needed}}"
        remaining="{{.Remaining}}"
      />
    ),
    preview: <FriendJoined {...FriendJoined.PreviewProps} />,
  },
  "pro-unlocked": {
    go: <ProUnlocked {...base} firstName="{{.FirstName}}" needed="{{.Needed}}" />,
    preview: <ProUnlocked {...ProUnlocked.PreviewProps} />,
  },
  "photo-limit": {
    go: (
      <PhotoLimit
        {...base}
        firstName="{{.FirstName}}"
        limit="{{.Limit}}"
        month="{{.Month}}"
        resetsOn="{{.ResetsOn}}"
        referrals="{{.Referrals}}"
        needed="{{.Needed}}"
      />
    ),
    preview: <PhotoLimit {...PhotoLimit.PreviewProps} />,
  },
  "weekly-recap": {
    go: (
      <WeeklyRecap
        {...base}
        firstName="{{.FirstName}}"
        weekRange="{{.WeekRange}}"
        daysLogged="{{.DaysLogged}}"
        avgCalories="{{.AvgCalories}}"
        targetCalories="{{.TargetCalories}}"
        workouts="{{.Workouts}}"
        weightChange="{{.WeightChange}}"
      />
    ),
    preview: <WeeklyRecap {...WeeklyRecap.PreviewProps} />,
  },
};

if (process.argv.includes("--preview")) {
  const outDir = join(here, "../out");
  const assets = pathToFileURL(join(here, "../../web/public")).href;
  mkdirSync(outDir, { recursive: true });
  for (const [name, { preview }] of Object.entries(templates)) {
    const html = (await render(preview, { pretty: true })).replaceAll('src="/static/', `src="${assets}/`);
    writeFileSync(join(outDir, `${name}.html`), html);
    console.log(`wrote out/${name}.html`);
  }
} else {
  const outDir = join(here, "../../api/internal/email/templates");
  mkdirSync(outDir, { recursive: true });
  for (const [name, { go }] of Object.entries(templates)) {
    const html = await render(go, { pretty: true });
    // html-to-text uppercases headings by default, which would turn
    // {{.FirstName}} into a Go token that doesn't exist.
    const text = (
      await render(go, {
        plainText: true,
        htmlToTextOptions: {
          selectors: [...plainTextSelectors, { selector: "h1", options: { uppercase: false } }],
        },
      })
    )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    writeFileSync(join(outDir, `${name}.html`), html + "\n");
    writeFileSync(join(outDir, `${name}.txt`), text + "\n");
    console.log(`wrote ${name}.html / .txt`);
  }
}
