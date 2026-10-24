"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { toast } from "sonner"
import { useMe } from "@/components/me-context"
import { Sheet } from "@/components/ui/sheet"
import { Avatar, Button } from "@/components/ui/primitives"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { Day, Entry, FriendsResponse, ShareEntryResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { kcal } from "@/lib/format"
import { EASE_OUT, SPRING_SNAPPY } from "@/lib/motion"
import { FriendPicker, firstName, joinNames } from "./friend-picker"

type Mode = "split" | "share"

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "split", label: "Split it", hint: "You shared one plate. Everyone gets an equal part, yours included." },
  { value: "share", label: "Just share", hint: "You each had your own. They get the same meal, yours stays as it is." },
]

export function ShareMealSheet({
  entry,
  onClose,
  onDayChange,
}: {
  entry: Entry | null
  onClose: () => void
  onDayChange: (day: Day) => void
}) {
  return (
    <Sheet open={!!entry} onClose={onClose} title={entry ? `Share ${entry.name}` : "Share"}>
      {entry ? <ShareMealForm key={entry.id} entry={entry} onClose={onClose} onDayChange={onDayChange} /> : null}
    </Sheet>
  )
}

function ShareMealForm({ entry, onClose, onDayChange }: { entry: Entry; onClose: () => void; onDayChange: (day: Day) => void }) {
  const me = useMe()
  const friends = useApi<FriendsResponse>("friends")
  const [mode, setMode] = useState<Mode>("split")
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reduce = useReducedMotion()

  const list = friends.data?.friends ?? []
  const chosen = picked.map((id) => list.find((f) => f.id === id)).filter((f) => f !== undefined)
  const names = chosen.map((f) => firstName(f.name))
  const ways = mode === "split" ? chosen.length + 1 : 1
  const part = entry.kcal / ways
  const hint = MODES.find((m) => m.value === mode)!.hint

  function toggle(id: string) {
    setError(null)
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  async function send() {
    if (chosen.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<ShareEntryResponse>(`entries/${seg(entry.id)}/share`, {
        friend_ids: picked,
        split: mode === "split",
      })
      onDayChange(res.day)
      toast.success(
        mode === "split"
          ? `Split with ${joinNames(names)}. Yours is ${kcal(res.entry.kcal)} kcal now.`
          : `Sent to ${joinNames(names)}`
      )
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const people = [
    { id: "me", name: "You", avatar: me.user.avatar_url, mine: true },
    ...chosen.map((f) => ({ id: f.id, name: firstName(f.name), avatar: f.avatar_url, mine: false })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="share-with" className="flex flex-col gap-2">
        <h3 id="share-with" className="m-0 text-[13px] font-semibold text-muted">
          Who did you eat with?
        </h3>
        <FriendPicker friends={friends.data?.friends} loading={friends.loading} selected={picked} onToggle={toggle} />
      </section>

      {list.length > 0 ? (
        <>
          <div role="radiogroup" aria-label="How to share" className="grid grid-cols-2 rounded-full bg-chip p-[3px]">
            {MODES.map((m) => {
              const on = mode === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setMode(m.value)
                    setError(null)
                  }}
                  className={cn(
                    "relative min-h-[40px] rounded-full text-[14px] transition-[color,transform] duration-[160ms] ease-out active:scale-[0.97]",
                    on ? "font-bold text-white" : "font-semibold text-ink-soft"
                  )}
                >
                  {on ? (
                    <motion.span
                      layoutId="share-mode-pill"
                      transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
                      className="absolute inset-0 rounded-full bg-ink"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="relative">{m.label}</span>
                </button>
              )
            })}
          </div>

          {/* The hint swaps with a short blurred crossfade so the two lines read as one changing sentence. */}
          <div className="relative -mt-1.5 min-h-[40px]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={mode}
                className="m-0 text-[14px] leading-[1.45] text-muted"
                initial={{ opacity: 0, filter: "blur(2px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: reduce ? 0 : 0.18, ease: EASE_OUT }}
              >
                {hint}
              </motion.p>
            </AnimatePresence>
          </div>

          <ul aria-label="Who gets what" className="m-0 flex list-none flex-col gap-2.5 rounded-card bg-white p-3.5">
            <AnimatePresence initial={false} mode="popLayout">
              {people.map((p) => (
                <motion.li
                  key={p.id}
                  layout={reduce ? false : "position"}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-4px)" }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="flex items-center gap-2.5"
                >
                  <Avatar name={p.mine ? me.user.name : p.name} url={p.avatar} size={28} tone={p.mine ? "ink" : "pink"} />
                  <span className={cn("w-[64px] flex-none truncate text-[14px]", p.mine && "font-bold")}>{p.name}</span>
                  {/* How much of the plate each person had: shrinks to 1/n on a split. */}
                  <span aria-hidden="true" className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-line-soft">
                    <span
                      className={cn(
                        "block h-full w-full origin-left rounded-full transition-transform duration-[240ms] ease-in-out",
                        p.mine ? "bg-ink" : "bg-pink"
                      )}
                      style={{ transform: `scaleX(${1 / ways})` }}
                    />
                  </span>
                  <span className="w-[76px] flex-none text-right text-[14px] font-bold tabular-nums">
                    <RollingNumber value={Math.round(part)} /> <span className="font-normal text-muted">kcal</span>
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <Button onClick={send} loading={busy} disabled={chosen.length === 0 || busy}>
        {chosen.length === 0
          ? "Pick who you ate with"
          : mode === "split"
            ? chosen.length === 1
              ? `Split with ${names[0]}`
              : `Split ${chosen.length + 1} ways`
            : `Send to ${joinNames(names)}`}
      </Button>
    </div>
  )
}

/** A number that rolls to its new value: old one lifts out, new one rises in, softened with a touch of blur. */
function RollingNumber({ value }: { value: number }) {
  const reduce = useReducedMotion()
  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(60%)", filter: "blur(2px)" }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0%)", filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-60%)", filter: "blur(2px)" }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          {kcal(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
