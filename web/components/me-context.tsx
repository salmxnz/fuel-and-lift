"use client"

import { createContext, useContext } from "react"
import type { Profile, User } from "@/lib/api/types"

export type MeValue = { user: User; profile: Profile | null }

const MeContext = createContext<MeValue | null>(null)

export function MeProvider({ value, children }: { value: MeValue; children: React.ReactNode }) {
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>
}

export function useMe(): MeValue {
  const v = useContext(MeContext)
  if (!v) throw new Error("useMe must be used inside the signed-in layout")
  return v
}

export function displayName(me: MeValue): string {
  return me.profile?.display_name || me.user.name || me.user.email.split("@")[0]
}
