import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ApiDownScreen } from "@/components/api-down"
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow"
import { getMe, getSession } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Set up" }
export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  if (!(await getSession())) redirect("/login?callbackUrl=/onboarding")
  let me
  try {
    me = await getMe()
  } catch {
    return <ApiDownScreen />
  }
  if (!me) redirect("/api/auth/logout?reason=session")
  if (me.onboarded) redirect("/today")
  const first = (me.user.name ?? "").trim().split(/\s+/)[0] ?? ""
  return <OnboardingFlow defaultName={first} />
}
