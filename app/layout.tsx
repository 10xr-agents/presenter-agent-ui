import type { Metadata } from "next"
import { Poppins, Sofia_Sans_Extra_Condensed } from "next/font/google"
import { Providers } from "@/components/providers"
import "styles/tailwind.css"

// Primary font: Poppins (Semi Bold for headings, Regular for body)
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
})

// Accent font: Sofia Sans Extra Condensed (for labels, tags, decorative)
const sofiaSans = Sofia_Sans_Extra_Condensed({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-sofia",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Screen Agent Platform - Interactive AI-Powered Screen Presentations",
    template: "%s | Screen Agent Platform",
  },
  description:
    "Create, distribute, and analyze interactive AI-powered screen presentations. Deliver personalized, voice-guided walkthroughs for sales demos, customer onboarding, product training, and technical support.",
  keywords: [
    "screen presentations",
    "interactive demos",
    "AI presentations",
    "voice-guided tours",
    "product demos",
    "customer onboarding",
    "sales enablement",
    "screen agents",
  ],
  authors: [{ name: "Screen Agent Platform" }],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${sofiaSans.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
