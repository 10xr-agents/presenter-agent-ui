import { redirect } from "next/navigation"
import { PresentationInterface } from "@/components/presentations/presentation-interface"
import { generateLiveKitToken } from "@/lib/presentations/livekit"
import { getSessionByToken } from "@/lib/presentations/session-manager"

interface PresentationPageProps {
  params: Promise<{ token: string }>
}

/**
 * Presentation Viewer Page
 * 
 * No-auth presentation access page. Viewers can access presentations
 * using a shareable token without requiring authentication.
 * 
 * This page:
 * 1. Validates the presentation token
 * 2. Creates or retrieves the presentation session
 * 3. Generates LiveKit viewer token
 * 4. Renders the presentation interface
 */
export default async function PresentationPage({ params }: PresentationPageProps) {
  const { token } = await params

  try {
    // Get presentation session
    const session = await getSessionByToken(token)

    if (!session) {
      redirect("/")
    }

    // Check if session is still active
    if (session.completionStatus === "completed" || session.completionStatus === "error") {
      redirect("/")
    }

    // Generate LiveKit viewer token
    const viewerToken = await generateLiveKitToken({
      roomName: session.liveKitRoomId,
      participantName: session.viewerInfo?.name || "Viewer",
      participantIdentity: session.viewerInfo?.email || `viewer_${session._id.toString()}`,
      permissions: {
        canPublish: false,
        canSubscribe: true,
        canPublishData: false,
      },
    })

    // Get LiveKit URL (placeholder - should come from env)
    const liveKitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://localhost:7880"

    return (
      <PresentationInterface
        token={viewerToken}
        url={liveKitUrl}
        screenAgentId={session.screenAgentId}
        sessionToken={session.sessionToken}
      />
    )
  } catch (error: unknown) {
    console.error("Presentation page error:", error)
    redirect("/")
  }
}
