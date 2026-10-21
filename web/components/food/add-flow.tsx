"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { Day } from "@/lib/api/types"
import { todayISO } from "@/lib/dates"
import { AddMenu } from "./add-menu"
import { AddFoodSheet, type FoodSheetTarget } from "./add-food-sheet"
import { WeighInSheet } from "./weigh-in-sheet"

type AddFlow = {
  /** The day new food goes to (Today sets this to the day being viewed). */
  date: string
  setDate: (date: string) => void
  menuOpen: boolean
  openMenu: () => void
  openFood: (target?: FoodSheetTarget) => void
  openWeighIn: () => void
  /** Latest Day returned by a log action, so Today can update without refetching. */
  lastDay: Day | null
  publishDay: (day: Day) => void
}

const Ctx = createContext<AddFlow | null>(null)

export function useAddFlow(): AddFlow {
  const v = useContext(Ctx)
  if (!v) throw new Error("useAddFlow must be used inside AddFlowProvider")
  return v
}

export function AddFlowProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [date, setDateState] = useState<string>(() => todayISO())
  const [menuOpen, setMenuOpen] = useState(false)
  const [food, setFood] = useState<{ open: boolean; target?: FoodSheetTarget }>({ open: false })
  const [weighOpen, setWeighOpen] = useState(false)
  const [lastDay, setLastDay] = useState<Day | null>(null)

  const setDate = useCallback((d: string) => setDateState(d), [])
  const openMenu = useCallback(() => setMenuOpen(true), [])
  const openFood = useCallback((target?: FoodSheetTarget) => {
    setMenuOpen(false)
    setFood({ open: true, target })
  }, [])
  const openWeighIn = useCallback(() => {
    setMenuOpen(false)
    setWeighOpen(true)
  }, [])
  const publishDay = useCallback((day: Day) => setLastDay(day), [])

  const value = useMemo<AddFlow>(
    () => ({ date, setDate, menuOpen, openMenu, openFood, openWeighIn, lastDay, publishDay }),
    [date, setDate, menuOpen, openMenu, openFood, openWeighIn, lastDay, publishDay]
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      <AddMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onFood={() => openFood()}
        onWorkout={() => {
          setMenuOpen(false)
          router.push("/gym")
        }}
        onWeighIn={openWeighIn}
      />
      <AddFoodSheet
        open={food.open}
        target={food.target}
        date={date}
        onClose={() => setFood((f) => ({ ...f, open: false }))}
        onLogged={publishDay}
      />
      <WeighInSheet open={weighOpen} onClose={() => setWeighOpen(false)} />
    </Ctx.Provider>
  )
}
