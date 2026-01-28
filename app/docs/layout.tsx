import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "API Documentation | Presenter Agent",
  description: "Interactive API documentation for the Presenter Agent API. Explore endpoints, schemas, and try requests directly from the browser.",
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
