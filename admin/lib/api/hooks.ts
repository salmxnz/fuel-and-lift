"use client"

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, errorMessage, seg } from "./client"
import type { AdminUserDetail, AdminUserResponse, MeResponse, ShopKind } from "./types"

// Query keys. Everything about one user sits under ["user", id], so a change
// to them refreshes the header and every tab at once.
export const keys = {
  users: ["users"] as const,
  user: (id: string) => ["user", id] as const,
  tab: (id: string, tab: string, ...rest: (string | number)[]) => ["user", id, tab, ...rest] as const,
}

/** The signed-in admin. */
export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<MeResponse>("auth/me"), staleTime: 5 * 60_000 })
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: keys.user(id),
    queryFn: ({ signal }) => api.get<AdminUserDetail>(`admin/users/${seg(id)}`, undefined, signal),
  })
}

/**
 * A GET under one user's tab: admin/users/{id}/{path}. With a query (a date
 * range), the previous range stays on screen while a wider one loads.
 */
export function useUserTab<T>(id: string, path: string, query?: Record<string, string>) {
  return useQuery({
    queryKey: keys.tab(id, path, JSON.stringify(query ?? {})),
    queryFn: ({ signal }) => api.get<T>(`admin/users/${seg(id)}/${path}`, query, signal),
    placeholderData: query ? (prev, prevQuery) => (prevQuery?.queryKey[1] === id ? keepPreviousData(prev) : undefined) : undefined,
  })
}

/** A change to a user (Pro, role, suspension) that answers with the user. */
export function useUserMutation<V>(id: string, run: (v: V) => Promise<AdminUserResponse>, done: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      toast.success(done)
      qc.invalidateQueries({ queryKey: keys.user(id) })
      qc.invalidateQueries({ queryKey: keys.users })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
}

/** Hide an item from everyone but its owner, or show it again. */
export function useHide(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id, hide }: { kind: ShopKind; id: string; hide: boolean }) =>
      hide ? api.post(`admin/shop/${kind}/${seg(id)}/hide`) : api.del(`admin/shop/${kind}/${seg(id)}/hide`),
    onSuccess: (_data, v) => {
      toast.success(v.hide ? "Hidden. The owner was notified." : "Visible again")
      qc.invalidateQueries({ queryKey: keys.user(userId) })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
}

/**
 * A page of a log (admin/notifications, admin/audit), newest first, with
 * "load more" through the before cursor. Live refetches every 5 s.
 */
export function useLogPages<T extends { next_before: number | null }>(path: string, filters: Record<string, string>, live: boolean) {
  return useInfiniteQuery({
    queryKey: ["logs", path, filters],
    queryFn: ({ pageParam, signal }) =>
      api.get<T>(path, { ...filters, before: pageParam || undefined }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_before ?? undefined,
    refetchInterval: live ? 5000 : false,
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}
