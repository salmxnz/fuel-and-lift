import type { Metadata } from "next"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Admins only" }

export default function ForbiddenPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-6">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border bg-background p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Admins only</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in, but this account isn&apos;t an admin (any more). Sign out and use an admin account.
        </p>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  )
}
