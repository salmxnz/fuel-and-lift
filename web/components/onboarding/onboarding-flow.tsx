"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Button, Spinner } from "@/components/ui/primitives"
import { BackButton } from "@/components/ui/back-button"
import { CheckIcon } from "@/components/ui/icons"
import { IOSInstallSteps } from "@/components/settings/notifications-screen"
import { ApiError, api, errorMessage } from "@/lib/api/client"
import type { ActivityLevel, Mode, OnboardingRequest, Pace, PlanPreviewRequest, Sex, Split, SplitsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { assignDays, dayRange } from "@/lib/splits"
import { cn } from "@/lib/cn"
import { formatMonthYear, localTimeZone, todayISO, WEEKDAY_KEYS, type WeekdayKey } from "@/lib/dates"
import { CM_PER_IN, kcal, kgToLb, lbToKg, num1, parseDecimal, round1 } from "@/lib/format"
import { enablePush, isStandalone, needsIOSInstall, pushSupport } from "@/lib/push"
import { PAGE_SLIDE, pageVariants } from "@/lib/motion"
import { PacePicker, usePlanPreview } from "./pace-picker"
import { useInstallPrompt } from "@/lib/install"
import { Logo } from "@/components/brand/logo"

const STORE_KEY = "fl:onboarding:v1"

type Answers = {
  step: string
  name: string
  sex: Sex | null
  dob: string
  heightCm: number | null
  heightUnit: "cm" | "ftin"
  weightKg: number | null
  weightUnit: "kg" | "lb"
  activity: ActivityLevel | null
  mode: Mode | null
  goalKg: number | null
  pace: Pace
  /** The preset split picked (null = none). */
  split: Split | null
  /** They chose "My own" instead of a split. */
  ownWorkouts: boolean
  gymDays: WeekdayKey[]
}

const EMPTY: Answers = {
  step: "name",
  name: "",
  sex: null,
  dob: "",
  heightCm: null,
  heightUnit: "cm",
  weightKg: null,
  weightUnit: "kg",
  activity: null,
  mode: null,
  goalKg: null,
  pace: "standard",
  split: null,
  ownWorkouts: false,
  gymDays: [],
}

const ACTIVITY: { level: ActivityLevel; title: string; sub: string }[] = [
  { level: 1, title: "Sedentary", sub: "Desk job, little walking, no training" },
  { level: 2, title: "Lightly active", sub: "Some walking, or training 1 to 2 days a week" },
  { level: 3, title: "Somewhat active", sub: "On your feet part of the day, or training 2 to 3 days" },
  { level: 4, title: "Moderately active", sub: "Training 3 to 5 days a week" },
  { level: 5, title: "Very active", sub: "Hard training 6 to 7 days, or a physical job" },
  { level: 6, title: "Extremely active", sub: "A physical job plus hard training" },
]

const DAY_LABEL: Record<WeekdayKey, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" }

function load(defaultName: string): Answers {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Answers>) }
  } catch {
    /* ignore */
  }
  return { ...EMPTY, name: defaultName }
}

function stepsFor(a: Answers): string[] {
  const s = ["name", "sex", "dob", "height", "weight", "activity", "mode"]
  if (a.mode && a.mode !== "maintain") s.push("goal", "pace")
  s.push("summary", "split", "gym", "install", "done")
  return s
}

function ageFrom(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const [y, m, d] = dob.split("-").map(Number)
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--
  return age
}

const subscribeNoop = () => () => {}

export function OnboardingFlow({ defaultName }: { defaultName: string }) {
  const router = useRouter()
  // sessionStorage only exists in the browser; read it once after hydration.
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false)
  const [answers, setAnswers] = useState<Answers | null>(null)
  const a = answers ?? (hydrated ? load(defaultName) : null)

  useEffect(() => {
    if (!answers) return
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(answers))
    } catch {
      /* private mode */
    }
  }, [answers])

  if (!a) {
    return (
      <main className="app-column flex min-h-dvh items-center justify-center" role="status">
        <Spinner size={28} />
        <span className="sr-only">Loading…</span>
      </main>
    )
  }

  return <Flow a={a} set={(patch) => setAnswers({ ...a, ...patch })} onFinished={() => router.replace("/today")} />
}

function Flow({ a, set, onFinished }: { a: Answers; set: (p: Partial<Answers>) => void; onFinished: () => void }) {
  const steps = stepsFor(a)
  const index = Math.max(0, steps.indexOf(a.step))
  const step = steps[index] ?? "name"
  const go = (delta: number) => set({ step: steps[Math.min(steps.length - 1, Math.max(0, index + delta))] })
  const next = () => go(1)
  const reduce = useReducedMotion()

  // Which way the last step change went, so the new step slides in from the
  // right going forward and from the left going back.
  const [prevIndex, setPrevIndex] = useState(index)
  const [dir, setDir] = useState(1)
  if (prevIndex !== index) {
    setDir(index > prevIndex ? 1 : -1)
    setPrevIndex(index)
  }

  return (
    <main
      className="app-column flex min-h-dvh flex-col gap-5"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 28px)", paddingLeft: "max(20px, var(--safe-left))", paddingRight: "max(20px, var(--safe-right))" }}
    >
      {/* The back slot always takes up the same space, so the progress bar
          never shifts between steps. -ml-4 lines the chevron's tip up with the
          title below while the hit area stays 44px. */}
      <div className="flex items-center gap-1">
        <BackButton onClick={() => go(-1)} disabled={index === 0 || step === "done"} />
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
          className="grid flex-1 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
          {steps.map((s, i) => (
            <span key={s} className="h-[5px] overflow-hidden rounded-[3px] bg-line">
              {/* Fills left to right (transform only), 300ms strong ease-in-out. */}
              <span
                className={cn(
                  "block h-full origin-left bg-ink transition-transform duration-300 ease-in-out",
                  i <= index ? "scale-x-100" : "scale-x-0"
                )}
              />
            </span>
          ))}
        </div>
      </div>

      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div
          key={step}
          custom={dir}
          variants={reduce ? undefined : pageVariants}
          initial={reduce ? { opacity: 0 } : "enter"}
          animate={reduce ? { opacity: 1 } : "center"}
          exit={reduce ? { opacity: 0 } : "exit"}
          transition={PAGE_SLIDE}
          className="flex flex-1 flex-col gap-5"
        >
          {step === "name" && <NameStep a={a} set={set} next={next} />}
          {step === "sex" && <SexStep a={a} set={set} next={next} />}
          {step === "dob" && <DobStep a={a} set={set} next={next} />}
          {step === "height" && <HeightStep a={a} set={set} next={next} />}
          {step === "weight" && <WeightStep a={a} set={set} next={next} />}
          {step === "activity" && <ActivityStep a={a} set={set} next={next} />}
          {step === "mode" && <ModeStep a={a} set={set} next={next} />}
          {step === "goal" && <GoalStep a={a} set={set} next={next} />}
          {step === "pace" && <PaceStep a={a} set={set} next={next} />}
          {step === "summary" && <SummaryStep a={a} next={next} />}
          {step === "split" && <SplitStep a={a} set={set} next={next} />}
          {step === "gym" && <GymStep a={a} set={set} next={next} />}
          {step === "install" && <InstallStep next={next} />}
          {step === "done" && <DoneStep a={a} onFinished={onFinished} />}
        </motion.div>
      </AnimatePresence>
    </main>
  )
}

type StepProps = { a: Answers; set: (p: Partial<Answers>) => void; next: () => void }

function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="m-0 text-[32px] font-extrabold leading-[1.08] tracking-[-0.025em]">{children}</h1>
      {sub ? <p className="m-0 text-[15px] leading-[1.45] text-muted">{sub}</p> : null}
    </div>
  )
}

function Footer({
  onContinue,
  disabled,
  label = "Continue",
  onSkip,
  loading,
}: {
  onContinue: () => void
  disabled?: boolean
  label?: string
  onSkip?: () => void
  loading?: boolean
}) {
  return (
    <div className="mt-auto flex flex-col gap-2 pt-2">
      <Button onClick={onContinue} disabled={disabled} loading={loading}>
        {label}
      </Button>
      {onSkip ? (
        <Button variant="ghost" size="md" onClick={onSkip}>
          Skip for now
        </Button>
      ) : null}
    </div>
  )
}

function BigInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "min-h-16 w-full min-w-0 rounded-btn border border-line bg-white px-4 text-[28px] font-extrabold tracking-[-0.02em] placeholder:font-semibold placeholder:text-dash",
        props.className
      )}
    />
  )
}

function UnitToggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex self-start rounded-full bg-white p-[3px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("min-h-11 min-w-[56px] rounded-full px-3.5 text-[14px]", value === o.id ? "bg-ink font-bold text-white" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Choice({
  selected,
  onClick,
  title,
  sub,
}: {
  selected: boolean
  onClick: () => void
  title: string
  sub?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-16 items-center justify-between gap-3 rounded-btn border-2 px-4 py-3 text-left transition-transform duration-[160ms] ease-out active:scale-[0.98]",
        selected ? "border-ink bg-pink" : "border-transparent bg-white"
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[17px] font-bold">{title}</span>
        {sub ? <span className={cn("text-[13px]", !selected && "text-muted")}>{sub}</span> : null}
      </span>
      {selected ? <CheckIcon size={20} /> : null}
    </button>
  )
}

// ------------------------------------------------------------ Steps

function NameStep({ a, set }: StepProps) {
  const [v, setV] = useState(a.name)
  const ok = v.trim().length > 0
  return (
    <form
      className="flex flex-1 flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ok) return
        set({ name: v.trim().slice(0, 40), step: "sex" })
      }}
    >
      <Logo className="text-ink" />
      <Title sub="This is how your friends see you.">What should we call you?</Title>
      <label className="sr-only" htmlFor="ob-name">
        Your name
      </label>
      <BigInput id="ob-name" autoFocus autoComplete="given-name" value={v} maxLength={40} onChange={(e) => setV(e.target.value)} placeholder="Your name" />
      <div className="mt-auto pt-2">
        <Button type="submit" disabled={!ok} className="w-full">
          Continue
        </Button>
      </div>
    </form>
  )
}

function SexStep({ a, set }: StepProps) {
  return (
    <>
      <Title sub="Used to estimate how many calories your body burns.">What&apos;s your sex?</Title>
      <div role="radiogroup" aria-label="Sex" className="flex flex-col gap-2">
        <Choice selected={a.sex === "male"} onClick={() => set({ sex: "male", step: "dob" })} title="Male" />
        <Choice selected={a.sex === "female"} onClick={() => set({ sex: "female", step: "dob" })} title="Female" />
      </div>
    </>
  )
}

function DobStep({ a, set }: StepProps) {
  const [v, setV] = useState(a.dob)
  const age = ageFrom(v)
  const ok = age != null && age >= 13 && age <= 100
  const today = todayISO()
  const max = `${Number(today.slice(0, 4)) - 13}${today.slice(4)}`
  return (
    <>
      <Title sub="Your age changes how much energy you burn.">When were you born?</Title>
      <label className="sr-only" htmlFor="ob-dob">
        Date of birth
      </label>
      <BigInput id="ob-dob" type="date" value={v} min="1920-01-01" max={max} onChange={(e) => setV(e.target.value)} className="text-[22px]" />
      {v && !ok ? <p className="m-0 text-[14px] font-semibold text-danger">adebite is for people aged 13 and over.</p> : null}
      {ok ? <p className="m-0 text-[15px] text-muted">{age} years old</p> : null}
      <Footer onContinue={() => set({ dob: v, step: "height" })} disabled={!ok} />
    </>
  )
}

function HeightStep({ a, set }: StepProps) {
  const [unit, setUnit] = useState(a.heightUnit)
  const [cm, setCm] = useState(a.heightCm ? String(Math.round(a.heightCm)) : "")
  const totalIn = a.heightCm ? a.heightCm / CM_PER_IN : null
  const [ft, setFt] = useState(totalIn ? String(Math.floor(totalIn / 12)) : "")
  const [inch, setInch] = useState(totalIn ? String(Math.round(totalIn % 12)) : "")
  const value =
    unit === "cm"
      ? parseDecimal(cm)
      : (() => {
          const f = parseDecimal(ft)
          const i = parseDecimal(inch) ?? 0
          return f == null ? null : (f * 12 + i) * CM_PER_IN
        })()
  const ok = value != null && value >= 120 && value <= 230
  return (
    <>
      <Title>How tall are you?</Title>
      <UnitToggle
        label="Unit"
        value={unit}
        onChange={(u) => {
          if (value != null && ok) {
            if (u === "ftin") {
              const t = value / CM_PER_IN
              setFt(String(Math.floor(t / 12)))
              setInch(String(Math.round(t % 12)))
            } else setCm(String(Math.round(value)))
          }
          setUnit(u)
        }}
        options={[
          { id: "cm", label: "cm" },
          { id: "ftin", label: "ft / in" },
        ]}
      />
      {unit === "cm" ? (
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="ob-cm">
            Height in centimetres
          </label>
          <BigInput id="ob-cm" autoFocus inputMode="decimal" placeholder="175" value={cm} onChange={(e) => setCm(e.target.value)} />
          <span className="text-[18px] font-semibold text-muted">cm</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="ob-ft">
            Feet
          </label>
          <BigInput id="ob-ft" autoFocus inputMode="numeric" placeholder="5" value={ft} onChange={(e) => setFt(e.target.value)} />
          <span className="text-[18px] font-semibold text-muted">ft</span>
          <label className="sr-only" htmlFor="ob-in">
            Inches
          </label>
          <BigInput id="ob-in" inputMode="numeric" placeholder="9" value={inch} onChange={(e) => setInch(e.target.value)} />
          <span className="text-[18px] font-semibold text-muted">in</span>
        </div>
      )}
      {value != null && !ok ? <p className="m-0 text-[14px] font-semibold text-danger">Check that number.</p> : null}
      <Footer onContinue={() => set({ heightCm: round1(value!), heightUnit: unit, step: "weight" })} disabled={!ok} />
    </>
  )
}

function WeightStep({ a, set }: StepProps) {
  const [unit, setUnit] = useState(a.weightUnit)
  const [v, setV] = useState(a.weightKg ? num1(a.weightUnit === "lb" ? kgToLb(a.weightKg) : a.weightKg) : "")
  const n = parseDecimal(v)
  const kg = n == null ? null : unit === "lb" ? lbToKg(n) : n
  const ok = kg != null && kg >= 30 && kg <= 300
  return (
    <>
      <Title sub="Your starting point. You'll update it with weigh-ins.">What do you weigh today?</Title>
      <UnitToggle
        label="Unit"
        value={unit}
        onChange={(u) => {
          if (kg != null && ok) setV(num1(u === "lb" ? kgToLb(kg) : kg).replace(/,/g, ""))
          setUnit(u)
        }}
        options={[
          { id: "kg", label: "kg" },
          { id: "lb", label: "lb" },
        ]}
      />
      <div className="flex items-center gap-3">
        <label className="sr-only" htmlFor="ob-weight">
          Weight
        </label>
        <BigInput id="ob-weight" autoFocus inputMode="decimal" placeholder={unit === "kg" ? "70" : "154"} value={v} onChange={(e) => setV(e.target.value)} />
        <span className="text-[18px] font-semibold text-muted">{unit}</span>
      </div>
      {n != null && !ok ? <p className="m-0 text-[14px] font-semibold text-danger">Check that number and unit.</p> : null}
      <Footer onContinue={() => set({ weightKg: round1(kg!), weightUnit: unit, step: "activity" })} disabled={!ok} />
    </>
  )
}

function ActivityStep({ a, set }: StepProps) {
  return (
    <>
      <Title sub="Think of a normal week, including training.">How active are you?</Title>
      <div role="radiogroup" aria-label="Activity level" className="flex flex-col gap-2">
        {ACTIVITY.map((x) => (
          <Choice key={x.level} selected={a.activity === x.level} onClick={() => set({ activity: x.level, step: "mode" })} title={x.title} sub={x.sub} />
        ))}
      </div>
    </>
  )
}

function ModeStep({ a, set }: StepProps) {
  const pick = (mode: Mode) => set({ mode, step: mode === "maintain" ? "summary" : "goal", goalKg: mode === a.mode ? a.goalKg : null })
  return (
    <>
      <Title>What&apos;s your goal?</Title>
      <div role="radiogroup" aria-label="Goal" className="flex flex-col gap-2">
        <Choice selected={a.mode === "gain"} onClick={() => pick("gain")} title="Gain weight" sub="Build muscle with a small surplus" />
        <Choice selected={a.mode === "lose"} onClick={() => pick("lose")} title="Lose weight" sub="Lose fat with a steady deficit" />
        <Choice selected={a.mode === "maintain"} onClick={() => pick("maintain")} title="Maintain" sub="Stay where you are, get stronger" />
      </div>
    </>
  )
}

function GoalStep({ a, set }: StepProps) {
  const unit = a.weightUnit
  const toUnit = (kg: number) => (unit === "lb" ? kgToLb(kg) : kg)
  const [v, setV] = useState(a.goalKg ? num1(toUnit(a.goalKg)).replace(/,/g, "") : "")
  const n = parseDecimal(v)
  const kg = n == null ? null : unit === "lb" ? lbToKg(n) : n
  const current = a.weightKg ?? 0
  const dirOk = kg != null && (a.mode === "gain" ? kg > current : kg < current)
  const ok = kg != null && kg >= 30 && kg <= 300 && dirOk
  return (
    <>
      <Title sub={`You're ${num1(toUnit(current))} ${unit} now.`}>
        {a.mode === "gain" ? "What weight are you aiming for?" : "What weight do you want to reach?"}
      </Title>
      <div className="flex items-center gap-3">
        <label className="sr-only" htmlFor="ob-goal">
          Goal weight
        </label>
        <BigInput id="ob-goal" autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder={num1(toUnit(current + (a.mode === "gain" ? 5 : -5)))} />
        <span className="text-[18px] font-semibold text-muted">{unit}</span>
      </div>
      {n != null && !dirOk ? (
        <p className="m-0 text-[14px] font-semibold text-danger">
          {a.mode === "gain" ? "That's not more than you weigh now." : "That's not less than you weigh now."}
        </p>
      ) : null}
      <Footer onContinue={() => set({ goalKg: round1(kg!), step: "pace" })} disabled={!ok} />
    </>
  )
}

function previewRequest(a: Answers, pace?: Pace): PlanPreviewRequest | null {
  if (!a.sex || !a.dob || !a.heightCm || !a.weightKg || !a.activity || !a.mode) return null
  return {
    sex: a.sex,
    date_of_birth: a.dob,
    height_cm: a.heightCm,
    weight_kg: a.weightKg,
    activity_level: a.activity,
    mode: a.mode,
    goal_weight_kg: a.mode === "maintain" ? null : a.goalKg,
    pace: pace ?? a.pace,
  }
}

function PaceStep({ a, set }: StepProps) {
  const unit = a.weightUnit
  const show = (kg: number) => `${num1(unit === "lb" ? kgToLb(kg) : kg)} ${unit}`
  // The pace isn't part of the request key, so changing it never refetches.
  const req = useMemo(() => previewRequest(a, "standard"), [a])
  if (!req || a.goalKg == null || a.weightKg == null) return null
  return (
    <>
      <Title
        sub={`From ${show(a.weightKg)} to ${show(a.goalKg)}. ${
          a.mode === "gain" ? "Slower means more of it is muscle." : "Slower keeps more muscle and is easier to stick to."
        } You can change this any time.`}
      >
        How fast do you want to {a.mode === "gain" ? "gain" : "lose"}?
      </Title>
      <PacePicker request={req} pace={a.pace} onPace={(p) => set({ pace: p })} goalLabel={show(a.goalKg)} />
      <Footer onContinue={() => set({ step: "summary" })} />
    </>
  )
}

function SummaryStep({ a, next }: { a: Answers; next: () => void }) {
  const req = useMemo(() => previewRequest(a), [a])
  const preview = usePlanPreview(req)
  const plan = preview.data ? (preview.data.paces?.[a.pace] ?? preview.data.plan) : undefined
  return (
    <>
      <Title sub="Your daily targets. They adjust as your weigh-ins come in.">Your plan</Title>
      {preview.error && !plan ? (
        <p role="alert" className="m-0 rounded-card bg-white p-4 text-[14px] text-danger">
          {preview.error}
        </p>
      ) : !plan ? (
        <div className="skeleton h-[220px] rounded-card" />
      ) : (
        <section aria-label="Plan" className="flex flex-col gap-4 rounded-card bg-white p-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[40px] font-extrabold leading-none tracking-[-0.03em]">{kcal(plan.target_kcal)}</span>
            <span className="text-[14px] text-muted">kcal a day</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Macro label="Protein" g={plan.macros.protein_g} color="bg-protein" />
            <Macro label="Carbs" g={plan.macros.carbs_g} color="bg-carbs" />
            <Macro label="Fat" g={plan.macros.fat_g} color="bg-fat" />
          </div>
          <div className="h-px bg-line-soft" />
          <dl className="m-0 grid grid-cols-2 gap-3 text-[14px]">
            <div>
              <dt className="text-[12px] text-muted">Maintenance</dt>
              <dd className="m-0 font-bold">{kcal(plan.maintenance_kcal)} kcal</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">{a.mode === "maintain" ? "Goal" : "Goal around"}</dt>
              <dd className="m-0 font-bold">
                {a.mode === "maintain" ? "Maintain" : plan.forecast_date ? formatMonthYear(plan.forecast_date) : "–"}
              </dd>
            </div>
          </dl>
          {plan.warnings.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1 rounded-[12px] bg-warn-bg p-3 text-[13px]">
              {plan.warnings.map((w) => (
                <li key={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</li>
              ))}
            </ul>
          ) : null}
        </section>
      )}
      <Footer onContinue={next} disabled={!plan} label="Looks good" />
    </>
  )
}

function Macro({ label, g, color }: { label: string; g: number; color: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-[17px] font-bold">{kcal(g)} g</span>
      <span aria-hidden="true" className={cn("h-1.5 rounded-[3px]", color)} />
    </div>
  )
}

function summarizeExercises(names: string[]): string {
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ")
}

function SplitStep({ a, set, next }: StepProps) {
  const res = useApi<SplitsResponse>("splits")
  const splits = res.data?.splits ?? []
  // Picking a split starts the days at its usual week; they can change them next.
  const pick = (sp: Split | null) =>
    set({ split: sp, ownWorkouts: !sp, gymDays: sp ? [...sp.default_days] : a.split ? [] : a.gymDays })
  const reduce = useReducedMotion()
  return (
    <>
      <Title sub="Pick a split and we'll set up its workouts and your week. You can change it, or share it with a friend, later.">
        How do you like to train?
      </Title>
      <div role="radiogroup" aria-label="Gym split" className="flex flex-col gap-2">
        {res.loading ? (
          [0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-btn" aria-hidden="true" />)
        ) : res.error ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-btn bg-white p-4 text-[14px] text-muted">
            Couldn&apos;t load the splits.
            <Button size="sm" variant="outline" onClick={() => void res.reload()}>
              Try again
            </Button>
          </div>
        ) : (
          splits.map((sp) => {
            const selected = a.split?.key === sp.key
            return (
              <div key={sp.key} className="flex flex-col">
                <Choice selected={selected} onClick={() => pick(sp)} title={sp.name} sub={`${dayRange(sp)} · ${sp.description}`} />
                <AnimatePresence initial={false}>
                  {selected ? (
                    <motion.ul
                      key="workouts"
                      className="m-0 flex list-none flex-col gap-1 overflow-hidden px-4"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                    >
                      {sp.workouts.map((w) => (
                        <li key={w.name} className="flex flex-col py-1.5 first:pt-3 text-[13px]">
                          <span className="font-bold">{w.name}</span>
                          <span className="text-muted">{summarizeExercises(w.exercises)}</span>
                        </li>
                      ))}
                    </motion.ul>
                  ) : null}
                </AnimatePresence>
              </div>
            )
          })
        )}
        <Choice
          selected={!a.split && a.ownWorkouts}
          onClick={() => pick(null)}
          title="My own"
          sub="Start with two simple workouts and build from there"
        />
      </div>
      <Footer onContinue={next} disabled={!a.split && !a.ownWorkouts} />
    </>
  )
}

function GymStep({ a, set, next }: StepProps) {
  const toggle = (d: WeekdayKey) => set({ gymDays: a.gymDays.includes(d) ? a.gymDays.filter((x) => x !== d) : [...a.gymDays, d] })
  const sp = a.split
  const n = a.gymDays.length
  const fits = !sp || (n >= sp.min_days && n <= sp.max_days)
  const plan = sp ? assignDays(sp, a.gymDays) : {}
  return (
    <>
      <Title
        sub={
          sp
            ? `${sp.name} works on ${dayRange(sp)}. Each day gets its workout; change them any time in the Gym tab.`
            : "Optional. Upper-1 and Lower-1 take turns on these days; change them any time in the Gym tab."
        }
      >
        Which days do you usually train?
      </Title>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Gym days">
        {WEEKDAY_KEYS.map((d) => {
          const on = a.gymDays.includes(d)
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(d)}
              className={cn(
                "flex min-h-14 items-center justify-center rounded-tile text-[13px] font-bold",
                on ? "border-2 border-ink bg-pink" : "border-2 border-transparent bg-white text-muted"
              )}
            >
              {DAY_LABEL[d]}
            </button>
          )
        })}
      </div>
      {sp && n > 0 ? (
        <ul aria-label="Your week" className="m-0 flex list-none flex-col rounded-card bg-white px-3.5 py-1">
          {WEEKDAY_KEYS.filter((d) => plan[d]).map((d) => (
            <li key={d} className="flex min-h-[40px] items-center justify-between border-b border-line-soft text-[14px] last:border-b-0">
              <span className="font-semibold text-muted">{DAY_LABEL[d]}</span>
              <span className="font-bold">{plan[d]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {!fits ? (
        <p role="status" className="m-0 text-[14px] font-semibold text-danger">
          Pick {dayRange(sp!)} for {sp!.name}.
        </p>
      ) : null}
      <Footer onContinue={next} disabled={!fits} onSkip={() => set({ gymDays: [], step: "install" })} />
    </>
  )
}

function InstallStep({ next }: { next: () => void }) {
  const ios = useSyncExternalStore(subscribeNoop, needsIOSInstall, () => false)
  const standalone = useSyncExternalStore(subscribeNoop, isStandalone, () => false)
  const supported = useSyncExternalStore(subscribeNoop, () => pushSupport().ok, () => false)
  const install = useInstallPrompt()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)

  async function turnOn() {
    setBusy(true)
    setMsg(null)
    try {
      await enablePush()
      setEnabled(true)
    } catch (err) {
      setMsg(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Title sub="adebite works best as an app on your home screen, with reminders for meals and gym days.">
        Put it on your phone
      </Title>
      {ios ? (
        <section className="rounded-card bg-white p-4">
          <IOSInstallSteps />
          <p className="m-0 mt-3 text-[13px] text-muted">Then turn on notifications from the app, in Me → Notifications.</p>
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-card bg-white p-4">
          {install.canPrompt && !standalone ? (
            <Button variant="outline" size="md" onClick={() => void install.prompt()}>
              Install the app
            </Button>
          ) : null}
          {supported ? (
            enabled ? (
              <p className="m-0 flex items-center gap-2 text-[15px] font-semibold text-protein">
                <CheckIcon size={18} /> Notifications are on
              </p>
            ) : (
              <Button size="md" onClick={turnOn} loading={busy}>
                Turn on notifications
              </Button>
            )
          ) : (
            <p className="m-0 text-[14px] text-muted">This browser can&apos;t show notifications. You can still use everything else.</p>
          )}
          {msg ? (
            <p role="alert" className="m-0 text-[14px] text-danger">
              {msg}
            </p>
          ) : null}
        </section>
      )}
      <Footer onContinue={next} onSkip={enabled ? undefined : next} />
    </>
  )
}

function DoneStep({ a, onFinished }: { a: Answers; onFinished: () => void }) {
  const [state, setState] = useState<"idle" | "saving" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  async function finish() {
    const req = previewRequest(a)
    if (!req || !a.name.trim()) {
      setError("Some answers are missing. Go back and check them.")
      setState("error")
      return
    }
    setState("saving")
    const body: OnboardingRequest = {
      ...req,
      display_name: a.name.trim(),
      timezone: localTimeZone(),
      units: a.weightUnit === "lb" || a.heightUnit === "ftin" ? "imperial" : "metric",
      split: a.split?.key ?? null,
      gym_days: a.gymDays,
    }
    try {
      await api.post("onboarding", body)
      done()
    } catch (err) {
      // 409: already onboarded (e.g. a double tap); that's fine.
      if (err instanceof ApiError && err.status === 409) return done()
      setError(errorMessage(err))
      setState("error")
    }
  }

  function done() {
    try {
      sessionStorage.removeItem(STORE_KEY)
    } catch {
      /* ignore */
    }
    onFinished()
  }

  return (
    <>
      <div className="flex flex-1 flex-col justify-center gap-5">
        <span aria-hidden="true" className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-pink">
          <CheckIcon size={30} />
        </span>
        <Title sub="Log your first meal with a photo, or set up your gym week.">You&apos;re set, {a.name.trim() || "friend"}.</Title>
        {error ? (
          <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <Footer onContinue={finish} loading={state === "saving"} label={state === "error" ? "Try again" : "Start"} />
    </>
  )
}
