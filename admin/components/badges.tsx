import { Ban, Crown, EyeOff, Globe, Lock, Shield, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { AdminUser, Visibility } from "@/lib/api/types"
import { formatShortDate } from "@/lib/format"
import { cn } from "@/lib/utils"

const SOURCE: Record<string, string> = { admin: "admin", referrals: "referrals", subscription: "paid" }

/** Pro (with where it came from and until when) or Free. */
export function PlanBadge({ user }: { user: Pick<AdminUser, "is_pro" | "pro_source" | "pro_until"> }) {
  if (!user.is_pro) return <Badge variant="outline">Free</Badge>
  const source = user.pro_source ? SOURCE[user.pro_source] : null
  return (
    <Badge className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <Crown />
      Pro{source ? ` · ${source}` : ""}
      {user.pro_until ? ` · until ${formatShortDate(user.pro_until)}` : ""}
    </Badge>
  )
}

export function RoleBadge({ role }: { role: string }) {
  if (role !== "admin") return null
  return (
    <Badge variant="secondary">
      <Shield />
      Admin
    </Badge>
  )
}

export function SuspendedBadge({ at }: { at: string | null }) {
  if (!at) return null
  return (
    <Badge variant="destructive">
      <Ban />
      Suspended
    </Badge>
  )
}

const VISIBILITY: Record<Visibility, { label: string; icon: typeof Lock; className: string }> = {
  private: { label: "Private", icon: Lock, className: "" },
  friends: {
    label: "Friends",
    icon: Users,
    className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  },
  public: {
    label: "Public",
    icon: Globe,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  },
}

/** Who can see an item, plus a Hidden badge when a moderator removed it. */
export function VisibilityBadge({ visibility, hidden }: { visibility: Visibility; hidden?: boolean }) {
  const v = VISIBILITY[visibility]
  const Icon = v.icon
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className={cn(v.className)}>
        <Icon />
        {v.label}
      </Badge>
      {hidden ? (
        <Badge variant="destructive">
          <EyeOff />
          Hidden
        </Badge>
      ) : null}
    </span>
  )
}
