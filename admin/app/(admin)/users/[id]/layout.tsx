import { UserHeader } from "@/components/user/user-header"

export default async function UserLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="flex flex-col gap-6">
      <UserHeader id={id} />
      <div>{children}</div>
    </div>
  )
}
