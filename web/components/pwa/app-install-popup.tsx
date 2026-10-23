"use client"

import { useTour } from "@/components/tour/tour"
import { InstallPopup } from "./install-popup"

/** The install popup on tab screens: sits above the tab bar, waits for the walkthrough. */
export function AppInstallPopup() {
  const tour = useTour()
  return <InstallPopup delayMs={4000} hidden={tour.active} bottom="calc(max(26px, calc(var(--safe-bottom) + 8px)) + 72px)" />
}
