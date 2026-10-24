"use client"

import Link from "next/link"
import { LogOut, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { useMe } from "@/lib/api/hooks"

export function TopBar() {
  const me = useMe().data?.user
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
          <Link href="/users" className="text-muted-foreground hover:text-foreground">
            Users
          </Link>
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
