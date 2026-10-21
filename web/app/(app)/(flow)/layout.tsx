import { AddFlowProvider } from "@/components/food/add-flow"

// Focused flows (logging, workout, review, paywall): no tab bar.
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <AddFlowProvider>{children}</AddFlowProvider>
}
