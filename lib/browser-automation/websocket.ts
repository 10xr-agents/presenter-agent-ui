/**
 * WebSocket client for real-time knowledge exploration updates
 * 
 * Connects to the Browser Automation Service WebSocket endpoint for
 * real-time progress updates without polling.
 */

import { env } from "@/env.mjs"

const DEFAULT_BASE_URL = "http://localhost:8000"

function getBaseUrl(): string {
  const url = env.BROWSER_AUTOMATION_SERVICE_URL || DEFAULT_BASE_URL
  // Convert http:// to ws:// and https:// to wss://
  if (url.startsWith("https://")) {
    return url.replace(/^https/, "wss")
  }
  return url.replace(/^http/, "ws")
}

export type WebSocketMessageType =
  | "connected"
  | "progress"
  | "page_completed"
  | "external_link_detected"
  | "error"
  | "completed"
  | "failed"
  | "cancelled"

export interface WebSocketMessage {
  type: WebSocketMessageType
  job_id: string
  data?: {
    status?: string
    completed?: number
    queued?: number
    failed?: number
    current_url?: string
    estimated_time_remaining?: number
    processing_rate?: number
    page?: {
      url: string
      title: string
      completed_at: string
    }
    error?: {
      url: string
      error: string
      error_type?: string
    }
  }
  timestamp?: number
}

export type WebSocketMessageHandler = (message: WebSocketMessage) => void

/**
 * Create a WebSocket connection for real-time knowledge exploration updates
 * 
 * @param jobId - The exploration job ID
 * @param onMessage - Callback for received messages
 * @param onError - Optional error callback
 * @returns WebSocket instance and cleanup function
 */
export function createKnowledgeWebSocket(
  jobId: string,
  onMessage: WebSocketMessageHandler,
  onError?: (error: Error) => void
): {
  ws: WebSocket
  close: () => void
} {
  const baseUrl = getBaseUrl()
  const wsUrl = `${baseUrl}/api/knowledge/explore/ws/${jobId}`

  const ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log(`WebSocket connected for job ${jobId}`)
  }

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as WebSocketMessage
      onMessage(message)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to parse message"
      console.error("WebSocket message parse error:", errorMessage)
      onError?.(new Error(errorMessage))
    }
  }

  ws.onerror = (error) => {
    console.error("WebSocket error:", error)
    onError?.(new Error("WebSocket connection error"))
  }

  ws.onclose = () => {
    console.log(`WebSocket closed for job ${jobId}`)
  }

  return {
    ws,
    close: () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    },
  }
}
