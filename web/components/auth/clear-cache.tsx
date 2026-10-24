"use client"

import { useEffect } from "react"
import { clearCache } from "@/lib/api/query-client"

/** Drops every account's cached data from the device (sign-in page). */
export function ClearCache() {
  useEffect(() => clearCache(), [])
  return null
}
