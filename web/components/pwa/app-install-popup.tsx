"use client"

import { useState } from "react"
import { useTour } from "@/components/tour/tour"
import { InstallPopup } from "./install-popup"
import { PushPopup } from "./push-popup"

const ABOVE_TAB_BAR = "calc(max(26px, calc(var(--safe-bottom) + 8px)) + 72px)"

/**
 * The install and "turn on notifications" popups on tab screens: above the tab
 * bar, after the walkthrough. A phone that can still install gets the install
 * one first; the push one waits until that's dismissed or done.
 */
export function AppInstallPopup() {
  const tour = useTour()
  const [installShown, setInstallShown] = useState(false)
  return (
    <>
      <InstallPopup delayMs={4000} hidden={tour.active} bottom={ABOVE_TAB_BAR} onShowChange={setInstallShown} />
      <PushPopup delayMs={8000} hidden={installShown} bottom={ABOVE_TAB_BAR} />
    </>
  )
}
