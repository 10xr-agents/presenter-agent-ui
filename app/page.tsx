import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  
  // Redirect authenticated users to dashboard
  if (session) {
    redirect("/dashboard")
  }
  
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Image
              src="/logos/logo_7.svg"
              alt="Logo"
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <span className="text-xl font-semibold">Screen Agent</span>
          </div>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Create Interactive{" "}
          <span className="bg-gradient-to-r from-[#559EFF] to-[#0065BA] bg-clip-text text-transparent">
            Screen Presentations
          </span>{" "}
          with AI
        </h1>
        <p className="mb-8 max-w-2xl text-lg text-muted-foreground">
          Build intelligent, conversational screen presentations that respond to viewer
          questions in real-time. Perfect for sales demos, customer onboarding,
          product training, and technical support.
        </p>
        <div className="flex gap-4">
          <Button size="lg" asChild>
            <Link href="/register">Get Started</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <p>
          &copy; {new Date().getFullYear()} Screen Agent Platform. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
