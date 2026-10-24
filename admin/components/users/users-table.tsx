"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { PlanBadge, RoleBadge, SuspendedBadge } from "@/components/badges"
import { Failed } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserAvatar } from "@/components/user-avatar"
import { api } from "@/lib/api/client"
import { keys } from "@/lib/api/hooks"
import type { AdminUsersResponse } from "@/lib/api/types"
import { formatDate, formatRelative } from "@/lib/format"

const PAGE = 50

const FILTERS = [
  { key: "plan", label: "Plan", options: [["free", "Free"], ["pro", "Pro"]] },
  { key: "role", label: "Role", options: [["admin", "Admins"], ["member", "Members"]] },
  { key: "status", label: "Status", options: [["active", "Active"], ["suspended", "Suspended"]] },
] as const

export function UsersTable() {
  const router = useRouter()
  const params = useSearchParams()
  const q = params.get("q") ?? ""
  const plan = params.get("plan") ?? ""
  const role = params.get("role") ?? ""
  const status = params.get("status") ?? ""
  const page = Math.max(0, Number(params.get("page") ?? "0") || 0)

  // The search box updates the URL 300 ms after typing stops.
  const [search, setSearch] = useState(q)
  useEffect(() => {
    if (search.trim() === q) return
    const t = setTimeout(() => setParams({ q: search.trim(), page: "" }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function setParams(updates: Record<string, string>) {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    const qs = next.toString()
    router.replace(qs ? `/users?${qs}` : "/users", { scroll: false })
  }

  const query = { q, plan, role, status, limit: PAGE, offset: page * PAGE }
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: [...keys.users, query],
    queryFn: ({ signal }) => api.get<AdminUsersResponse>("admin/users", query, signal),
    placeholderData: keepPreviousData,
  })

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="pl-8"
            aria-label="Search users"
          />
        </div>
        {FILTERS.map((f) => (
          <Select
            key={f.key}
            value={params.get(f.key) || "all"}
            onValueChange={(v) => setParams({ [f.key]: v === "all" ? "" : v, page: "" })}
          >
            <SelectTrigger className="w-36" aria-label={f.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any {f.label.toLowerCase()}</SelectItem>
              {f.options.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {error ? <Failed error={error} /> : null}

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="hidden md:table-cell">Meals · workouts · routines</TableHead>
              <TableHead className="hidden lg:table-cell">Joined</TableHead>
              <TableHead className="pr-4">Last sign-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={isFetching && !isPending ? "opacity-60 transition-opacity" : undefined}>
            {isPending
              ? Array.from({ length: 8 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5} className="px-4">
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : null}
            {data?.users.map((u) => (
              <TableRow key={u.id} className="cursor-pointer" onClick={() => router.push(`/users/${u.id}`)}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={u.display_name ?? u.name ?? u.email} src={u.avatar_url} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {/* A real link too, for cmd-click and keyboard users. */}
                        <Link
                          href={`/users/${u.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium hover:underline"
                        >
                          {u.display_name ?? (u.name || u.email)}
                        </Link>
                        <RoleBadge role={u.role} />
                        <SuspendedBadge at={u.suspended_at} />
                        {!u.onboarded ? <span className="text-xs text-muted-foreground">not onboarded</span> : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <PlanBadge user={u} />
                </TableCell>
                <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                  {u.counts.saved_meals} · {u.counts.templates} · {u.counts.routines}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDate(u.created_at)}</TableCell>
                <TableCell className="pr-4 text-muted-foreground">{formatRelative(u.last_login_at)}</TableCell>
              </TableRow>
            ))}
            {data && data.users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  No users match.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {total === 0 ? "0 users" : `${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setParams({ page: page - 1 > 0 ? String(page - 1) : "" })}
          >
            <ChevronLeft />
            Previous
          </Button>
          <span className="tabular-nums">
            {page + 1} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setParams({ page: String(page + 1) })}>
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
