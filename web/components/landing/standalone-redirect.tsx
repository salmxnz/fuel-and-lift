"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { isStandalone } from "@/lib/push"

/** The installed app should never show the landing page: go straight in. */
export function StandaloneRedirect() {
  const router = useRouter()
  useEffect(() => {
    if (isStandalone()) router.replace("/today")
  }, [router])
  return null
}
