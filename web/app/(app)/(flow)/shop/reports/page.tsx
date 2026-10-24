import type { Metadata } from "next"
import { AdminReports } from "@/components/shop/admin-reports"

export const metadata: Metadata = { title: "Reports" }

export default function ReportsPage() {
  return <AdminReports />
}
