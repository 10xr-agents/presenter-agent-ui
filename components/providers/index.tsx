"use client"

import { type ReactNode } from "react"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { AnalyticsProvider } from "./analytics-provider"
import { AuthProvider } from "./auth-provider"

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      <AuthProvider>
        <AnalyticsProvider>
          {children}
          <Toaster position="top-right" richColors />
        </AnalyticsProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export { AuthProvider, useAuth } from "./auth-provider"
