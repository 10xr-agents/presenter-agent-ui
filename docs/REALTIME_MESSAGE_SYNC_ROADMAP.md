# Real-Time Message Sync Roadmap (WebSocket Push-Based Retrieval)

**Document Version:** 1.5  
**Last Updated:** January 28, 2026  
**Status:** Backend complete (Sockudo-only); client integration with backend pending  
**Purpose:** Roadmap for migrating from poll-based to push-based message retrieval using WebSockets

**Changelog (1.5):** **Sockudo-only backend.** No raw WebSocket or in-process server; no `GET /api/ws/token` or `pnpm ws`. Added **Client-side changes required (summary)** with a concise checklist. Clarified that the extension must use a **Pusher transport** (pusher-js) to connect; existing raw WebSocket service cannot talk to the current server. Removed optional "dual path" from Client TODO; backend is Sockudo only.

**Changelog (1.4):** **Server implementation complete.** Backend uses **Sockudo** (Pusher protocol) on **port 3005** with Next.js as trigger + auth. Added **Section 11.11 (Server Implementation Summary)**, **Protocol Mapping** table (server events ↔ client expectations), and **Client (Chrome Extension) TODO List** for finishing extension-side integration.

**Changelog (1.3):** Added **Implementation Progress** section (client completion summary, test coverage, remaining work). Expanded **Backend Requirements** (Section 11) for Next.js: WebSocket hosting options, auth, session subscription, message protocol (no code snippets), heartbeat, errors, scaling, and CORS for the extension.

**Changelog (1.2):** ✅ **IMPLEMENTED** Task 7 (Testing & Verification): Unit tests for WebSocket Service (lifecycle, reconnect, fallback, message handling, persist/restore), Message Sync Manager (dedup, ordering, state updates), Polling Fallback Service (start/stop, merge, sort). Added `jest.config.js` so tests run without ts-node. Backend WebSocket endpoint remains pending.

**Changelog (1.1):** ✅ **IMPLEMENTED** Client-side Tasks 1-6: WebSocket Service, Connection Management, Message Event Handling, Message Sync Manager, Polling Fallback, UI Integration (ConnectionStatusBadge, TypingIndicator). Backend WebSocket endpoint and Task 7 (Testing) remained pending.

**Changelog (1.0):** Initial document creation. Migrated from `CHAT_FLOW_VERIFICATION.md` (now archived). Added comprehensive implementation plan for WebSocket-based real-time message synchronization.

---

## Implementation Progress

**Backend (Next.js) — complete.** Real-time messaging uses **Sockudo only** (Pusher protocol) on **port 3005**. There is no raw WebSocket endpoint, no in-process server, and no `GET /api/ws/token`. See Section 11.11 and **Client-side changes required (summary)** below.

**Client (extension) — partial.** Tasks 1–7 (WebSocket service, Message Sync Manager, polling fallback, UI) are implemented for a **raw WebSocket** protocol. The **current server speaks only Sockudo/Pusher**, so the extension must add a **Pusher-based transport** and event mapping; the existing raw WebSocket service cannot connect to this backend. See **Client-side changes required (summary)** and **Client (Chrome Extension) TODO List** (§ after Section 11).

| Area | Status | Notes |
|------|--------|-------|
| **Tasks 1–3** | ✅ Done | WebSocket service, connection lifecycle, reconnection with backoff, heartbeat, typed message events (newMessage, messageUpdate, sessionUpdate, typing, stateChange, fallback). |
| **Task 4** | ✅ Done | Message Sync Manager: subscribes to WS events, applies new/updated messages to Zustand with dedup by ID and sort by sequenceNumber, updates connection state and typing. |
| **Task 5** | ✅ Done | Polling fallback: adaptive intervals (3s active, 30s idle), start/stop, merge into store with dedup and sort. |
| **Task 6** | ✅ Done | ConnectionStatusBadge (Connected / Connecting / Reconnecting / Polling / Disconnected / Offline), TypingIndicator, TaskUI wiring (startSync/stopSync, visibility-based reconnect). |
| **Task 7** | ✅ Done | Unit tests: websocketService (11), messageSyncService (6), pollingFallbackService (4). Total 28 tests across 5 suites; `yarn test` uses `jest.config.js`. |
| **Backend** | ✅ Done | Sockudo (Pusher) on port 3005, Next.js trigger + `/api/pusher/auth`. Events: `new_message`, `interact_response`. See §11.11. |
| **Client ↔ Backend** | ⏳ Pending | Extension must add Pusher/Sockudo transport and event mapping; see **Client TODO List** below. |
| **Manual QA** | ⏳ Pending | Checklist in Section 10.1 (badge states, typing, session switch, etc.). |

**Deliverables in repo:** `websocketService.ts`, `websocketTypes.ts`, `messageSyncService.ts`, `pollingFallbackService.ts`, `ConnectionStatusBadge.tsx`, `TypingIndicator.tsx`, three test files, `jest.config.js`; changes in `currentTask.ts`, `store.ts`, `TaskUI.tsx`, `webpack.config.js`.

---

### Client-side changes required (summary)

The server exposes **only Sockudo (Pusher protocol)** on port 3005. The extension cannot use the existing raw WebSocket flow (`GET /api/ws/token` + `ws://...?token=...` + SUBSCRIBE) because that API and server path have been removed. The following client changes are required:

| What | Action |
|------|--------|
| **Transport** | Add a **Pusher-based transport** (e.g. `pusher-js`): connect to Sockudo with `wsHost`, `wsPort: 3005`, `authEndpoint: '/api/pusher/auth'`. Subscribe to channel `private-session-<sessionId>`. Do **not** use `GET /api/ws/token` or a raw WebSocket URL. |
| **Auth** | When subscribing to a private channel, Pusher will call `POST /api/pusher/auth` with form data `socket_id`, `channel_name`. Send the same Bearer token used for REST (e.g. `auth: { headers: { Authorization: 'Bearer ' + accessToken } }` in pusher-js). Ensure CORS allows the extension origin for that endpoint. |
| **Events** | Bind to Pusher events **`new_message`** and **`interact_response`**. Map `new_message` payload `{ type, sessionId, message }` to the client’s `ChatMessage` (e.g. `id` ← `message.messageId`) and feed into Message Sync Manager. Handle `interact_response` as assistant turn (update store or refresh from REST). |
| **Connection state** | Drive ConnectionStatusBadge from Pusher connection state. Keep polling fallback when Pusher is unavailable. |
| **Env / build** | Set `PUSHER_KEY`, `PUSHER_WS_HOST`, `PUSHER_WS_PORT` (3005) in extension env; inject into webpack (e.g. `WEBPACK_PUSHER_*`) so the transport uses the correct Sockudo URL. |

**Deprecated / removed on server:** Raw WebSocket endpoint, `GET /api/ws/token`, in-process WebSocket server, `pnpm ws` script, `WS_PORT` / `NEXT_PUBLIC_WS_URL`. The extension must **not** rely on these.

---

**This document covers:**
- Current poll-based architecture analysis
- WebSocket implementation roadmap (Tasks 1-7)
- Backend requirements and API specifications (Next.js-oriented)
- Fallback mechanisms and error handling
- Testing and verification procedures

**Sync:** This document is the **complete client-side implementation roadmap** for real-time message sync. Backend WebSocket requirements are in Section 11 (Backend Requirements). Keep in sync with `THIN_CLIENT_ROADMAP.md` and `CHAT_PERSISTENCE_SPEC.md` (if created).

**Counterpart:** Server-side WebSocket implementation should be tracked separately. Tasks are **sequential**; client and server work for a given task ship together for end-to-end verification.

---

## Table of Contents

- [Implementation Progress](#implementation-progress) (client status, backend status, **client-side changes summary**)
1. [Overview](#1-overview)
2. [Current Architecture Analysis](#2-current-architecture-analysis)
3. [Target Architecture](#3-target-architecture)
4. [Task 1: WebSocket Service Foundation](#4-task-1-websocket-service-foundation)
5. [Task 2: Connection Management](#5-task-2-connection-management)
6. [Task 3: Message Event Handling](#6-task-3-message-event-handling)
7. [Task 4: Zustand Store Integration](#7-task-4-zustand-store-integration)
8. [Task 5: Polling Fallback System](#8-task-5-polling-fallback-system)
9. [Task 6: UI Integration & Status Indicators](#9-task-6-ui-integration--status-indicators)
10. [Task 7: Testing & Verification](#10-task-7-testing--verification)
11. [Backend Requirements](#11-backend-requirements) — includes §11.11 (Server Implementation Summary), Protocol Mapping, and **Client (Chrome Extension) TODO List**
12. [Implementation Checklist](#12-implementation-checklist)
13. [Architecture Status Summary](#13-architecture-status-summary)

---

## 1. Overview

### 1.1 Problem Statement

The current chat system uses **on-demand fetching** (not true polling) for message retrieval:

1. `loadMessages(sessionId)` fetches from `GET /api/session/${sessionId}/messages`
2. Called when: selecting a session, after task completion, or when resuming
3. No real-time updates — users must manually refresh or wait for actions to complete
4. Multiple components may trigger redundant API calls
5. No awareness of messages added by other devices/tabs

### 1.2 Solution: Push-Based Architecture

Implement **WebSocket-based real-time message sync** with polling fallback:

1. **Primary:** WebSocket connection for instant message push
2. **Fallback:** Polling when WebSocket unavailable (network issues, server limitations)
3. **Hybrid:** Initial load via REST API, then WebSocket for real-time updates

### 1.3 Principles

- **Vertical slices:** Each task delivers a complete feature. No standalone "WebSocket-only" or "UI-only" phases.
- **Strict sequencing:** Task 2 depends on Task 1 (service foundation). Task 4 depends on Task 3 (event handling).
- **Graceful degradation:** System must work with polling fallback if WebSocket fails.
- **Chrome Extension context:** All implementations must work within Manifest V3 service worker constraints.

### 1.4 Prerequisites

- Thin Client implementation complete (Tasks 1-3 from `THIN_CLIENT_ROADMAP.md`)
- Chat persistence working (`loadMessages`, `saveMessages` in `currentTask.ts`)
- Backend WebSocket endpoint available (see Section 11)
- CORS/WebSocket origin allowed for `chrome-extension://<id>`

---

## 2. Current Architecture Analysis

### 2.1 Message Flow (Current)

```
┌─────────────────┐    REST API       ┌──────────────────┐
│  Chrome Ext     │ ────────────────→ │   Backend        │
│  (UI/State)     │    GET /messages  │   (MongoDB)      │
└─────────────────┘ ←──────────────── └──────────────────┘
        ↓                                     ↓
   loadMessages()                      Return messages
        ↓                                     
   Zustand State                       
        ↓                              
   UI re-renders                       
```

**Current Implementation Files:**
- `src/state/currentTask.ts` — `loadMessages()`, `saveMessages()`, message state
- `src/api/client.ts` — `getSessionMessages()` REST API call
- `src/common/TaskHistoryUser.tsx` — Message display component
- `src/types/chatMessage.ts` — Message types

### 2.2 Current Limitations

| Limitation | Impact | Severity |
|------------|--------|----------|
| No real-time updates | Users don't see new messages until refresh | High |
| Redundant API calls | Multiple components may trigger same fetch | Medium |
| No cross-tab sync | Messages added in one tab not visible in another | Medium |
| No typing indicators | No awareness of server processing state | Low |
| Poll-on-demand only | Must explicitly trigger message load | High |

### 2.3 Message Loading State (Current)

```typescript
// src/state/currentTask.ts
messagesLoadingState: {
  isLoading: boolean;
  lastAttemptSessionId: string | null;
  lastAttemptTime: number | null;
  error: string | null;
  retryCount: number;
}
```

This state includes rate limiting and deduplication, which will be preserved and enhanced for WebSocket.

---

## 3. Target Architecture

### 3.1 Message Flow (Target)

```
┌─────────────────┐                          ┌──────────────────┐
│  Chrome Ext     │ ←─── WebSocket ─────────→│   Backend        │
│  (UI/State)     │    bidirectional         │   (ws server)    │
└─────────────────┘                          └──────────────────┘
        ↓                                            ↓
   WebSocket Service                          Message saved
        ↓                                            ↓
   Event Emitter                              Push to connected
        ↓                                     clients via WS
   Zustand State                              
        ↓                                     
   UI re-renders                              
```

### 3.2 Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │  WebSocket      │    │  Message Sync   │                 │
│  │  Service        │───→│  Manager        │                 │
│  │  (connection)   │    │  (coordination) │                 │
│  └─────────────────┘    └─────────────────┘                 │
│           │                      │                           │
│           ↓                      ↓                           │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │  Event Emitter  │    │  Polling        │                 │
│  │  (events)       │    │  Fallback       │                 │
│  └─────────────────┘    └─────────────────┘                 │
│           │                      │                           │
│           └──────────┬───────────┘                           │
│                      ↓                                       │
│           ┌─────────────────┐                               │
│           │  Zustand Store  │                               │
│           │  (currentTask)  │                               │
│           └─────────────────┘                               │
│                      │                                       │
│                      ↓                                       │
│           ┌─────────────────┐                               │
│           │  UI Components  │                               │
│           │  (TaskHistory)  │                               │
│           └─────────────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 WebSocket Message Types

```typescript
// Inbound (Server → Client)
interface WSInboundMessage {
  type: 'NEW_MESSAGE' | 'MESSAGE_UPDATE' | 'SESSION_UPDATE' | 'TYPING' | 'PONG' | 'ERROR';
  sessionId: string;
  payload: unknown;
  timestamp: string; // ISO 8601
}

// Outbound (Client → Server)
interface WSOutboundMessage {
  type: 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'PING' | 'ACK';
  sessionId?: string;
  payload?: unknown;
}
```

### 3.4 Connection States

```typescript
type ConnectionState = 
  | 'disconnected'     // Initial state, no connection
  | 'connecting'       // Attempting to connect
  | 'connected'        // WebSocket open and authenticated
  | 'reconnecting'     // Lost connection, attempting to reconnect
  | 'failed'           // Max retries exceeded, using fallback
  | 'fallback';        // Using polling (WebSocket unavailable)
```

---

## 4. Task 1: WebSocket Service Foundation

**Objective:** Create the core WebSocket service class with connection establishment, authentication, and basic event handling. This is the foundation for all real-time communication.

**Deliverable:** WebSocket service that can connect to backend, authenticate with Bearer token, and receive messages. No Zustand integration yet.

**Prerequisites:** Backend WebSocket endpoint available (`ws://api.example.com/ws/session/:sessionId`).

---

### 4.1 Extension Integration (Task 1)

**Implementation Details:**

- **File Location:** `src/services/websocketService.ts`

- **Service Class:**
```typescript
/**
 * WebSocket Service for Real-Time Message Sync
 * 
 * Handles WebSocket connection lifecycle, authentication, and message routing.
 * Uses event emitter pattern for loose coupling with Zustand store.
 * 
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §4 (Task 1)
 */

import { EventEmitter } from 'events';

// WebSocket base URL (from environment or derived from API_BASE)
const WS_BASE_URL = (process.env.WEBPACK_WS_BASE || process.env.WEBPACK_API_BASE || 'wss://api.example.com')
  .replace(/^http/, 'ws')
  .replace(/\/$/, '');

export type ConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'fallback';

export interface WSInboundMessage {
  type: 'NEW_MESSAGE' | 'MESSAGE_UPDATE' | 'SESSION_UPDATE' | 'TYPING' | 'PONG' | 'ERROR';
  sessionId: string;
  payload: unknown;
  timestamp: string;
}

export interface WSOutboundMessage {
  type: 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'PING' | 'ACK';
  sessionId?: string;
  payload?: unknown;
}

class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private currentSessionId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectBaseDelay = 1000; // 1 second
  private reconnectMaxDelay = 30000; // 30 seconds
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  
  constructor() {
    super();
    this.setMaxListeners(20); // Allow multiple listeners
  }
  
  /**
   * Get auth token from chrome.storage.local
   */
  private async getToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get('accessToken');
      return result.accessToken || null;
    } catch (error) {
      console.error('[WebSocketService] Error reading token:', error);
      return null;
    }
  }
  
  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }
  
  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }
  
  /**
   * Connect to WebSocket for a session
   */
  async connect(sessionId: string): Promise<void> {
    if (this.connectionState === 'connected' && this.currentSessionId === sessionId) {
      console.debug('[WebSocketService] Already connected to session:', sessionId);
      return;
    }
    
    // Disconnect from previous session if different
    if (this.currentSessionId && this.currentSessionId !== sessionId) {
      await this.disconnect();
    }
    
    const token = await this.getToken();
    if (!token) {
      console.error('[WebSocketService] No auth token available');
      this.setConnectionState('failed');
      this.emit('error', { code: 'NO_TOKEN', message: 'No authentication token' });
      return;
    }
    
    this.currentSessionId = sessionId;
    this.setConnectionState('connecting');
    
    try {
      // Build WebSocket URL with token in query param (common pattern for WS auth)
      const wsUrl = `${WS_BASE_URL}/ws/session/${sessionId}?token=${encodeURIComponent(token)}`;
      
      console.log('[WebSocketService] Connecting to:', wsUrl.replace(token, '***'));
      
      this.ws = new WebSocket(wsUrl);
      
      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.connectionState === 'connecting') {
          console.warn('[WebSocketService] Connection timeout');
          this.ws?.close();
          this.handleConnectionFailure();
        }
      }, 10000); // 10 second timeout
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      
    } catch (error) {
      console.error('[WebSocketService] Connection error:', error);
      this.handleConnectionFailure();
    }
  }
  
  /**
   * Disconnect WebSocket
   */
  async disconnect(): Promise<void> {
    this.clearTimers();
    
    if (this.ws) {
      // Send unsubscribe before closing
      if (this.connectionState === 'connected' && this.currentSessionId) {
        this.send({ type: 'UNSUBSCRIBE', sessionId: this.currentSessionId });
      }
      
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.currentSessionId = null;
    this.reconnectAttempts = 0;
    this.setConnectionState('disconnected');
    this.emit('disconnected');
  }
  
  /**
   * Send message to server
   */
  send(message: WSOutboundMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocketService] Cannot send, not connected');
      return false;
    }
    
    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[WebSocketService] Send error:', error);
      return false;
    }
  }
  
  /**
   * Update connection state and emit event
   */
  private setConnectionState(state: ConnectionState): void {
    const previousState = this.connectionState;
    this.connectionState = state;
    
    if (previousState !== state) {
      this.emit('stateChange', { previousState, currentState: state });
    }
  }
  
  /**
   * Handle WebSocket open
   */
  private handleOpen(): void {
    console.log('[WebSocketService] Connected');
    
    this.clearTimers();
    this.reconnectAttempts = 0;
    this.setConnectionState('connected');
    
    // Subscribe to session
    if (this.currentSessionId) {
      this.send({ type: 'SUBSCRIBE', sessionId: this.currentSessionId });
    }
    
    // Start heartbeat
    this.startHeartbeat();
    
    this.emit('connected', { sessionId: this.currentSessionId });
  }
  
  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WSInboundMessage = JSON.parse(event.data);
      
      // Handle pong (heartbeat response)
      if (message.type === 'PONG') {
        this.handlePong();
        return;
      }
      
      // Emit typed event
      this.emit(message.type.toLowerCase(), message);
      
      // Also emit generic 'message' for logging/debugging
      this.emit('message', message);
      
    } catch (error) {
      console.error('[WebSocketService] Failed to parse message:', error);
    }
  }
  
  /**
   * Handle WebSocket close
   */
  private handleClose(event: CloseEvent): void {
    console.log('[WebSocketService] Connection closed:', event.code, event.reason);
    
    this.clearTimers();
    this.ws = null;
    
    // Don't reconnect on clean close or auth failure
    if (event.code === 1000 || event.code === 4001) {
      this.setConnectionState('disconnected');
      this.emit('disconnected', { code: event.code, reason: event.reason });
      return;
    }
    
    // Attempt reconnection
    this.handleConnectionFailure();
  }
  
  /**
   * Handle WebSocket error
   */
  private handleError(event: Event): void {
    console.error('[WebSocketService] WebSocket error:', event);
    this.emit('error', { code: 'WS_ERROR', message: 'WebSocket error' });
  }
  
  /**
   * Handle connection failure with exponential backoff
   */
  private handleConnectionFailure(): void {
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.warn('[WebSocketService] Max reconnect attempts exceeded, switching to fallback');
      this.setConnectionState('fallback');
      this.emit('fallback', { reason: 'Max reconnect attempts exceeded' });
      return;
    }
    
    this.setConnectionState('reconnecting');
    
    // Exponential backoff with jitter
    const delay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000,
      this.reconnectMaxDelay
    );
    
    console.log(`[WebSocketService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.currentSessionId && this.connectionState === 'reconnecting') {
        this.connect(this.currentSessionId);
      }
    }, delay);
    
    this.emit('reconnecting', { attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts, delay });
  }
  
  /**
   * Start heartbeat (ping/pong)
   */
  private startHeartbeat(): void {
    // Send ping every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'PING' });
        
        // Set timeout for pong response
        this.heartbeatTimeout = setTimeout(() => {
          console.warn('[WebSocketService] Heartbeat timeout, reconnecting');
          this.ws?.close(4000, 'Heartbeat timeout');
        }, 5000); // 5 second timeout for pong
      }
    }, 30000);
  }
  
  /**
   * Handle pong response
   */
  private handlePong(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }
  
  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }
}

// Singleton instance
export const wsService = new WebSocketService();
```

- **Environment Configuration:** Update `webpack.config.js` to inject `WEBPACK_WS_BASE`:
```javascript
new webpack.DefinePlugin({
  'process.env.WEBPACK_API_BASE': JSON.stringify(process.env.API_BASE || 'https://api.example.com'),
  'process.env.WEBPACK_WS_BASE': JSON.stringify(process.env.WS_BASE || 'wss://api.example.com'),
}),
```

---

### 4.2 Definition of Done / QA Verification (Task 1)

- [ ] `WebSocketService` class created with connection management. ⏳ **PENDING**
- [ ] Token-based authentication via query parameter. ⏳ **PENDING**
- [ ] Connection states properly tracked and emitted. ⏳ **PENDING**
- [ ] Heartbeat (ping/pong) implemented with 30s interval. ⏳ **PENDING**
- [ ] Event emitter pattern for message routing. ⏳ **PENDING**
- [ ] Environment configuration updated (`WEBPACK_WS_BASE`). ⏳ **PENDING**
- [ ] Unit tests for connection lifecycle. ⏳ **PENDING**

**Implementation Status:**
- [ ] `src/services/websocketService.ts` created
- [ ] Types exported (`ConnectionState`, `WSInboundMessage`, `WSOutboundMessage`)
- [ ] Singleton instance exported (`wsService`)
- [ ] `webpack.config.js` updated with `WEBPACK_WS_BASE`

**Exit criterion:** Task 1 complete when WebSocket can connect, authenticate, and receive messages. Proceed to Task 2 only after sign-off.

**Status:** ⏳ **PENDING**

---

## 5. Task 2: Connection Management

**Objective:** Implement robust connection management including reconnection logic, exponential backoff, session switching, and Chrome Extension service worker lifecycle handling.

**Deliverable:** WebSocket service with reliable connection that survives network issues, tab switches, and service worker restarts.

**Prerequisites:** Task 1 complete (WebSocket Service Foundation).

---

### 5.1 Extension Integration (Task 2)

**Implementation Details:**

- **Reconnection Strategy:**
  - Max 5 reconnection attempts
  - Exponential backoff: 1s → 2s → 4s → 8s → 16s (capped at 30s)
  - Jitter added to prevent thundering herd
  - After max attempts, switch to polling fallback

- **Session Switching:**
  - When user switches sessions, gracefully disconnect from old session
  - Send `UNSUBSCRIBE` before closing
  - Connect to new session with fresh state

- **Service Worker Lifecycle:**
  - Service workers can be terminated by Chrome
  - On termination, connection is lost (expected)
  - On popup reopen, check connection state and reconnect if needed
  - Store last connected sessionId for auto-reconnect

- **Chrome Storage Integration:**
```typescript
// Store connection state for recovery
interface WSConnectionState {
  sessionId: string | null;
  lastConnectedAt: number | null;
  wasConnected: boolean;
}

// In WebSocketService
async persistState(): Promise<void> {
  const state: WSConnectionState = {
    sessionId: this.currentSessionId,
    lastConnectedAt: this.connectionState === 'connected' ? Date.now() : null,
    wasConnected: this.connectionState === 'connected',
  };
  await chrome.storage.local.set({ wsConnectionState: state });
}

async restoreState(): Promise<WSConnectionState | null> {
  const result = await chrome.storage.local.get('wsConnectionState');
  return result.wsConnectionState || null;
}
```

- **Visibility-Based Connection:**
```typescript
// In component that uses WebSocket
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && sessionId) {
      // Reconnect if needed
      if (wsService.getConnectionState() !== 'connected') {
        wsService.connect(sessionId);
      }
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [sessionId]);
```

---

### 5.2 Definition of Done / QA Verification (Task 2)

- [ ] Exponential backoff with jitter implemented. ⏳ **PENDING**
- [ ] Max 5 reconnection attempts before fallback. ⏳ **PENDING**
- [ ] Session switching works gracefully. ⏳ **PENDING**
- [ ] Connection state persisted to chrome.storage. ⏳ **PENDING**
- [ ] Auto-reconnect on visibility change. ⏳ **PENDING**
- [ ] Service worker restart handled. ⏳ **PENDING**

**Exit criterion:** Task 2 complete when connection is resilient to network issues and tab/session switches.

**Status:** ⏳ **PENDING**

---

## 6. Task 3: Message Event Handling

**Objective:** Implement handlers for all WebSocket message types (`NEW_MESSAGE`, `MESSAGE_UPDATE`, `SESSION_UPDATE`, `TYPING`, `ERROR`).

**Deliverable:** All message types properly parsed, validated, and emitted as typed events.

**Prerequisites:** Task 2 complete (Connection Management).

---

### 6.1 Extension Integration (Task 3)

**Implementation Details:**

- **Message Type Definitions:**
```typescript
// src/services/websocketTypes.ts

import type { ChatMessage } from '../types/chatMessage';

/**
 * NEW_MESSAGE payload - New message added to session
 */
export interface NewMessagePayload {
  message: ChatMessage;
  sequenceNumber: number;
}

/**
 * MESSAGE_UPDATE payload - Existing message status changed
 */
export interface MessageUpdatePayload {
  messageId: string;
  status: ChatMessage['status'];
  error?: { message: string; code: string };
  updatedAt: string;
}

/**
 * SESSION_UPDATE payload - Session state changed
 */
export interface SessionUpdatePayload {
  sessionId: string;
  status: 'active' | 'completed' | 'failed' | 'interrupted';
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * TYPING payload - Server is processing (typing indicator)
 */
export interface TypingPayload {
  sessionId: string;
  isTyping: boolean;
  context?: string; // e.g., "thinking", "executing", "verifying"
}

/**
 * ERROR payload - Server error
 */
export interface ErrorPayload {
  code: string;
  message: string;
  sessionId?: string;
}
```

- **Type-Safe Event Handlers:**
```typescript
// In WebSocketService

private handleTypedMessage(message: WSInboundMessage): void {
  switch (message.type) {
    case 'NEW_MESSAGE':
      this.handleNewMessage(message.payload as NewMessagePayload);
      break;
    case 'MESSAGE_UPDATE':
      this.handleMessageUpdate(message.payload as MessageUpdatePayload);
      break;
    case 'SESSION_UPDATE':
      this.handleSessionUpdate(message.payload as SessionUpdatePayload);
      break;
    case 'TYPING':
      this.handleTyping(message.payload as TypingPayload);
      break;
    case 'ERROR':
      this.handleServerError(message.payload as ErrorPayload);
      break;
  }
}

private handleNewMessage(payload: NewMessagePayload): void {
  // Validate payload
  if (!payload.message || !payload.message.id) {
    console.warn('[WebSocketService] Invalid NEW_MESSAGE payload');
    return;
  }
  
  // Convert timestamp string to Date if needed
  const message: ChatMessage = {
    ...payload.message,
    timestamp: payload.message.timestamp instanceof Date 
      ? payload.message.timestamp 
      : new Date(payload.message.timestamp),
    sequenceNumber: payload.sequenceNumber,
  };
  
  this.emit('newMessage', message);
}
```

---

### 6.2 Definition of Done / QA Verification (Task 3)

- [ ] All message types defined with TypeScript interfaces. ⏳ **PENDING**
- [ ] Type-safe event handlers implemented. ⏳ **PENDING**
- [ ] Payload validation before emission. ⏳ **PENDING**
- [ ] Timestamp conversion handled. ⏳ **PENDING**
- [ ] Error events properly routed. ⏳ **PENDING**

**Exit criterion:** Task 3 complete when all message types are properly handled and emitted.

**Status:** ⏳ **PENDING**

---

## 7. Task 4: Zustand Store Integration

**Objective:** Connect WebSocket events to Zustand store for automatic state updates. Messages received via WebSocket should update `currentTask.messages` and trigger UI re-renders.

**Deliverable:** Real-time message updates reflected in Zustand state and UI.

**Prerequisites:** Task 3 complete (Message Event Handling).

---

### 7.1 Extension Integration (Task 4)

**Implementation Details:**

- **Message Sync Manager:**
```typescript
// src/services/messageSyncService.ts

import { wsService } from './websocketService';
import type { ChatMessage } from '../types/chatMessage';

/**
 * Message Sync Manager
 * 
 * Coordinates between WebSocket service and Zustand store.
 * Handles message deduplication, ordering, and state updates.
 * 
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §7 (Task 4)
 */
class MessageSyncManager {
  private isInitialized = false;
  private getState: (() => any) | null = null;
  private setState: ((fn: (state: any) => void) => void) | null = null;
  
  /**
   * Initialize with Zustand store accessors
   * Called once when store is created
   */
  initialize(
    getState: () => any,
    setState: (fn: (state: any) => void) => void
  ): void {
    if (this.isInitialized) return;
    
    this.getState = getState;
    this.setState = setState;
    
    // Set up WebSocket event listeners
    wsService.on('newMessage', this.handleNewMessage.bind(this));
    wsService.on('message_update', this.handleMessageUpdate.bind(this));
    wsService.on('session_update', this.handleSessionUpdate.bind(this));
    wsService.on('typing', this.handleTyping.bind(this));
    wsService.on('stateChange', this.handleConnectionStateChange.bind(this));
    wsService.on('fallback', this.handleFallback.bind(this));
    
    this.isInitialized = true;
    console.log('[MessageSyncManager] Initialized');
  }
  
  /**
   * Start syncing for a session
   */
  async startSync(sessionId: string): Promise<void> {
    try {
      await wsService.connect(sessionId);
    } catch (error) {
      console.warn('[MessageSyncManager] WebSocket connect failed, using fallback');
      // Fallback handled by wsService
    }
  }
  
  /**
   * Stop syncing
   */
  async stopSync(): Promise<void> {
    await wsService.disconnect();
  }
  
  /**
   * Handle new message from WebSocket
   */
  private handleNewMessage(message: ChatMessage): void {
    if (!this.setState || !this.getState) return;
    
    const state = this.getState();
    const currentSessionId = state.currentTask.sessionId;
    
    // Ignore messages for different sessions
    if (message.sessionId && message.sessionId !== currentSessionId) {
      return;
    }
    
    this.setState((draft: any) => {
      const messages = draft.currentTask.messages;
      
      // Deduplicate by message ID
      const existingIndex = messages.findIndex((m: ChatMessage) => m.id === message.id);
      
      if (existingIndex === -1) {
        // New message - add and sort
        messages.push(message);
        
        // Sort by sequenceNumber (if available) or timestamp
        messages.sort((a: ChatMessage, b: ChatMessage) => {
          if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
            return a.sequenceNumber - b.sequenceNumber;
          }
          const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
          const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
          return timeA - timeB;
        });
        
        console.log('[MessageSyncManager] Added new message:', message.id);
      } else {
        // Message exists - update it (e.g., status change)
        messages[existingIndex] = { ...messages[existingIndex], ...message };
        console.log('[MessageSyncManager] Updated existing message:', message.id);
      }
    });
  }
  
  /**
   * Handle message status update from WebSocket
   */
  private handleMessageUpdate(payload: { messageId: string; status: string; error?: any }): void {
    if (!this.setState) return;
    
    this.setState((draft: any) => {
      const message = draft.currentTask.messages.find((m: ChatMessage) => m.id === payload.messageId);
      if (message) {
        message.status = payload.status;
        if (payload.error) {
          message.error = payload.error;
        }
      }
    });
  }
  
  /**
   * Handle session update from WebSocket
   */
  private handleSessionUpdate(payload: { sessionId: string; status: string }): void {
    if (!this.setState || !this.getState) return;
    
    const state = this.getState();
    if (state.currentTask.sessionId === payload.sessionId) {
      // Update session status in sessions state
      this.getState().sessions.actions.updateSession(payload.sessionId, {
        status: payload.status,
        updatedAt: Date.now(),
      });
    }
  }
  
  /**
   * Handle typing indicator from WebSocket
   */
  private handleTyping(payload: { isTyping: boolean; context?: string }): void {
    if (!this.setState) return;
    
    this.setState((draft: any) => {
      draft.currentTask.isServerTyping = payload.isTyping;
      draft.currentTask.serverTypingContext = payload.context || null;
    });
  }
  
  /**
   * Handle connection state change
   */
  private handleConnectionStateChange(payload: { currentState: string }): void {
    if (!this.setState) return;
    
    this.setState((draft: any) => {
      draft.currentTask.wsConnectionState = payload.currentState;
    });
  }
  
  /**
   * Handle fallback to polling
   */
  private handleFallback(): void {
    console.log('[MessageSyncManager] Switched to polling fallback');
    // Polling will be handled by PollingFallbackService (Task 5)
  }
}

export const messageSyncManager = new MessageSyncManager();
```

- **Zustand Store Updates:**
```typescript
// Add to src/state/currentTask.ts

export type CurrentTaskSlice = {
  // ... existing fields ...
  
  // WebSocket connection state
  wsConnectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'fallback';
  
  // Server typing indicator
  isServerTyping: boolean;
  serverTypingContext: string | null; // e.g., "thinking", "executing"
  
  // ... existing fields ...
};

// Initialize message sync manager in store creation
// In src/state/store.ts, after store is created:
messageSyncManager.initialize(
  useAppState.getState,
  useAppState.setState
);
```

---

### 7.2 Definition of Done / QA Verification (Task 4)

- [ ] `MessageSyncManager` created and connected to Zustand. ⏳ **PENDING**
- [ ] New messages automatically added to state. ⏳ **PENDING**
- [ ] Message deduplication by ID. ⏳ **PENDING**
- [ ] Messages sorted by sequenceNumber/timestamp. ⏳ **PENDING**
- [ ] Message status updates reflected in state. ⏳ **PENDING**
- [ ] Connection state exposed in Zustand. ⏳ **PENDING**
- [ ] Typing indicator state added. ⏳ **PENDING**

**Exit criterion:** Task 4 complete when WebSocket messages automatically update UI.

**Status:** ⏳ **PENDING**

---

## 8. Task 5: Polling Fallback System

**Objective:** Implement polling fallback when WebSocket is unavailable or fails. This ensures message sync works even when WebSocket cannot connect.

**Deliverable:** Automatic fallback to polling with configurable intervals. Seamless switching between WebSocket and polling.

**Prerequisites:** Task 4 complete (Zustand Store Integration).

---

### 8.1 Extension Integration (Task 5)

**Implementation Details:**

- **Polling Fallback Service:**
```typescript
// src/services/pollingFallbackService.ts

import { apiClient } from '../api/client';
import type { ChatMessage } from '../types/chatMessage';

/**
 * Polling Fallback Service
 * 
 * Provides message sync via polling when WebSocket is unavailable.
 * Uses adaptive polling intervals based on activity.
 * 
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §8 (Task 5)
 */
class PollingFallbackService {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private currentSessionId: string | null = null;
  private isActive = false;
  private lastMessageTimestamp: Date | null = null;
  
  // Adaptive polling intervals
  private readonly ACTIVE_INTERVAL = 3000;   // 3 seconds when active
  private readonly IDLE_INTERVAL = 30000;    // 30 seconds when idle
  private readonly IDLE_THRESHOLD = 60000;   // Consider idle after 60 seconds of no new messages
  
  private getState: (() => any) | null = null;
  private setState: ((fn: (state: any) => void) => void) | null = null;
  
  initialize(
    getState: () => any,
    setState: (fn: (state: any) => void) => void
  ): void {
    this.getState = getState;
    this.setState = setState;
  }
  
  /**
   * Start polling for a session
   */
  startPolling(sessionId: string): void {
    if (this.pollingInterval) {
      this.stopPolling();
    }
    
    this.currentSessionId = sessionId;
    this.isActive = true;
    this.lastMessageTimestamp = new Date();
    
    console.log('[PollingFallback] Starting polling for session:', sessionId);
    
    // Initial poll
    this.poll();
    
    // Set up interval
    this.pollingInterval = setInterval(() => {
      this.poll();
    }, this.getCurrentInterval());
  }
  
  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.currentSessionId = null;
    this.isActive = false;
    console.log('[PollingFallback] Stopped polling');
  }
  
  /**
   * Get current polling interval based on activity
   */
  private getCurrentInterval(): number {
    if (!this.lastMessageTimestamp) {
      return this.ACTIVE_INTERVAL;
    }
    
    const timeSinceLastMessage = Date.now() - this.lastMessageTimestamp.getTime();
    return timeSinceLastMessage > this.IDLE_THRESHOLD 
      ? this.IDLE_INTERVAL 
      : this.ACTIVE_INTERVAL;
  }
  
  /**
   * Poll for new messages
   */
  private async poll(): Promise<void> {
    if (!this.currentSessionId || !this.getState || !this.setState) {
      return;
    }
    
    try {
      const { messages } = await apiClient.getSessionMessages(
        this.currentSessionId,
        50, // limit
        this.lastMessageTimestamp || undefined // since
      );
      
      if (messages && messages.length > 0) {
        this.lastMessageTimestamp = new Date();
        
        // Update state with new messages
        this.setState((draft: any) => {
          const existingIds = new Set(draft.currentTask.messages.map((m: ChatMessage) => m.id));
          
          for (const msg of messages) {
            if (!existingIds.has(msg.messageId)) {
              const chatMessage: ChatMessage = {
                id: msg.messageId,
                role: msg.role,
                content: msg.content,
                status: (msg.status as ChatMessage['status']) || 'sent',
                timestamp: new Date(msg.timestamp),
                sequenceNumber: msg.sequenceNumber,
                actionPayload: msg.actionPayload as any,
                error: msg.error as any,
              };
              
              draft.currentTask.messages.push(chatMessage);
            }
          }
          
          // Sort messages
          draft.currentTask.messages.sort((a: ChatMessage, b: ChatMessage) => {
            if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
              return a.sequenceNumber - b.sequenceNumber;
            }
            const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
            const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
            return timeA - timeB;
          });
        });
        
        // Adjust polling interval if we got new messages
        if (this.pollingInterval) {
          clearInterval(this.pollingInterval);
          this.pollingInterval = setInterval(() => this.poll(), this.getCurrentInterval());
        }
      }
    } catch (error) {
      console.warn('[PollingFallback] Poll failed:', error);
    }
  }
}

export const pollingFallbackService = new PollingFallbackService();
```

- **Integration with Message Sync Manager:**
```typescript
// In MessageSyncManager.handleFallback()
private handleFallback(): void {
  console.log('[MessageSyncManager] Switched to polling fallback');
  
  const state = this.getState?.();
  if (state?.currentTask.sessionId) {
    pollingFallbackService.startPolling(state.currentTask.sessionId);
  }
}

// In MessageSyncManager.startSync()
async startSync(sessionId: string): Promise<void> {
  // Stop any existing polling
  pollingFallbackService.stopPolling();
  
  try {
    await wsService.connect(sessionId);
  } catch (error) {
    console.warn('[MessageSyncManager] WebSocket connect failed, using fallback');
    pollingFallbackService.startPolling(sessionId);
  }
}
```

---

### 8.2 Definition of Done / QA Verification (Task 5)

- [ ] `PollingFallbackService` created with adaptive intervals. ⏳ **PENDING**
- [ ] Automatic switch from WebSocket to polling on failure. ⏳ **PENDING**
- [ ] Polling stops when WebSocket reconnects. ⏳ **PENDING**
- [ ] Adaptive intervals: 3s active, 30s idle. ⏳ **PENDING**
- [ ] Message deduplication in polling. ⏳ **PENDING**
- [ ] `since` parameter used to fetch only new messages. ⏳ **PENDING**

**Exit criterion:** Task 5 complete when polling fallback works seamlessly.

**Status:** ⏳ **PENDING**

---

## 9. Task 6: UI Integration & Status Indicators

**Objective:** Add UI components for connection status, typing indicators, and sync status. Users should see when they're connected via WebSocket vs polling.

**Deliverable:** Visual indicators for connection state and typing status.

**Prerequisites:** Task 5 complete (Polling Fallback System).

---

### 9.1 Extension Integration (Task 6)

**Implementation Details:**

- **Connection Status Badge:**
```typescript
// src/common/ConnectionStatusBadge.tsx

import React from 'react';
import { Badge, HStack, Icon, Tooltip, useColorModeValue } from '@chakra-ui/react';
import { FiWifi, FiWifiOff, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import { useAppState } from '../state/store';

/**
 * Connection Status Badge
 * 
 * Shows WebSocket connection status with appropriate icons and colors.
 * 
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §9 (Task 6)
 */
export const ConnectionStatusBadge: React.FC = () => {
  const wsConnectionState = useAppState((state) => state.currentTask.wsConnectionState);
  
  const bgConnected = useColorModeValue('green.100', 'green.900');
  const bgReconnecting = useColorModeValue('yellow.100', 'yellow.900');
  const bgFallback = useColorModeValue('orange.100', 'orange.900');
  const bgDisconnected = useColorModeValue('gray.100', 'gray.700');
  const bgFailed = useColorModeValue('red.100', 'red.900');
  
  const getStatusConfig = () => {
    switch (wsConnectionState) {
      case 'connected':
        return {
          icon: FiWifi,
          label: 'Connected',
          tooltip: 'Real-time sync active',
          bg: bgConnected,
          colorScheme: 'green',
        };
      case 'connecting':
        return {
          icon: FiRefreshCw,
          label: 'Connecting',
          tooltip: 'Establishing connection...',
          bg: bgReconnecting,
          colorScheme: 'yellow',
        };
      case 'reconnecting':
        return {
          icon: FiRefreshCw,
          label: 'Reconnecting',
          tooltip: 'Reconnecting to server...',
          bg: bgReconnecting,
          colorScheme: 'yellow',
        };
      case 'fallback':
        return {
          icon: FiAlertCircle,
          label: 'Polling',
          tooltip: 'Using polling (WebSocket unavailable)',
          bg: bgFallback,
          colorScheme: 'orange',
        };
      case 'failed':
        return {
          icon: FiWifiOff,
          label: 'Disconnected',
          tooltip: 'Connection failed',
          bg: bgFailed,
          colorScheme: 'red',
        };
      default:
        return {
          icon: FiWifiOff,
          label: 'Offline',
          tooltip: 'Not connected',
          bg: bgDisconnected,
          colorScheme: 'gray',
        };
    }
  };
  
  const config = getStatusConfig();
  
  return (
    <Tooltip label={config.tooltip} placement="bottom">
      <Badge
        colorScheme={config.colorScheme}
        variant="subtle"
        px={2}
        py={1}
        borderRadius="md"
        display="flex"
        alignItems="center"
        gap={1}
      >
        <Icon as={config.icon} boxSize={3} />
        {config.label}
      </Badge>
    </Tooltip>
  );
};
```

- **Typing Indicator:**
```typescript
// src/common/TypingIndicator.tsx

import React from 'react';
import { HStack, Text, useColorModeValue } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useAppState } from '../state/store';

const bounce = keyframes`
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
`;

/**
 * Typing Indicator
 * 
 * Shows when server is processing (thinking, executing, etc.)
 * 
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §9 (Task 6)
 */
export const TypingIndicator: React.FC = () => {
  const isServerTyping = useAppState((state) => state.currentTask.isServerTyping);
  const serverTypingContext = useAppState((state) => state.currentTask.serverTypingContext);
  
  const textColor = useColorModeValue('gray.500', 'gray.400');
  const dotColor = useColorModeValue('blue.500', 'blue.300');
  
  if (!isServerTyping) return null;
  
  const contextLabel = serverTypingContext === 'thinking' ? 'Thinking'
    : serverTypingContext === 'executing' ? 'Executing'
    : serverTypingContext === 'verifying' ? 'Verifying'
    : 'Processing';
  
  return (
    <HStack spacing={2} py={2} px={4}>
      <HStack spacing={1}>
        {[0, 1, 2].map((i) => (
          <Text
            key={i}
            as="span"
            color={dotColor}
            fontSize="lg"
            animation={`${bounce} 1.4s ease-in-out ${i * 0.2}s infinite`}
          >
            •
          </Text>
        ))}
      </HStack>
      <Text fontSize="sm" color={textColor}>
        {contextLabel}...
      </Text>
    </HStack>
  );
};
```

- **Integration in TaskUI:**
```typescript
// In src/common/TaskUI.tsx

import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { TypingIndicator } from './TypingIndicator';

// Add to header section
<HStack justify="space-between" mb={4}>
  <Heading size="md">Chat</Heading>
  <ConnectionStatusBadge />
</HStack>

// Add before message input
<TypingIndicator />
```

---

### 9.2 Definition of Done / QA Verification (Task 6)

- [ ] `ConnectionStatusBadge` component created with all states. ⏳ **PENDING**
- [ ] `TypingIndicator` component created with animation. ⏳ **PENDING**
- [ ] Components integrated into TaskUI. ⏳ **PENDING**
- [ ] Dark mode support for all components. ⏳ **PENDING**
- [ ] Tooltips provide helpful context. ⏳ **PENDING**

**Exit criterion:** Task 6 complete when status indicators are visible and accurate.

**Status:** ✅ **UNIT TESTS COMPLETE** (manual QA pending)

---

## 10. Task 7: Testing & Verification

**Objective:** Comprehensive testing of real-time message sync including unit tests, integration tests, and manual QA verification.

**Deliverable:** Test suite and QA verification checklist complete.

**Prerequisites:** Tasks 1-6 complete.

---

### 10.1 Test Cases

**Unit Tests:**
1. WebSocket connection lifecycle (connect → disconnect)
2. Reconnection with exponential backoff
3. Message deduplication by ID
4. Message ordering by sequenceNumber
5. Polling fallback activation
6. State updates from WebSocket events

**Integration Tests:**
1. End-to-end message sync via WebSocket
2. Fallback to polling when WebSocket fails
3. Session switching with connection cleanup
4. Multiple messages in rapid succession
5. Connection recovery after network outage

**Manual QA Verification:**
1. Connect to session, verify "Connected" badge
2. Send message, see it appear in real-time
3. Disconnect network, verify "Reconnecting" badge
4. Wait for max retries, verify "Polling" badge
5. Reconnect network, verify WebSocket resumes
6. Switch sessions, verify clean connection handoff
7. Typing indicator appears during server processing
8. Messages maintain correct order after refresh

---

### 10.2 Definition of Done / QA Verification (Task 7)

- [x] Unit tests created for all services. ✅ **COMPLETE**
- [ ] Integration tests for end-to-end flow. ⏳ **PENDING** (optional; manual QA covers flow)
- [ ] Manual QA verification complete. ⏳ **PENDING**
- [x] No regression in existing functionality. ✅ (parseResponse tests still pass)
- [ ] Performance acceptable (no UI lag). ⏳ **PENDING** (manual QA)

**Exit criterion:** Task 7 complete when all tests pass and QA signs off.

**Status:** ✅ **UNIT TESTS COMPLETE** — Manual QA and optional integration tests remain.

---

## 11. Backend Requirements

The backend is assumed to run on **Next.js** (App Router or Pages). These requirements describe what the server must provide so the extension’s WebSocket client can sync messages in real time. The client already implements connection lifecycle, reconnection, heartbeat, and fallback to polling; the server must expose a WebSocket endpoint and follow the message protocol below.

---

### 11.1 Next.js and WebSocket Hosting

Next.js serves HTTP by default. WebSockets require a long-lived connection, so the WebSocket endpoint cannot be implemented as a standard API Route handler (which is request/response).

**Current implementation:** The backend uses **Sockudo only** (a separate, Pusher-compatible WebSocket server on port 3005). Next.js does not expose a raw WebSocket path like `/ws/session/:sessionId`; there is no in-process WebSocket server and no `GET /api/ws/token`. The client must use a **Pusher protocol client** (e.g. `pusher-js`) to connect to Sockudo; see **Section 11.11** for details.

The following paragraphs (§11.2–11.10) describe a generic raw WebSocket protocol for reference. The **actual** server behaviour is documented in **§11.11**.

---

### 11.2 Endpoint and Authentication

**Path:** `/ws/session/:sessionId`  
**Scheme:** `ws` in development, `wss` in production (TLS).

**Authentication:** The client sends the same Bearer token it uses for REST (e.g. from your existing auth flow) as a **query parameter** named `token`, because WebSocket handshake headers are not always available from the extension context. The server must:

- Read the token from the query string.
- Validate it (signature, expiry, issuer) using the same rules as your Next.js API routes.
- Resolve the user/tenant from the token and ensure that user is allowed to access the given `sessionId` (e.g. session belongs to that user or tenant).

If validation fails, close the WebSocket with code **4001** (Authentication failed). If the session does not exist or the user is not allowed, use **4002** (Session not found) or **4003** (Not authorized for session). If the server is under load and wants to reject new connections, use **4004** (Rate limited).

---

### 11.3 Connection Lifecycle and Session Subscription

**On connect (after auth succeeds):**

1. Associate the connection with the resolved user and with `sessionId` from the path.
2. Treat the client as “subscribed” to that session (no separate SUBSCRIBE message is strictly required if the URL already encodes the session). If you support multiple sessions per connection, the client will send a SUBSCRIBE message with `sessionId`; in that case maintain a list of session subscriptions per connection.
3. Optionally send existing messages for that session (e.g. last N or since a cursor). If you do not send them, the client will continue to use the existing REST endpoint for initial load and use WebSocket only for new/updated messages.

**While connected:**

- When a new message is persisted (e.g. via your existing REST or server logic), broadcast a **NEW_MESSAGE** to all connections subscribed to that session.
- When a message’s status or metadata is updated, broadcast **MESSAGE_UPDATE**.
- When the session’s status changes (e.g. completed, failed), broadcast **SESSION_UPDATE**.
- When the server is doing work that should show a typing indicator (e.g. thinking, executing, verifying), send **TYPING** with `isTyping: true` and optionally a context string; send **TYPING** with `isTyping: false` when done.
- Respond to **PING** with **PONG** so the client can detect dead connections.

**On disconnect:** Remove the connection from any in-memory (or shared) session→connections map so no further messages are sent to it.

---

### 11.4 Message Protocol (Server → Client)

Every server-sent message is a JSON object with at least:

- **type** — One of: NEW_MESSAGE, MESSAGE_UPDATE, SESSION_UPDATE, TYPING, PONG, ERROR.
- **sessionId** — The session UUID this event belongs to.
- **payload** — Type-specific data (see below).
- **timestamp** — ISO 8601 string (e.g. server time when the event was created).

**NEW_MESSAGE:** In payload include the full message object (id, role, content, status, timestamp, sequenceNumber, and any other fields your REST API returns for a message) and a **sequenceNumber** for ordering. The client merges by message id and sorts by sequenceNumber.

**MESSAGE_UPDATE:** In payload include **messageId**, **status** (e.g. success, failure, pending), **updatedAt** (ISO 8601), and optionally **error** (e.g. message and code) so the client can update the message in place.

**SESSION_UPDATE:** In payload include **sessionId**, **status** (e.g. active, completed, failed), and **updatedAt** so the client can reflect session state in the UI.

**TYPING:** In payload include **isTyping** (boolean) and optionally **context** (e.g. "thinking", "executing", "verifying") so the client can show the typing indicator.

**PONG:** Sent in response to client PING. Payload can be empty. Enables the client to detect heartbeat timeouts and reconnect.

**ERROR:** In payload include **code** and **message** for the client to show or log. Use for application-level errors (e.g. session no longer valid) without closing the connection if not necessary.

---

### 11.5 Message Protocol (Client → Server)

The client sends JSON objects with at least a **type** field. The server should handle:

**SUBSCRIBE:** Optional if the session is implied by the URL. If used, payload or top-level field includes **sessionId**. Add this connection to the list of subscribers for that session.

**UNSUBSCRIBE:** Payload or top-level includes **sessionId**. Remove this connection from that session’s subscribers.

**PING:** No payload required. Respond with **PONG** and the same **timestamp** convention as other server messages.

**ACK:** Optional. Payload may include **messageId**. Can be used for delivery or read receipts; the current client may not send it, but the server can accept and ignore or log it.

---

### 11.6 Heartbeat and Timeouts

The client sends PING on an interval (e.g. 30 seconds). The server should respond with PONG promptly. If the server does not receive PING (or any message) from the client for a long period (e.g. 60–120 seconds), it may close the connection so that the client’s reconnection logic kicks in. Similarly, if the server does not send PONG after a PING, the client will treat the connection as dead and reconnect or fall back to polling.

---

### 11.7 Error Handling and Close Codes

- **4001** — Authentication failed (invalid or expired token).
- **4002** — Session not found.
- **4003** — Not authorized for this session.
- **4004** — Rate limited (e.g. too many connections or messages).

On these, close the WebSocket with the appropriate code and a short reason string. The client will not retry indefinitely on 4001; it may fall back to polling. For transient issues (e.g. overload), 4004 allows the client to back off and retry.

---

### 11.8 Scaling and Multi-Instance (Next.js / Serverless)

If you run multiple Next.js instances or a separate WebSocket server with multiple processes, a single process does not see connections on another. To broadcast to “all subscribers of session X”:

- Maintain a **session → list of connections** map that is either:
  - In-memory on a single WebSocket server (sticky sessions / single instance), or
  - Coordinated via a **Redis (or similar) pub/sub**: when a message is saved, publish an event to a channel keyed by sessionId; every process that has subscribers for that session subscribes to the channel and forwards the message to its local connections.

Ensure that the same JWT and session-authorization logic used in Next.js API routes is used when accepting WebSocket connections and when publishing to session channels, so only authorized subscribers receive messages.

---

### 11.9 CORS and Allowed Origins

The extension loads in a `chrome-extension://` origin. Your WebSocket server (or Next.js custom server) must allow that origin if you enforce origin checks on the WebSocket handshake. Allow both your web app origin (e.g. `https://yourapp.com`) and the extension origin (e.g. `chrome-extension://<extension-id>`). If the client connects with a different base URL (e.g. dedicated WS host), ensure that host’s CORS/origin policy allows the extension.

---

### 11.10 Summary Checklist for Backend

- WebSocket endpoint at `/ws/session/:sessionId` (or equivalent), hosted via custom server or separate WS server.
- Token in query string; validate with same rules as REST; reject with 4001/4002/4003/4004 when appropriate.
- On connect, associate connection with user and session; optionally send existing messages.
- On new/updated message or session, broadcast NEW_MESSAGE, MESSAGE_UPDATE, or SESSION_UPDATE to subscribers of that session.
- Send TYPING when processing; respond to PING with PONG.
- Handle SUBSCRIBE/UNSUBSCRIBE if supporting multiple sessions per connection.
- For multiple instances, use Redis (or similar) pub/sub so all subscribers for a session receive events.
- Allow extension origin (and web app origin) in CORS/origin checks.

---

### 11.11 Server Implementation Summary (Current — Sockudo only)

The backend has **one** real-time implementation: **Sockudo** (Pusher-compatible WebSocket server) on **port 3005**, with **Next.js** triggering events and authorizing channel access. There is no raw WebSocket endpoint, no in-process server, and no `GET /api/ws/token`. The extension must use a **Pusher/Sockudo client** (e.g. `pusher-js`) to connect.

| Item | Implementation |
|------|----------------|
| **WebSocket server** | **Sockudo** (Docker), port **3005**. Uses local adapter (no Redis); Redis optional for horizontal scaling. |
| **Connection URL** | `ws://<host>:3005` (dev) or `wss://<host>:3005` (prod). No path like `/ws/session/:sessionId`; session is expressed via **channel** name. |
| **Channels** | One **private** channel per session: `private-session-<sessionId>`. Subscription requires auth. |
| **Authentication** | **POST /api/pusher/auth** (Next.js API route). Client sends **form data**: `socket_id`, `channel_name`. Server validates session (Bearer or cookie), verifies user owns the session (DB lookup), returns `pusher.authorizeChannel(socketId, channel)` response. |
| **Client SDK** | Extension must use **pusher-js** (or equivalent Pusher protocol client). Configure: `key`, `wsHost`, `wsPort: 3005`, `authEndpoint: '/api/pusher/auth'` (same-origin to Next.js or CORS-enabled). |
| **Server events (triggered by Next.js)** | **`new_message`** — when a user message is persisted (POST /api/agent/interact). Payload: `{ type: "new_message", sessionId, message }` where `message` has `messageId`, `role`, `content`, `sequenceNumber`, `timestamp`, `status?`, `actionString?`, `domSummary?`, `metadata?`. **`interact_response`** — when an assistant turn is returned (same interact call). Payload: `{ type: "interact_response", sessionId, data }` with `taskId`, `action`, `thought`, `status`, `currentStepIndex`, `verification`, `correction`. |
| **Heartbeat** | Sockudo/Pusher handles connection keepalive. No separate PING/PONG in application protocol. |
| **Env (server)** | `SOCKUDO_APP_ID`, `SOCKUDO_APP_KEY`, `SOCKUDO_APP_SECRET`, `SOCKUDO_HOST` (e.g. `127.0.0.1`), `SOCKUDO_PORT` (3005). |
| **Env (client)** | `NEXT_PUBLIC_PUSHER_KEY` (= app key), `NEXT_PUBLIC_PUSHER_WS_HOST`, `NEXT_PUBLIC_PUSHER_WS_PORT` (3005). |
| **Files (server)** | `lib/pusher/server.ts` (getPusher, triggerNewMessage, triggerInteractResponse), `app/api/pusher/auth/route.ts`, `app/api/agent/interact/route.ts` (calls trigger* after persist/response), `docker-compose.yml` (sockudo service on 3005). |

---

### Protocol Mapping: Server Events ↔ Client Expectations

| Roadmap (Section 11) | Current server | Client action |
|----------------------|----------------|---------------|
| **NEW_MESSAGE** (payload: full message + sequenceNumber) | **`new_message`** event; payload is `{ type, sessionId, message }`; `message` has `messageId`, `role`, `content`, `sequenceNumber`, `timestamp`, etc. | Map `message` → client `ChatMessage` (e.g. `id` ← `messageId`). Emit internal `newMessage` / NEW_MESSAGE for Message Sync Manager. |
| **MESSAGE_UPDATE** (messageId, status, updatedAt, error?) | Not yet sent by server (only new_message and interact_response are triggered). | Optional: treat **interact_response** as a cue to refresh messages from REST or to add an “assistant turn” in the store. |
| **TYPING** (isTyping, context?) | Not sent by server. | Optional: infer “typing” between sending a user message and receiving **interact_response**; or keep polling/UI as-is. |
| **SESSION_UPDATE** | Not sent by server. | Use existing REST/session APIs if needed. |
| **PONG** | Handled by Sockudo/Pusher; no app-level PING/PONG. | Rely on Pusher connection state; no custom heartbeat needed. |
| **ERROR** | Pusher auth returns 401/403; Sockudo may send connection errors. | Map to client `stateChange` / `fallback` or show in ConnectionStatusBadge. |

---

### Client (Chrome Extension) TODO List

Use this checklist to finish extension-side integration with the **current** backend (Sockudo/Pusher on port 3005).

1. **Add Pusher/Sockudo transport**
   - [ ] Add dependency: `pusher-js` (or use existing if already added for web).
   - [ ] Create a **Pusher-based transport** (e.g. `pusherTransport.ts` or extend `websocketService.ts`) that:
     - Connects using `Pusher(key, { wsHost, wsPort: 3005, authEndpoint, ... })`.
     - Subscribes to channel `private-session-<sessionId>` after connection.
     - Binds to events `new_message` and `interact_response`.
   - [ ] Use **same auth as REST**: `/api/pusher/auth` accepts **Bearer** (via `Authorization` header) and **cookie** (same-origin). For the extension (cross-origin), pass the same token used for REST: e.g. with `pusher-js`, use `auth: { headers: { Authorization: 'Bearer ' + accessToken } }` when creating the Pusher instance so the auth endpoint receives the token. Ensure CORS on Next.js allows the extension origin for `POST /api/pusher/auth` if needed.

2. **Environment / build configuration**
   - [ ] Add env vars for Sockudo/Pusher: `PUSHER_KEY` (or `NEXT_PUBLIC_PUSHER_KEY`), `PUSHER_WS_HOST`, `PUSHER_WS_PORT` (3005). In webpack, inject e.g. `WEBPACK_PUSHER_KEY`, `WEBPACK_PUSHER_WS_HOST`, `WEBPACK_PUSHER_WS_PORT`.
   - [ ] Ensure **authEndpoint** points to the Next.js app (e.g. `https://yourapp.com/api/pusher/auth`) so the extension’s auth request succeeds (CORS and credentials if needed).

3. **Event mapping (Pusher → internal)**
   - [ ] On **`new_message`**: map payload `{ type, sessionId, message }` to client `ChatMessage` (e.g. `id` = `message.messageId`, `sequenceNumber` = `message.sequenceNumber`, `timestamp` from `message.timestamp`). Call existing Message Sync Manager logic (e.g. emit `newMessage` or push into store with dedup by id and sort by sequenceNumber).
   - [ ] On **`interact_response`**: either (a) treat as “assistant turn” and insert/update a message in the store (thought/action/status), or (b) trigger a refresh of messages from REST. Document chosen behavior in extension code.

4. **Connection state and fallback**
   - [ ] Drive **ConnectionStatusBadge** from Pusher connection state (e.g. `connecting`, `connected`, `unavailable`, `failed`) so it shows Connected when subscribed and Disconnected/Reconnecting when not.
   - [ ] Keep **polling fallback** when Pusher is not configured or connection fails; use existing `pollingFallbackService` and state (`fallback`) so the UI still works without real-time.

5. **Manual QA**
   - [ ] With Sockudo and Next.js running (e.g. `docker compose up` sockudo + redis, and Next.js with `SOCKUDO_APP_KEY` set), open extension, select a session, and confirm connection state becomes “Connected.”
   - [ ] Send a message via interact; confirm **new_message** and **interact_response** appear in the UI (or messages list updates) without refresh.
   - [ ] Switch session; confirm subscription changes and messages for the new session stream correctly.
   - [ ] Run through Section 10.1 verification checklist (badge states, typing, session switch, etc.).

---

## 12. Implementation Checklist

### ✅ Completed

- [x] **Current Architecture Analysis:** Poll-based system documented
- [x] **Target Architecture Design:** WebSocket + polling fallback defined
- [x] **Backend Requirements:** WebSocket protocol specified
- [x] **Task 1:** WebSocket Service Foundation — `src/services/websocketService.ts`, `src/services/websocketTypes.ts`
- [x] **Task 2:** Connection Management — persistState/restoreState, exponential backoff, session switching
- [x] **Task 3:** Message Event Handling — typed payloads, normalized events (newMessage, messageUpdate, etc.)
- [x] **Task 4:** Zustand Store Integration — `src/services/messageSyncService.ts`
- [x] **Task 5:** Polling Fallback System — `src/services/pollingFallbackService.ts`, adaptive intervals
- [x] **Task 6:** UI Integration & Status Indicators — `ConnectionStatusBadge.tsx`, `TypingIndicator.tsx`, TaskUI integration

### ⚠️ TODO: Client integration with backend & Manual QA

**Phase 1: Foundation (Tasks 1-2)** — ✅ **COMPLETE**
**Phase 2: Integration (Tasks 3-4)** — ✅ **COMPLETE**
**Phase 3: Resilience (Task 5)** — ✅ **COMPLETE**
**Phase 4: Polish (Tasks 6-7)** — ✅ **COMPLETE**
6. [x] **Task 6:** UI Integration & Status Indicators — ✅ **COMPLETE**
7. [x] **Task 7:** Testing & Verification — ✅ **COMPLETE** (unit tests)
8. [x] **Backend:** Sockudo (Pusher) on port 3005, Next.js trigger + `/api/pusher/auth` — ✅ **COMPLETE** (see §11.11)
9. [ ] **Client ↔ Backend:** Extension Pusher transport, auth, event mapping — ⏳ **PENDING** (see **Client TODO List** above)
10. [ ] **Manual QA:** Verification checklist (Section 10.1) — ⏳ **PENDING**

### 📊 Overall Priority Order

| Priority | Task | Status | Depends On |
|----------|------|--------|------------|
| 1 | Task 1: WebSocket Service | ✅ COMPLETE | Backend WS endpoint |
| 2 | Task 2: Connection Management | ✅ COMPLETE | Task 1 |
| 3 | Task 3: Message Event Handling | ✅ COMPLETE | Task 2 |
| 4 | Task 4: Zustand Store Integration | ✅ COMPLETE | Task 3 |
| 5 | Task 5: Polling Fallback | ✅ COMPLETE | Task 4 |
| 6 | Task 6: UI Integration | ✅ COMPLETE | Task 5 |
| 7 | Task 7: Testing | ✅ COMPLETE | Tasks 1-6 |
| 8 | Backend (Sockudo/Pusher) | ✅ COMPLETE | Server-side |
| 9 | Client Pusher transport & mapping | ⏳ PENDING | Backend, extension |

---

## 13. Architecture Status Summary

### 13.1 Component Status Overview

| Component | Status | Notes |
|-----------|--------|-------|
| **Current Polling** | ✅ Working | `loadMessages()` in currentTask.ts |
| **WebSocket Service** | ✅ Implemented | Task 1 — `websocketService.ts` (raw WS; client must add Pusher transport for current backend) |
| **Connection Management** | ✅ Implemented | Task 2 — persistState, backoff, session switch |
| **Message Event Handling** | ✅ Implemented | Task 3 — typed payloads, normalized events |
| **Zustand Integration** | ✅ Implemented | Task 4 — `messageSyncService.ts` |
| **Polling Fallback** | ✅ Implemented | Task 5 — `pollingFallbackService.ts` |
| **UI Status Indicators** | ✅ Implemented | Task 6 — ConnectionStatusBadge, TypingIndicator |
| **Backend (Sockudo/Pusher)** | ✅ Implemented | Port 3005, `/api/pusher/auth`, events `new_message`, `interact_response` (§11.11) |
| **Client ↔ Backend** | ⏳ Pending | Extension: add Pusher transport, auth, event mapping (see Client TODO List) |

### 13.2 Implementation Files Reference

**New Files (Created):**
- `src/services/websocketService.ts` — WebSocket connection management (Tasks 1-3)
- `src/services/websocketTypes.ts` — WebSocket message type definitions
- `src/services/messageSyncService.ts` — Coordination between WS and Zustand (Task 4)
- `src/services/pollingFallbackService.ts` — Polling fallback implementation (Task 5)
- `src/common/ConnectionStatusBadge.tsx` — Connection status UI (Task 6)
- `src/common/TypingIndicator.tsx` — Typing indicator UI (Task 6)
- `src/services/websocketService.test.ts` — Unit tests for WebSocket lifecycle, messages, reconnect, fallback (Task 7)
- `src/services/messageSyncService.test.ts` — Unit tests for dedup, ordering, state updates (Task 7)
- `src/services/pollingFallbackService.test.ts` — Unit tests for polling start/stop, merge, sort (Task 7)
- `jest.config.js` — Jest config (JS) so tests run without ts-node

**Files Modified:**
- `src/state/currentTask.ts` — Added `wsConnectionState`, `isServerTyping`, `serverTypingContext`; reset in startNewChat
- `src/state/store.ts` — Initialize message sync manager after store creation
- `src/common/TaskUI.tsx` — ConnectionStatusBadge, TypingIndicator, startSync/stopSync, visibility-based reconnect
- `webpack.config.js` — Added `WEBPACK_WS_BASE` environment variable

**Existing Files (Reference):**
- `src/api/client.ts` — REST API client (used for fallback)
- `src/types/chatMessage.ts` — Message type definitions

---

## Appendix A: Archived Content (CHAT_FLOW_VERIFICATION.md)

The original `CHAT_FLOW_VERIFICATION.md` document verified the poll-based chat architecture. Its contents are archived here for reference.

### A.1 Verified Components (From Original Document)

1. ✅ **Turn Structure:** Properly defined with `userMessage` + `aiMessages[]`
2. ✅ **Message Storage:** Complete message structure with all required fields
3. ✅ **Message IDs:** Every message has unique UUID
4. ✅ **Message Ordering:** Chronological ordering maintained (sequenceNumber when available)
5. ✅ **Message Preservation:** Messages preserved across sessions and reloads
6. ✅ **UI Display:** Turn-based rendering with proper grouping
7. ✅ **Backend Integration:** API format matches specification
8. ✅ **Local Storage:** Chrome Storage persistence working
9. ✅ **Message Merging:** Proper merge logic prevents message loss

### A.2 Original Conclusion

The poll-based chat design was verified as **production-ready** with proper turn-based messaging flow. This roadmap builds on that foundation by adding real-time capabilities via WebSocket.

---

**End of Document**
