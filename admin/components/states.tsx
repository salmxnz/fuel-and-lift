import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api/client"

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
    </div>
  )
}

export function Failed({ error }: { error: unknown }) {
  return (
    <div role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {errorMessage(error)}
    </div>
  )
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  )
}
