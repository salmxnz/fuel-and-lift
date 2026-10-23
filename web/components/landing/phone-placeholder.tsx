// Placeholder phone mockups for the landing page. Each one sketches a screen in
// brand colours until real screenshots replace them (see `image` on a slide).
// Sizes are in container-query units so the same markup works at any width.

import Image from "next/image"
import { cn } from "@/lib/cn"

export type ScreenKind = "today" | "photo" | "gym" | "progress" | "friends" | "barcode"

export function PhonePlaceholder({
  screen,
  image,
  className,
}: {
  screen: ScreenKind
  image?: { src: string; alt: string }
  className?: string
}) {
  return (
    // The outer div is the size container; the frame inside measures against it.
    <div className={cn("w-full [container-type:inline-size]", className)} aria-hidden={image ? undefined : true}>
      <div className="relative aspect-[9/19.5] w-full rounded-[15cqw] bg-ink p-[2.4cqw] shadow-[0_24px_48px_-12px_rgba(46,26,36,0.35)]">
        <div className="relative h-full w-full overflow-hidden rounded-[12.6cqw] bg-ground">
          <span className="absolute left-1/2 top-[2.6cqw] z-10 h-[7.5cqw] w-[28cqw] -translate-x-1/2 rounded-full bg-ink" />
          {image ? (
            <Image src={image.src} alt={image.alt} fill sizes="(min-width: 768px) 280px, 70vw" className="object-cover object-top" />
          ) : (
            <div className="flex h-full flex-col gap-[3.5cqw] px-[5.5cqw] pt-[15cqw]">
              <StatusRow />
              {SCREENS[screen]}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Bar({ w, h = 2.6, className }: { w: string; h?: number; className?: string }) {
  return <span className={cn("block flex-none rounded-full bg-line", className)} style={{ width: w, height: `${h}cqw` }} />
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-[2.4cqw] rounded-[5cqw] bg-white p-[4cqw]", className)}>{children}</div>
}

function StatusRow() {
  return (
    <div className="flex items-center justify-between">
      <Bar w="30%" h={4.2} className="bg-ink/80" />
      <span className="h-[8cqw] w-[8cqw] rounded-full bg-pink" />
    </div>
  )
}

function Row({ dot = "bg-pink-soft" }: { dot?: string }) {
  return (
    <div className="flex items-center gap-[3cqw] rounded-[4.5cqw] bg-white p-[3cqw]">
      <span className={cn("h-[9cqw] w-[9cqw] flex-none rounded-[3cqw]", dot)} />
      <div className="flex flex-1 flex-col gap-[1.6cqw]">
        <Bar w="70%" className="bg-ink/70" />
        <Bar w="40%" />
      </div>
      <Bar w="14%" className="bg-ink/70" />
    </div>
  )
}

const SCREENS: Record<ScreenKind, React.ReactNode> = {
  today: (
    <>
      <Card className="items-center">
        <svg viewBox="0 0 100 100" className="w-[52%]">
          <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-line-soft" />
          <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" strokeLinecap="round" strokeDasharray="264" strokeDashoffset="84" transform="rotate(-90 50 50)" className="stroke-protein" />
          <text x="50" y="50" textAnchor="middle" className="fill-ink text-[19px] font-extrabold">
            1,240
          </text>
          <text x="50" y="64" textAnchor="middle" className="fill-muted text-[8px] font-bold">
            kcal left
          </text>
        </svg>
        <div className="grid w-full grid-cols-3 gap-[2.4cqw]">
          {["bg-protein", "bg-carbs", "bg-fat"].map((c) => (
            <div key={c} className="flex flex-col gap-[1.4cqw]">
              <Bar w="60%" h={2} />
              <span className="h-[2cqw] overflow-hidden rounded-full bg-line-soft">
                <span className={cn("block h-full w-2/3 rounded-full", c)} />
              </span>
            </div>
          ))}
        </div>
      </Card>
      <Row dot="bg-sand" />
      <Row dot="bg-lilac" />
      <Row dot="bg-pink-soft" />
    </>
  ),
  photo: (
    <>
      <div className="relative aspect-square overflow-hidden rounded-[5cqw] bg-[radial-gradient(circle_at_50%_55%,#fff_0_30%,var(--color-sand)_31%_100%)]">
        <span className="absolute left-[28%] top-[30%] h-[22%] w-[26%] rounded-full bg-carbs/80" />
        <span className="absolute left-[46%] top-[42%] h-[24%] w-[28%] rounded-full bg-fat" />
        <span className="absolute left-[34%] top-[54%] h-[16%] w-[20%] rounded-full bg-protein/70" />
        {["left-[6%] top-[6%] border-l-[1cqw] border-t-[1cqw]", "right-[6%] top-[6%] border-r-[1cqw] border-t-[1cqw]", "bottom-[6%] left-[6%] border-b-[1cqw] border-l-[1cqw]", "bottom-[6%] right-[6%] border-b-[1cqw] border-r-[1cqw]"].map((c) => (
          <span key={c} className={cn("absolute h-[10cqw] w-[10cqw] rounded-[2cqw] border-white", c)} />
        ))}
      </div>
      <Card>
        <div className="flex items-baseline justify-between">
          <Bar w="45%" h={3.4} className="bg-ink/80" />
          <span className="text-[6cqw] font-extrabold leading-none text-ink">640</span>
        </div>
        <div className="flex gap-[2cqw]">
          {["bg-protein/15", "bg-carbs/25", "bg-fat/30"].map((c) => (
            <span key={c} className={cn("h-[6.5cqw] flex-1 rounded-full", c)} />
          ))}
        </div>
      </Card>
      <span className="mt-auto mb-[8cqw] h-[12cqw] rounded-[4cqw] bg-ink" />
    </>
  ),
  gym: (
    <>
      <Bar w="55%" h={5} className="bg-ink/80" />
      {[0, 1].map((k) => (
        <Card key={k}>
          <div className="flex items-center gap-[3cqw]">
            <span className="h-[9cqw] w-[9cqw] rounded-[3cqw] bg-lilac" />
            <Bar w="50%" className="bg-ink/70" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-[3cqw]">
              <Bar w="12%" />
              <span className="h-[7cqw] flex-1 rounded-[2.4cqw] bg-field" />
              <span className="h-[7cqw] flex-1 rounded-[2.4cqw] bg-field" />
              <span className={cn("h-[7cqw] w-[7cqw] flex-none rounded-full", k === 0 || i === 0 ? "bg-ink" : "border-[0.6cqw] border-line")} />
            </div>
          ))}
        </Card>
      ))}
      <div className="mt-auto mb-[8cqw] flex items-center justify-between rounded-[4cqw] bg-ink px-[4cqw] py-[3cqw]">
        <span className="text-[5cqw] font-extrabold leading-none text-white">1:24</span>
        <Bar w="30%" className="bg-white/40" />
      </div>
    </>
  ),
  progress: (
    <>
      <Card>
        <div className="flex items-baseline gap-[2cqw]">
          <span className="text-[8cqw] font-extrabold leading-none text-ink">72.4</span>
          <Bar w="18%" />
        </div>
        <svg viewBox="0 0 100 56" className="w-full" preserveAspectRatio="none">
          <path d="M0 40 H100" strokeDasharray="3 3" strokeWidth="0.8" className="stroke-dash" fill="none" />
          <path d="M0 14 L12 18 L24 16 L36 24 L48 22 L60 30 L72 33 L84 38 L100 41" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" className="stroke-protein" />
          <path d="M0 14 L12 18 L24 16 L36 24 L48 22 L60 30 L72 33 L84 38 L100 41 V56 H0Z" className="fill-pink/40" />
        </svg>
      </Card>
      <div className="grid grid-cols-2 gap-[3cqw]">
        {["bg-mint", "bg-lilac"].map((c) => (
          <div key={c} className={cn("flex flex-col gap-[2cqw] rounded-[4.5cqw] p-[4cqw]", c)}>
            <Bar w="50%" h={2} />
            <Bar w="70%" h={4.4} className="bg-ink/75" />
          </div>
        ))}
      </div>
      <Row dot="bg-sand" />
    </>
  ),
  friends: (
    <>
      <Bar w="40%" h={5} className="bg-ink/80" />
      {["bg-pink", "bg-lilac", "bg-sand", "bg-mint"].map((c, i) => (
        <div key={c} className="flex items-center gap-[3cqw] rounded-[4.5cqw] bg-white p-[3cqw]">
          <span className={cn("h-[11cqw] w-[11cqw] flex-none rounded-full", c)} />
          <div className="flex flex-1 flex-col gap-[1.6cqw]">
            <Bar w="55%" className="bg-ink/70" />
            <Bar w={`${70 - i * 12}%`} />
          </div>
          <span className={cn("rounded-full px-[2.6cqw] py-[1.4cqw] text-[3.6cqw] font-extrabold leading-none", i === 0 ? "bg-ink text-white" : "bg-chip text-ink")}>
            {i === 0 ? "Cheered" : "Cheer"}
          </span>
        </div>
      ))}
    </>
  ),
  barcode: (
    <>
      <div className="relative flex aspect-[4/3.4] items-center justify-center overflow-hidden rounded-[5cqw] bg-night">
        <div className="flex h-[34%] w-[62%] items-stretch gap-[1.2cqw] bg-white p-[2.4cqw]">
          {[2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2].map((w, i) => (
            <span key={i} className="bg-ink" style={{ width: `${w * 0.6}cqw` }} />
          ))}
        </div>
        <span className="absolute inset-x-[14%] top-1/2 h-[0.8cqw] rounded-full bg-pink shadow-[0_0_4cqw_var(--color-pink)]" />
      </div>
      <Card>
        <Bar w="65%" h={3.4} className="bg-ink/80" />
        <Bar w="40%" />
        <div className="flex gap-[2cqw] pt-[1cqw]">
          <span className="h-[10cqw] flex-1 rounded-[3cqw] bg-field" />
          <span className="h-[10cqw] flex-1 rounded-[3cqw] bg-ink" />
        </div>
      </Card>
    </>
  ),
}
