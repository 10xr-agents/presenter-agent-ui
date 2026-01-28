/**
 * WebSocket wire protocol types for messaging APIs.
 * Used by the WebSocket server and client for real-time session messages.
 */

/** Client → server: subscribe to a session's message stream */
export interface WsClientSubscribe {
  type: "subscribe"
  sessionId: string
}

/** Client → server: ping for keepalive */
export interface WsClientPing {
  type: "ping"
}

export type WsClientMessage = WsClientSubscribe | WsClientPing

/** Server → client: new message or message update in a session */
export interface WsServerNewMessage {
  type: "new_message"
  sessionId: string
  message: WsMessagePayload
}

/** Server → client: interact response (assistant turn) when no Message doc is persisted yet */
export interface WsServerInteractResponse {
  type: "interact_response"
  sessionId: string
  data: {
    taskId?: string
    action?: string
    thought?: string
    status?: string
    currentStepIndex?: number
    verification?: unknown
    correction?: unknown
  }
}

/** Server → client: pong for keepalive */
export interface WsServerPong {
  type: "pong"
  timestamp: number
}

/** Server → client: error (auth, validation, etc.) */
export interface WsServerError {
  type: "error"
  code: string
  message: string
}

/** Server → client: subscribed confirmation */
export interface WsServerSubscribed {
  type: "subscribed"
  sessionId: string
}

export type WsServerMessage =
  | WsServerNewMessage
  | WsServerInteractResponse
  | WsServerPong
  | WsServerError
  | WsServerSubscribed

/** Message payload matching session message API shape (subset) */
export interface WsMessagePayload {
  messageId: string
  role: "user" | "assistant" | "system"
  content: string
  actionString?: string
  status?: "success" | "failure" | "pending"
  sequenceNumber: number
  timestamp: string
  domSummary?: string
  metadata?: Record<string, unknown>
}
