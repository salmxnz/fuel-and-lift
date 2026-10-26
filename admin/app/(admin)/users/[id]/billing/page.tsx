import { BillingTab } from "@/components/tabs/billing"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <BillingTab userId={id} />
}
