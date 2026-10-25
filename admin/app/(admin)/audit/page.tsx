import type { Metadata } from "next"
import { Suspense } from "react"
import { AuditLog } from "@/components/logs/audit-log"

export const metadata: Metadata = { title: "Audit log" }

export default function AuditPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every request the API served: who, what, how it went. No request bodies, and reads of these logs aren&apos;t recorded. Kept 30 days.
        </p>
      </div>
      <Suspense>
        <AuditLog />
      </Suspense>
    </div>
  )
}
