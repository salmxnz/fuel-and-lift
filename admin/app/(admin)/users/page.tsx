import type { Metadata } from "next"
import { Suspense } from "react"
import { UsersTable } from "@/components/users/users-table"

export const metadata: Metadata = { title: "Users" }

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">Everyone who has signed in, newest first.</p>
      </div>
      <Suspense>
        <UsersTable />
      </Suspense>
    </div>
  )
}
