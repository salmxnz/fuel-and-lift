import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ShopDetail } from "@/components/shop/shop-detail"
import type { ShopKind } from "@/lib/api/types"

export const metadata: Metadata = { title: "Shop" }

const KINDS: ShopKind[] = ["routine", "template", "meal"]

export default async function ShopItemPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  if (!KINDS.includes(kind as ShopKind)) notFound()
  return <ShopDetail kind={kind as ShopKind} id={id} />
}
