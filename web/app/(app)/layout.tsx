import { redirect } from "next/navigation"
import { getMe, getSession } from "@/lib/auth/session"
import { MeProvider } from "@/components/me-context"
import { ApiDownScreen } from "@/components/api-down"

export const dynamic = "force-dynamic"

// Every signed-in screen: needs a session (proxy.ts already redirected if not)
// and a finished onboarding.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect("/login")

  let me
  try {
    me = await getMe()
  } catch {
    return <ApiDownScreen />
  }
  // Token verified but Go no longer knows the session (revoked, user removed):
  // clear our cookies via the logout route, or /login would bounce us back.
  if (!me) redirect("/api/auth/logout?reason=session")
  if (!me.onboarded) redirect("/onboarding")

  return <MeProvider value={{ user: me.user, profile: me.profile }}>{children}</MeProvider>
}
