"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/cn"
import { initial } from "@/lib/format"
import { BackIcon, CloseIcon } from "./icons"

// ------------------------------------------------------------ Buttons

type Variant = "primary" | "outline" | "pink" | "ghost" | "white" | "danger" | "night-outline"
type Size = "lg" | "md" | "sm"

const variantClass: Record<Variant, string> = {
  primary: "bg-ink text-white border border-ink",
  outline: "bg-transparent text-ink border border-ink",
  pink: "bg-pink text-ink border border-[rgba(46,26,36,0.12)]",
  ghost: "bg-transparent text-ink border border-transparent",
  white: "bg-white text-ink border border-white",
  danger: "bg-transparent text-danger border border-line",
  "night-outline": "bg-transparent text-white border border-night-line",
}

const sizeClass: Record<Size, string> = {
  lg: "min-h-[56px] px-5 text-[16px] rounded-btn",
  md: "min-h-[48px] px-4 text-[15px] rounded-tile",
  sm: "min-h-[44px] px-3.5 text-[14px] rounded-[12px]",
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "lg", loading, className, children, disabled, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-bold transition-opacity disabled:opacity-50",
        variantClass[variant],
        sizeClass[size],
        className
      )}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : null}
      {children}
    </button>
  )
})

export function ButtonLink({
  href,
  variant = "primary",
  size = "lg",
  className,
  children,
  ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-bold no-underline",
        variantClass[variant],
        sizeClass[size],
        className
      )}
      {...rest}
    >
      {children}
    </Link>
  )
}

// ------------------------------------------------------------ Header

/** White 44px square back button + small eyebrow + title, as in the designs. */
export function PageHeader({
  title,
  eyebrow,
  back,
  backLabel = "Back",
  right,
  titleClassName,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  /** A path, or "history" to go back (falls back to /today). */
  back?: string | "history"
  backLabel?: string
  right?: ReactNode
  titleClassName?: string
}) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-3">
      {back ? (
        back === "history" ? (
          <button
            type="button"
            aria-label={backLabel}
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/today"))}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-white text-ink"
          >
            <BackIcon size={20} />
          </button>
        ) : (
          <Link
            href={back}
            aria-label={backLabel}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-white text-ink"
          >
            <BackIcon size={20} />
          </Link>
        )
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        {eyebrow ? <span className="text-[13px] text-muted">{eyebrow}</span> : null}
        <h1 className={cn("m-0 truncate text-[24px] font-extrabold tracking-[-0.02em]", titleClassName)}>{title}</h1>
      </div>
      {right}
    </div>
  )
}

export function CloseButton({ onClick, label = "Close", dark }: { onClick: () => void; label?: string; dark?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-11 w-11 flex-none items-center justify-center rounded-full",
        dark ? "bg-night-2 text-white" : "bg-chip text-ink"
      )}
    >
      <CloseIcon size={18} />
    </button>
  )
}

// ------------------------------------------------------------ Switch

export function Switch({
  checked,
  onChange,
  label,
  labelledBy,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
  labelledBy?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative flex h-8 w-[52px] flex-none items-center rounded-full p-[3px] transition-colors disabled:opacity-50",
        // 44px tap target without changing the drawn size
        "before:absolute before:-inset-y-1.5 before:-inset-x-0 before:content-['']",
        checked ? "justify-end bg-ink" : "justify-start bg-line"
      )}
    >
      <span className={cn("h-[26px] w-[26px] rounded-full transition-colors", checked ? "bg-pink" : "bg-white")} />
    </button>
  )
}

// ------------------------------------------------------------ Chips

export function Chip({
  selected,
  onClick,
  children,
  role = "radio",
  tone = "ink",
  dashed,
  className,
  disabled,
}: {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  role?: "radio" | "pressed" | "button"
  /** Selected look: solid ink (meal picker) or pink (answers, add-ons). */
  tone?: "ink" | "pink"
  dashed?: boolean
  className?: string
  disabled?: boolean
}) {
  const aria =
    role === "radio"
      ? { role: "radio" as const, "aria-checked": !!selected }
      : role === "pressed"
        ? { "aria-pressed": !!selected }
        : {}
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...aria}
      className={cn(
        "relative inline-flex min-h-[34px] items-center rounded-full px-3 text-[13px] disabled:opacity-50",
        "before:absolute before:-inset-y-[5px] before:inset-x-0 before:content-['']",
        selected
          ? tone === "ink"
            ? "border border-ink bg-ink font-bold text-white"
            : "border border-ink bg-pink font-bold text-ink"
          : dashed
            ? "border-[1.5px] border-dashed border-dash bg-transparent font-semibold text-ink"
            : "border border-line bg-white text-ink",
        className
      )}
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------ Cards & states

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" }) {
  return (
    <section className={cn("rounded-card bg-white", className)} {...rest}>
      {children}
    </section>
  )
}

export function DashedNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-tile border-[1.5px] border-dashed border-dash p-3.5 text-[14px] text-muted", className)}>
      {children}
    </div>
  )
}

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn("spin", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("skeleton", className)} style={style} aria-hidden="true" />
}

export function LoadingBlock({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-3", className)}>
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-[120px] rounded-card" />
      <Skeleton className="h-[72px] rounded-card" />
      <Skeleton className="h-[72px] rounded-card" />
    </div>
  )
}

export function ErrorCard({
  message,
  onRetry,
  dark,
  className,
}: {
  message: string
  onRetry?: () => void
  dark?: boolean
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-card p-4",
        dark ? "border border-night-3 text-night-soft" : "bg-white text-ink",
        className
      )}
    >
      <span className="text-[15px] font-semibold">Couldn&apos;t load this</span>
      <span className={cn("text-[14px]", dark ? "text-night-muted" : "text-muted")}>{message}</span>
      {onRetry ? (
        <Button size="sm" variant={dark ? "night-outline" : "outline"} onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function Avatar({
  name,
  url,
  size = 40,
  tone = "lilac",
  className,
}: {
  name: string | null | undefined
  url?: string | null
  size?: number
  tone?: "lilac" | "ink" | "pink"
  className?: string
}) {
  const toneClass = tone === "ink" ? "bg-ink text-pink" : tone === "pink" ? "bg-pink text-ink" : "bg-lilac text-ink"
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote avatars (Google) without image config
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className={cn("flex-none rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn("flex flex-none items-center justify-center rounded-full font-extrabold", toneClass, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initial(name)}
    </span>
  )
}

/** "0 of 8 friends" segmented bar on dark cards. */
export function ReferralBar({ joined, needed }: { joined: number; needed: number }) {
  const total = Math.max(1, needed)
  return (
    <span
      role="img"
      aria-label={`${joined} of ${needed} friends joined`}
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-1.5 rounded-[3px]", i < joined ? "bg-pink" : "bg-night-3")} />
      ))}
    </span>
  )
}

// ------------------------------------------------------------ Inputs

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "min-h-[48px] w-full min-w-0 rounded-tile border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-muted/80",
        className
      )}
      {...rest}
    />
  )
})

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-muted">
        {label}
      </label>
      {children}
      {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </div>
  )
}

/** Small numeric input used in item rows ("250 g", "325 kcal"). */
export const SmallNumber = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { suffix?: string; dashed?: boolean; widthClass?: string }
>(function SmallNumber({ suffix, dashed, widthClass = "w-[52px]", className, ...rest }, ref) {
  return (
    <label className="flex items-center gap-1 text-[12px] text-muted">
      <input
        ref={ref}
        inputMode="decimal"
        className={cn(
          "min-h-[36px] rounded-[10px] bg-white px-1.5 text-right text-[14px] font-semibold text-ink",
          dashed ? "border-[1.5px] border-dashed border-warn-line" : "border border-line",
          widthClass,
          className
        )}
        {...rest}
      />
      {suffix ? <span aria-hidden="true">{suffix}</span> : null}
    </label>
  )
})
