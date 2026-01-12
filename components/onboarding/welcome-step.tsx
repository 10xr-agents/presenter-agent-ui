"use client"

import { ArrowRight, Presentation, Sparkles, Users, Zap } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface WelcomeStepProps {
  onNext: () => void
}

const features = [
  {
    icon: Presentation,
    title: "Interactive Presentations",
    description: "Create AI-powered screen presentations that respond to viewer questions in real-time",
  },
  {
    icon: Zap,
    title: "Live Website Demos",
    description: "Demonstrate live websites while AI answers questions and guides viewers",
  },
  {
    icon: Sparkles,
    title: "AI-Powered",
    description: "Intelligent conversational AI that understands context and provides accurate responses",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Invite team members, track analytics, and manage presentations together",
  },
]

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Presentation className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold">Welcome to Screen Agent Platform</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Create intelligent, conversational screen presentations that respond to viewer questions
            in real-time while demonstrating live websites.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {features.map((feature) => {
          const Icon = feature.icon
          return (
            <Card key={feature.title}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">{feature.description}</CardDescription>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="rounded-lg border bg-muted/50 p-6">
        <h3 className="font-semibold mb-2">What you&apos;ll set up:</h3>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li>Invite team members (optional)</li>
          <li>Take a quick product tour</li>
          <li>Create your first Screen Agent</li>
        </ul>
      </div>

      <div className="flex justify-end gap-4">
        <Button type="button" onClick={onNext} size="lg">
          Get Started
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
