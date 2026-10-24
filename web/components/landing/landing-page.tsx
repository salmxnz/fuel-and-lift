import { InstallPopup } from "@/components/pwa/install-popup"
import { DuskCta, Footer, InstallBand } from "./closing"
import { Hero } from "./hero"
import { ProFriends } from "./pro-friends"
import { SmoothScroll } from "./smooth-scroll"
import { StandaloneRedirect } from "./standalone-redirect"
import { TryThisWeek } from "./try-this-week"
import { WeekStats } from "./week-stats"
import "./landing.css"

// The signed-out home page. It borrows its world from the emails: pink skies,
// scalloped clouds, food that floats, and the bitten "a" as the sun.
//
//   intro     the page grows out of a blurred pink sky
//   hero      headline word by word, phone rising out of the clouds
//   week      pinned: a week's numbers count up as the sun rises
//   start     hover accordion of the three first-week steps
//   pro       pinned: 8 friend slots fill, then the rosette pops
//   install   three taps, per platform
//   dusk      last call to action, with petals falling
//   footer    dots gather into the mark
export function LandingPage() {
  return (
    <>
      <StandaloneRedirect />
      <SmoothScroll />
      {/* Slides up once they've scrolled past the hero's own install button. */}
      <InstallPopup delayMs={12000} afterScrollPx={900} />

      <div aria-hidden="true" className="landing-backdrop" />
      <div className="landing-app text-ink">
        <main>
          <Hero />
          <WeekStats />
          <TryThisWeek />
          <ProFriends />
          <InstallBand />
          <DuskCta />
        </main>
        <Footer />
      </div>
    </>
  )
}
