import { Suspense } from "react"
import { AuditLog } from "@/components/logs/audit-log"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <AuditLog userId={id} />
    </Suspense>
  )
}
