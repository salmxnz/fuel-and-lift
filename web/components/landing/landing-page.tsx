import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { cn } from "@/lib/cn"
import { InstallCta } from "./install-cta"
import { InstallGuide } from "./install-guide"
import { PhonePlaceholder } from "./phone-placeholder"
import { MarqueeRow, ScreenshotCarousel, type Slide } from "./screenshot-carousel"
import { StandaloneRedirect } from "./standalone-redirect"

// Placeholders for now: add `image: { src: "/landing/…png", alt: "…" }` to a
// slide to swap the sketch for a real screenshot.
const FEATURES: Slide[] = [
  { title: "Snap your plate, get the calories", tone: "pink", screen: "photo" },
  { title: "Your whole day on one screen", tone: "lilac", screen: "today" },
  { title: "A gym plan that moves up when you do", tone: "sand", screen: "gym" },
  { title: "Watch the trend, not the scale", tone: "mint", screen: "progress" },
  { title: "Train alongside a few friends", tone: "night", screen: "friends" },
  { title: "Scan a barcode and you're done", tone: "lilac", screen: "barcode" },
]

const MORE: Slide[] = [
  { title: "Cheer each other on", tone: "sand", screen: "friends" },
  { title: "Rest timer built in", tone: "pink", screen: "gym" },
  { title: "Macros without the maths", tone: "night", screen: "today" },
  { title: "Packaged food in a second", tone: "mint", screen: "barcode" },
  { title: "Check the estimate, tweak it", tone: "lilac", screen: "photo" },
  { title: "Progress you can see", tone: "sand", screen: "progress" },
]

const FACTS = [
  { title: "No App Store", body: "Installs from your browser" },
  { title: "Its own icon", body: "Opens full screen, like any app" },
  { title: "Reminders", body: "Meal and gym nudges, iPhone too" },
  { title: "Free to start", body: "10 photo estimates a month" },
]

const CONTENT = "mx-auto w-full max-w-[1080px] px-5"
const DISPLAY = "m-0 font-black tracking-[-0.05em] leading-[0.88]"

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-ground text-ink">
      <StandaloneRedirect />

      <header className={cn(CONTENT, "flex items-center justify-between gap-4")} style={{ paddingTop: "calc(var(--safe-top) + 14px)" }}>
        <Link href="/" aria-label="adebite home" className="flex h-11 items-center">
          <Logo height={24} />
        </Link>
        <nav className="flex items-center gap-6 text-[15px] font-bold">
          <a href="#install" className="hidden h-11 items-center no-underline hover:underline sm:flex">
            How to install
          </a>
          <Link href="/login" className="flex h-11 items-center no-underline hover:underline">
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero: the type does the work. */}
        <section className="overflow-hidden border-b border-ink/15">
          <div className={cn(CONTENT, "pt-12 sm:pt-20")}>
            <h1 className={cn("rise text-[clamp(64px,18vw,168px)]", DISPLAY)}>
              Eat.
              <br />
              Lift.
              <br />
              Add it up.
            </h1>

            <div className="mt-10 grid gap-12 lg:mt-14 lg:grid-cols-[minmax(0,440px)_1fr] lg:gap-10">
              <div className="rise flex flex-col gap-7 lg:pb-24" style={{ "--i": 2 } as React.CSSProperties}>
                <p className="m-0 max-w-[36ch] text-[18px] leading-[1.5] text-ink-soft sm:text-[20px]">
                  Calories from a photo of your plate, a gym plan that moves up when you do, and a few friends to keep you going. It lives on your Home Screen, no App
                  Store needed.
                </p>
                <InstallCta />
              </div>

              {/* One phone, straight on, running off the bottom edge. */}
              <div className="rise relative mx-auto h-[420px] w-full max-w-[300px] sm:h-[480px] lg:mr-0 lg:h-[560px]" style={{ "--i": 3 } as React.CSSProperties}>
                <PhonePlaceholder screen="today" className="absolute inset-x-0 top-0" />
              </div>
            </div>
          </div>
        </section>

        {/* Facts, as a ruled strip rather than cards. */}
        <section aria-label="Why a web app" className="border-b border-ink/15">
          <ul className={cn(CONTENT, "my-0 grid list-none grid-cols-2 py-0 md:grid-cols-4")}>
            {FACTS.map((f, i) => (
              <li
                key={f.title}
                className={cn(
                  "flex flex-col gap-1 py-6 pr-4",
                  i % 2 === 1 && "border-l border-ink/15 pl-4",
                  i >= 2 && "border-t border-ink/15 md:border-t-0",
                  i === 2 && "md:border-l md:pl-4"
                )}
              >
                <span className="text-[16px] font-extrabold tracking-[-0.01em]">{f.title}</span>
                <span className="text-[14px] leading-[1.4] text-muted">{f.body}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="py-20 sm:py-28">
          <ScreenshotCarousel label="App screens" slides={FEATURES} heading={<h2 className={cn("text-[48px] sm:text-[80px]", DISPLAY)}>Inside the app</h2>} />
        </div>

        {/* The part that matters most: getting it onto the Home Screen. */}
        <section id="install" className="on-dark scroll-mt-4 bg-ink py-20 text-white sm:py-28">
          <div className={cn(CONTENT, "flex flex-col gap-12")}>
            <div className="flex flex-col gap-5">
              <h2 className={cn("max-w-[12ch] text-[44px] sm:max-w-[15ch] sm:text-[80px]", DISPLAY)}>Three taps to your Home Screen</h2>
              <p className="m-0 max-w-[44ch] text-[18px] leading-[1.5] text-night-soft">
                adebite is a web app, so there&apos;s nothing to download. Add it once and it opens full screen, with its own icon and notifications.
              </p>
            </div>
            <InstallGuide />
            <div className="max-w-[360px]">
              <InstallCta tone="dark" showNote={false} />
            </div>
          </div>
        </section>

        <div className="py-20 sm:py-24">
          <MarqueeRow label="More app screens" slides={MORE} reverse />
        </div>

        <section className={cn(CONTENT, "flex flex-col gap-8 border-t border-ink/15 pt-16 pb-20 sm:pt-24")}>
          <h2 className={cn("text-[56px] sm:text-[112px]", DISPLAY)}>Free to start.</h2>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_1fr] lg:gap-10">
            <p className="m-0 max-w-[36ch] text-[18px] leading-[1.5] text-ink-soft">
              The free plan comes with 10 photo estimates a month. Add it to your Home Screen, sign in with Google, and log your first meal.
            </p>
            <InstallCta showNote={false} />
          </div>
        </section>
      </main>

      <footer className={cn(CONTENT, "flex flex-col gap-6")} style={{ paddingBottom: "calc(var(--safe-bottom) + 28px)" }}>
        <Logo height={120} className="h-auto w-full max-w-[1040px]" />
        <div className="flex items-center justify-between gap-4 border-t border-ink/15 pt-5 text-[14px] text-muted">
          <span>© 2026 adebite</span>
          <Link href="/login" className="font-bold text-ink no-underline hover:underline">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  )
}
