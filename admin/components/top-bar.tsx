"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { useMe } from "@/lib/api/hooks"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/users", label: "Users" },
  { href: "/billing", label: "Billing" },
  { href: "/feedback", label: "Feedback" },
  { href: "/notifications", label: "Notifications" },
  { href: "/audit", label: "Audit log" },
]

export function TopBar() {
  const me = useMe().data?.user
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/users" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </span>
          adebite admin
        </Link>
        <nav className="flex gap-4 text-sm">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`)
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn("hover:text-foreground", active ? "font-medium text-foreground" : "text-muted-foreground")}
              >
                {n.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {me ? (
            <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <UserAvatar name={me.name || me.email} src={me.avatar_url} className="size-6" />
              {me.email}
            </span>
          ) : null}
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              <LogOut />
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
