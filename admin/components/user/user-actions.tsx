"use client"

import { useState } from "react"
import { Ban, ChevronDown, Crown, Shield, ShieldOff, Undo2, X } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { api, seg } from "@/lib/api/client"
import { useMe, useUserMutation } from "@/lib/api/hooks"
import type { AdminUser, AdminUserResponse } from "@/lib/api/types"
import { addDays, formatDate } from "@/lib/format"

type Open = null | "pro" | "revoke" | "role" | "suspend" | "unsuspend"

/** The actions menu on a user's page, and the dialogs it opens. */
export function UserActions({ user }: { user: AdminUser }) {
  const me = useMe().data?.user
  const isMe = me?.id === user.id
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)
  const path = `admin/users/${seg(user.id)}`

  const revoke = useUserMutation(user.id, () => api.del<AdminUserResponse>(`${path}/pro`), "Pro revoked")
  const role = useUserMutation(
    user.id,
    (r: "admin" | "member") => api.put<AdminUserResponse>(`${path}/role`, { role: r }),
    user.role === "admin" ? "No longer an admin" : "Now an admin"
  )
  const unsuspend = useUserMutation(user.id, () => api.del<AdminUserResponse>(`${path}/suspend`), "Suspension lifted")

  const name = user.display_name ?? (user.name || user.email)
  const referralPro = user.is_pro && user.pro_source === "referrals"
  const paidPro = user.is_pro && user.pro_source === "subscription"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Actions
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Plan</DropdownMenuLabel>
          <DropdownMenuItem disabled={user.admin_email} onSelect={() => setOpen("pro")}>
            <Crown />
            {user.is_pro ? "Change Pro…" : "Grant Pro…"}
          </DropdownMenuItem>
          {user.is_pro ? (
            <DropdownMenuItem disabled={user.admin_email || paidPro} onSelect={() => setOpen("revoke")}>
              <X />
              {paidPro ? "Paid: cancel in Stripe" : "Revoke Pro…"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Access</DropdownMenuLabel>
          {user.role === "admin" ? (
            <DropdownMenuItem disabled={isMe || user.admin_email} onSelect={() => setOpen("role")}>
              <ShieldOff />
              Remove admin…
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setOpen("role")}>
              <Shield />
              Make admin…
            </DropdownMenuItem>
          )}
          {user.suspended_at ? (
            <DropdownMenuItem onSelect={() => setOpen("unsuspend")}>
              <Undo2 />
              Lift suspension…
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" disabled={isMe} onSelect={() => setOpen("suspend")}>
              <Ban />
              Suspend…
            </DropdownMenuItem>
          )}
          {user.admin_email ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">In ADMIN_EMAILS: always admin with Pro.</p>
          ) : isMe ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">You can&apos;t demote or suspend yourself.</p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <GrantProDialog user={user} open={open === "pro"} onClose={close} />
      <SuspendDialog user={user} open={open === "suspend"} onClose={close} />

      <Confirm
        open={open === "revoke"}
        onClose={close}
        title={`Revoke ${name}'s Pro?`}
        description={
          referralPro
            ? "They earned Pro forever by bringing 8 friends. They go back to free, and get Pro again if one more friend joins through their links."
            : "They go back to the free plan: 10 photo estimates a month."
        }
        action="Revoke Pro"
        destructive
        pending={revoke.isPending}
        onConfirm={() => revoke.mutate(undefined, { onSuccess: close })}
      />
      <Confirm
        open={open === "role"}
        onClose={close}
        title={user.role === "admin" ? `Remove ${name} as admin?` : `Make ${name} an admin?`}
        description={
          user.role === "admin"
            ? "They lose access to moderation and this app. It takes effect within 15 minutes, when their session refreshes."
            : "They can moderate the Shop, see every user here, change plans and suspend people. Takes effect within 15 minutes."
        }
        action={user.role === "admin" ? "Remove admin" : "Make admin"}
        destructive={user.role === "admin"}
        pending={role.isPending}
        onConfirm={() => role.mutate(user.role === "admin" ? "member" : "admin", { onSuccess: close })}
      />
      <Confirm
        open={open === "unsuspend"}
        onClose={close}
        title={`Lift ${name}'s suspension?`}
        description="They can sign in again straight away."
        action="Lift suspension"
        pending={unsuspend.isPending}
        onConfirm={() => unsuspend.mutate(undefined, { onSuccess: close })}
      />
    </>
  )
}

function Confirm({
  open,
  onClose,
  title,
  description,
  action,
  destructive,
  pending,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  action: string
  destructive?: boolean
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={(e) => {
              // Stay open until the request finishes.
              e.preventDefault()
              onConfirm()
            }}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const PRESETS: { label: string; days: number }[] = [
  { label: "1 month", days: 30 },
  { label: "3 months", days: 91 },
  { label: "1 year", days: 365 },
]

function endOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(23, 59, 59, 0)
  return out
}

function GrantProDialog({ user, open, onClose }: { user: AdminUser; open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<"forever" | "until">("forever")
  const [date, setDate] = useState<Date | undefined>(() => addDays(new Date(), 30))
  // The calendar follows a preset to its month.
  const [month, setMonth] = useState<Date>(() => addDays(new Date(), 30))
  const grant = useUserMutation(
    user.id,
    (until: string | null) => api.put<AdminUserResponse>(`admin/users/${seg(user.id)}/pro`, { until }),
    "Pro updated"
  )
  const referralForever = user.is_pro && user.pro_source === "referrals" && !user.pro_until
  const tomorrow = addDays(new Date(), 1)
  tomorrow.setHours(0, 0, 0, 0)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user.is_pro ? "Change Pro" : "Grant Pro"}</DialogTitle>
          <DialogDescription>
            Pro from an admin: unlimited AI estimates and photo storage.
            {user.is_pro
              ? ` They have Pro now (${user.pro_source ?? "unknown"}${user.pro_until ? `, until ${formatDate(user.pro_until)}` : ", forever"}).`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How long">
          {(["forever", "until"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              variant={mode === m ? "default" : "outline"}
              disabled={m === "until" && referralForever}
              onClick={() => setMode(m)}
            >
              {m === "forever" ? "Forever" : "Until a date"}
            </Button>
          ))}
        </div>
        {referralForever ? (
          <p className="text-sm text-muted-foreground">They already have Pro forever from referrals, so an end date would cut it short.</p>
        ) : null}

        {mode === "until" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.days}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const d = addDays(new Date(), p.days)
                    setDate(d)
                    setMonth(d)
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex justify-center rounded-lg border">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={{ before: tomorrow }}
                month={month}
                onMonthChange={setMonth}
              />
            </div>
            <p className="text-sm text-muted-foreground">{date ? `Pro ends at the end of ${formatDate(date.toISOString())}.` : "Pick a date."}</p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={grant.isPending}>
            Cancel
          </Button>
          <Button
            disabled={grant.isPending || (mode === "until" && !date)}
            onClick={() => grant.mutate(mode === "until" && date ? endOfDay(date).toISOString() : null, { onSuccess: onClose })}
          >
            <Crown />
            {mode === "forever" ? "Grant Pro forever" : "Grant Pro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SuspendDialog({ user, open, onClose }: { user: AdminUser; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("")
  const suspend = useUserMutation(
    user.id,
    (r: string) => api.post<AdminUserResponse>(`admin/users/${seg(user.id)}/suspend`, { reason: r.trim() || null }),
    "Suspended"
  )
  const name = user.display_name ?? (user.name || user.email)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Suspend {name}?</DialogTitle>
          <DialogDescription>
            They&apos;re signed out on every device within 15 minutes and can&apos;t sign in again until you lift it. Their data stays as it is.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="suspend-reason" className="text-sm font-medium">
            Reason <span className="font-normal text-muted-foreground">(only admins see it)</span>
          </label>
          <Textarea
            id="suspend-reason"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Spam in the Shop"
          />
          <span className="self-end text-xs tabular-nums text-muted-foreground">{reason.length}/300</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={suspend.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={suspend.isPending}
            onClick={() => suspend.mutate(reason, { onSuccess: () => (setReason(""), onClose()) })}
          >
            <Ban />
            Suspend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
