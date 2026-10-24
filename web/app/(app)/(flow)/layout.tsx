import { AddFlowProvider } from "@/components/food/add-flow"
import { SharePopup } from "@/components/share/share-popup"

// Focused flows (logging, workout, review, paywall): no tab bar.
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <AddFlowProvider>
      {children}
      {/* Mounted per group (tabs, flows) so it can wait for the tour. */}
      <SharePopup />
    </AddFlowProvider>
  )
}
