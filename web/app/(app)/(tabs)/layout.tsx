import { GlassNav } from "@/components/nav/glass-nav"
import { AddFlowProvider } from "@/components/food/add-flow"

// Tab screens: content column plus the floating glass nav. The nav is rendered
// as a sibling of the content (both direct children of <body>, since layouts
// add no wrapper element), so no ancestor filter/opacity/transform can break
// its backdrop-filter or position: fixed.
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AddFlowProvider>
      <main className="app-column pb-nav">{children}</main>
      <GlassNav />
    </AddFlowProvider>
  )
}
