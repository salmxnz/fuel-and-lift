import type { Metadata } from "next"
import { TemplateEditor } from "@/components/gym/template-editor"

export const metadata: Metadata = { title: "Template" }

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TemplateEditor id={id} />
}
