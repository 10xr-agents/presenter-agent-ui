# Screen Agent Platform - API Reference

**Complete API documentation for all platform features and endpoints**

## Table of Contents

1. [Core Features & APIs](#core-features--apis)
2. [Knowledge Extraction API](#knowledge-extraction-api)
3. [Browser Automation Service](#browser-automation-service)
4. [Authentication & OAuth](#authentication--oauth)
5. [Testing Coverage](#testing-coverage)

---

## Core Features & APIs

### Screen Agent Management

**Features**:
- Multi-step creation wizard
- Voice configuration (ElevenLabs, OpenAI, Cartesia)
- Website authentication and credential management
- Knowledge base integration
- Agent personality and conversation configuration
- Status management (Draft, Active, Paused, Archived)

**API Endpoints**:
- `GET /api/screen-agents` - List Screen Agents
- `POST /api/screen-agents` - Create Screen Agent
- `GET /api/screen-agents/[id]` - Get Screen Agent
- `PATCH /api/screen-agents/[id]` - Update Screen Agent
- `DELETE /api/screen-agents/[id]` - Delete Screen Agent

### Interactive Presentations

**Features**:
- LiveKit-based video conferencing
- Real-time screen sharing
- Voice-guided demonstrations
- Viewer interaction (questions via voice/text)
- Session recording and transcription
- No-auth public access via shareable links

**API Endpoints**:
- `POST /api/presentations/sessions` - Create presentation session
- `GET /api/presentations/sessions/[id]` - Get session details
- `POST /api/presentations/sessions/[id]/end` - End session

### Analytics & Insights

**Features**:
- Session-level analytics
- Viewer engagement metrics
- Question clustering and analysis
- Post-session video analysis
- Topic extraction and insights
- Exportable reports (CSV, PDF)

**API Endpoints**:
- `GET /api/analytics/sessions` - Get session analytics
- `GET /api/analytics/insights` - Get insights
- `POST /api/analytics/export` - Export analytics

### Billing & Usage

**Features**:
- Free tier (20 minutes/month + 1 Screen Agent)
- Pay-as-you-go billing with auto-reload
- Enterprise contracts with custom terms
- Usage-based metering (per-minute)
- Real-time balance tracking
- Invoice generation and management

**API Endpoints**:
- `GET /api/billing/account` - Get billing account
- `POST /api/billing/auto-reload` - Configure auto-reload
- `GET /api/billing/invoices` - List invoices
- `GET /api/usage/current` - Get current usage

### Multi-Tenancy & Organizations

**Features**:
- Organization-based isolation
- Team management (Enterprise)
- Role-based access control (RBAC)
- Custom permissions (Enterprise)
- Organization upgrades (Basic → Enterprise)

**API Endpoints**:
- `GET /api/teams` - List organizations/teams
- `POST /api/teams` - Create organization
- `GET /api/teams/[id]/members` - List members
- `POST /api/teams/[id]/members` - Add member

---

## Knowledge Extraction API

**Version**: 1.0.0  
**Base URL**: `http://localhost:8000/api/knowledge`  
**Status**: Production Ready

### Overview

The Knowledge Extraction API provides RESTful endpoints for:
- **Ingesting knowledge** from documentation, websites, and videos
- **Querying knowledge graphs** to find navigation paths and relationships
- **Retrieving knowledge definitions** (screens, tasks, actions, transitions)
- **Tracking workflow progress** with real-time status updates
- **Verifying extracted knowledge** using browser-based validation (optional)

### API Fundamentals

**Content Types**:
- Request: `application/json` (except file upload endpoints)
- Response: `application/json`

**Response Format**:
```json
{
  "data": {
    // Response payload
  },
  "meta": {
    "timestamp": "2026-01-14T10:00:00Z",
    "version": "1.0.0"
  }
}
```

**Error Response Format**:
```json
{
  "detail": "string (human-readable error message)",
  "error_code": "string (optional, machine-readable code)",
  "context": {
    // Additional error details
  }
}
```

### Ingestion API

#### Start Ingestion (URL-based)

Start knowledge extraction from a URL (documentation or website).

**Endpoint**: `POST /api/knowledge/ingest/start`

**Request Schema**:
```json
{
  "source_type": "documentation" | "website" | "video",
  "source_url": "string (required for URL-based ingestion)",
  "source_name": "string (optional, human-readable name)",
  "options": {
    "max_pages": "integer (optional, website only)",
    "max_depth": "integer (optional, website only)",
    "extract_code_blocks": "boolean (optional, documentation only)",
    "extract_thumbnails": "boolean (optional, video only)"
  },
  "job_id": "string (optional, auto-generated if not provided)",
  "s3_reference": {
    "bucket": "string",
    "key": "string",
    "region": "string"
  },
  "file_metadata": {
    "filename": "string",
    "content_type": "string",
    "size": "integer"
  }
}
```

**Response Schema** (200 OK):
```json
{
  "job_id": "string (UUID format)",
  "workflow_id": "string (Temporal workflow ID)",
  "status": "queued",
  "estimated_duration_seconds": "integer",
  "message": "string"
}
```

**Status Codes**:
- `200 OK`: Workflow started successfully
- `400 Bad Request`: Invalid request parameters
- `500 Internal Server Error`: Workflow creation failed

**Estimated Durations**:
- Documentation: 5 minutes (300s)
- Website: 15 minutes (900s)
- Video: 10 minutes (600s)

### Graph Query API

Query the knowledge graph to find navigation paths, adjacent screens, and relationships.

**Endpoint**: `POST /api/knowledge/graph/query`

**Request Schema**:
```json
{
  "query_type": "find_path" | "get_neighbors" | "search_screens" | "get_transitions",
  "source_screen_id": "string (required for find_path, get_neighbors, get_transitions)",
  "target_screen_id": "string (required for find_path)",
  "screen_name": "string (optional for search_screens)",
  "website_id": "string (optional filter)",
  "limit": "integer (default: 10, max results)"
}
```

**Response Schema** (200 OK):
```json
{
  "query_type": "string",
  "results": [
    {
      // Query-specific result objects
    }
  ],
  "count": "integer",
  "execution_time_ms": "float"
}
```

**Query Types**:
1. **find_path**: Find shortest path between two screens
2. **get_neighbors**: Get adjacent screens (1-hop away)
3. **search_screens**: Search screens by name or website
4. **get_transitions**: Get all transitions from a screen

### Knowledge Definition API

Retrieve full definitions of knowledge entities (screens, tasks, actions, transitions).

**Endpoints**:
- `GET /api/knowledge/screens/{screen_id}` - Get screen definition
- `GET /api/knowledge/tasks/{task_id}` - Get task definition
- `GET /api/knowledge/actions/{action_id}` - Get action definition
- `GET /api/knowledge/transitions/{transition_id}` - Get transition definition
- `GET /api/knowledge/screens?website_id={id}&limit={n}` - List screens
- `GET /api/knowledge/tasks?website_id={id}&limit={n}` - List tasks

### Workflow Management API

Track and manage knowledge extraction workflows.

**Endpoints**:
- `GET /api/knowledge/workflows/status/{job_id}` - Get workflow status
- `GET /api/knowledge/workflows/list?status={status}&limit={n}` - List workflows

**Workflow Status Response**:
```json
{
  "job_id": "string",
  "workflow_id": "string",
  "status": "queued" | "running" | "completed" | "failed" | "cancelled",
  "phase": "string",
  "progress": "float (0-100)",
  "errors": ["string"],
  "warnings": ["string"],
  "checkpoints": [
    {
      "activity_name": "string",
      "checkpoint_id": "integer",
      "items_processed": "integer",
      "total_items": "integer",
      "progress_percentage": "float"
    }
  ],
  "created_at": "string (ISO 8601)",
  "updated_at": "string (ISO 8601)"
}
```

**Workflow Phases**:
1. `ingest_source` - Loading source content
2. `extract_screens` - Extracting screens and UI elements
3. `extract_tasks` - Extracting tasks and workflows
4. `extract_actions` - Extracting actions and interactions
5. `extract_transitions` - Extracting navigation paths
6. `build_graph` - Constructing knowledge graph
7. `verify_extraction` - Validating results (optional)
8. `completed` - Workflow finished

### Knowledge Sources API

**Endpoints**:
- `GET /api/knowledge` - List knowledge sources
- `POST /api/knowledge` - Create knowledge source (URL or file)
- `GET /api/knowledge/[id]` - Get knowledge source
- `PATCH /api/knowledge/[id]` - Update knowledge source
- `DELETE /api/knowledge/[id]` - Delete knowledge source
- `POST /api/knowledge/[id]/resync` - Resync knowledge source
- `POST /api/knowledge/[id]/cancel` - Cancel extraction
- `POST /api/knowledge/[id]/pause` - Pause extraction

**File Upload**:
- `POST /api/knowledge/upload-to-s3` - Upload file to S3

**Workflow Status**:
- `GET /api/knowledge/workflows/status/[jobId]` - Get workflow status

### Error Handling

**HTTP Status Codes**:
- `200 OK`: Request successful
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource does not exist
- `413 Payload Too Large`: File/request too large
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server-side error
- `501 Not Implemented`: Feature not available
- `503 Service Unavailable`: Service temporarily unavailable

**Error Recovery**:
- Workflows automatically retry with exponential backoff
- Clients should retry 4xx errors after fixing request
- Clients can retry 5xx errors with exponential backoff

**Retry Strategy** (recommended):
```
Initial delay: 1 second
Max delay: 30 seconds
Backoff factor: 2.0
Max attempts: 3
```

### Process Tracking

**Real-Time Progress Monitoring**:
Monitor workflow progress using polling (recommended interval: 5 seconds).

**Checkpoint-Based Progress**:
Workflows report progress via checkpoints with detailed activity information.

---

## Browser Automation Service

### Overview

External service that handles browser automation, knowledge extraction, and real-time screen sharing.

### Communication Protocols

**REST API**:
- HTTP endpoints for tool execution
- Knowledge retrieval
- Workflow management

**MCP Protocol**:
- Model Context Protocol for standardized tool access
- Tool discovery and execution

**WebSocket**:
- Real-time event streaming
- Fallback to Redis Pub/Sub

**LiveKit**:
- Video streaming
- Real-time data channels

**Redis**:
- Job queue (RQ)
- Pub/Sub for events

**MongoDB**:
- Persistent data storage
- All collections prefixed with `brwsr_auto_svc_`

### API Endpoints

**Base URL**: `http://localhost:8000`

**Endpoints**:
- `POST /api/tools/execute` - Execute browser tool
- `GET /api/knowledge/query` - Query knowledge
- `GET /health` - Health check
- `GET /docs` - Swagger UI
- `GET /redoc` - ReDoc

**See**: `docs/openapi.json` for complete OpenAPI specification

---

## Authentication & OAuth

### Authentication Methods

**Email/Password**:
- Standard email/password authentication
- Email verification via Resend
- Password reset functionality

**Google OAuth**:
- OAuth 2.0 flow
- Single sign-on (SSO)
- Automatic account creation

### Configuration

**Environment Variables**:
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `BETTER_AUTH_URL` - Application URL
- `BETTER_AUTH_SECRET` - Auth secret (32+ chars)

**See**: `docs/DEVELOPMENT.md` (Authentication Setup section) for detailed setup instructions

---

## Testing Coverage

### Test Types

**Unit Tests** (Vitest):
- Component testing with React Testing Library
- Function testing
- Location: `*.test.{ts,tsx}`

**Integration Tests** (Vitest):
- API endpoints and database operations
- External service integrations
- Location: `lib/__tests__/` and `app/api/__tests__/`

**E2E Tests** (Playwright):
- Complete user flows
- Location: `e2e/*.spec.ts`

**Manual Tests**:
- UI/UX, edge cases, exploratory testing

**Performance Tests**:
- Load, stress, and scalability testing

**Security Tests**:
- Authentication, authorization, data protection

### Test Status Legend

- ⬜ **Not Started**: Test not yet created/executed
- 🔄 **In Progress**: Test currently being developed/executed
- ✅ **Passed**: Test passed successfully
- ❌ **Failed**: Test failed (requires fix)
- ⚠️ **Blocked**: Test blocked by dependencies
- ⏭️ **Skipped**: Test skipped (optional/not applicable)

### Priority Levels

- **P0 (Critical)**: Must pass for release - core functionality
- **P1 (High)**: Important features - should pass for release
- **P2 (Medium)**: Nice-to-have features - can be deferred
- **P3 (Low)**: Edge cases and polish - can be deferred

### Comprehensive Test Coverage

#### User Onboarding Flow

**Registration & Account Setup**:
- User can register with email/password (P0)
- User can register/login with Google OAuth (P1)
- Email verification required before account activation (P0)
- Password reset flow works correctly (P0)
- User can login with valid credentials (P0)
- Session persists across browser restarts (P1)
- Session expires after inactivity (P1)

**Route Protection & Access Control**:
- Unauthenticated user redirected from protected routes (P0)
- Authenticated user can access protected routes (P0)
- Platform admin routes require `platform_admin` role (P0)
- Organization routes require organization membership (P0)

#### Screen Agent Creation & Management

**Creation Wizard Flow**:
- User can start Screen Agent creation wizard (P0)
- Basic Information validates required fields (P0)
- Website URL validation works (P0)
- Voice configuration saves correctly (P1)
- Website credentials encrypted at rest (P0)
- Knowledge documents upload successfully (P1)
- File size limits enforced (P1)
- File type validation works (P0)
- Agent publishes successfully (P0)

**Agent Management Operations**:
- User can view list of Screen Agents (P0)
- User can filter agents by status (P1)
- User can edit Screen Agent configuration (P0)
- User can pause/resume Screen Agent (P0)
- User can delete Screen Agent (P1)

**Sharing & Distribution**:
- Shareable link works for Active agents (P0)
- Shareable link returns error for Paused agents (P0)
- Embed code generates correctly (P1)

#### Presentation Session Flow

**Session Initiation**:
- Viewer can access presentation via shareable link (P0)
- Session token validates correctly (P0)
- Session creates LiveKit room (P0)
- Session initialization completes successfully (P0)

**Live Presentation Experience**:
- Video stream displays correctly (P0)
- Audio stream works correctly (P0)
- Viewer can ask questions via voice/text (P1)
- Agent responds to viewer questions (P1)
- Screen navigation works correctly (P0)
- Presentation controls work (P1)

**Session Completion & Cleanup**:
- Viewer can end session manually (P0)
- Session duration calculated correctly (P0)
- Usage minutes tracked for billing (P0)
- Session analytics events created (P0)
- LiveKit room cleaned up after session (P0)

#### Knowledge Management

**Document Upload Flow**:
- User can upload PDF documents (P0)
- User can upload video files (P1)
- User can upload audio files (P1)
- User can add text URLs (P1)
- File size limits enforced (P1)
- File type validation works (P0)
- Upload progress displays correctly (P2)

**Knowledge Processing Pipeline**:
- PDF text extraction works (P0)
- Video transcription works (P1)
- Audio transcription works (P1)
- Embedding generation works (P1)
- Knowledge processing runs in background (P0)
- Processing status updates correctly (P0)
- Failed processing shows error message (P0)

#### Analytics & Insights

**Dashboard Overview**:
- Organization dashboard displays metrics (P0)
- Dashboard filters by time period (P1)
- Usage chart displays correctly (P1)
- Cost chart displays correctly (P1)
- Top agents table displays correctly (P1)
- Dashboard loads in < 2 seconds (P1)

**Screen Agent Analytics**:
- Agent-specific analytics display correctly (P0)
- Viewer list displays correctly (P1)
- Session history displays correctly (P1)
- Engagement metrics calculated correctly (P1)

#### Billing & Usage Flow

**Free Tier Experience**:
- Free tier allocation (20 minutes, 1 agent) works (P0)
- Free minutes consumed correctly (P0)
- Warning displayed at 80% usage (P1)
- New sessions blocked at 100% usage (P0)
- Free tier reset monthly (P0)

**Pay-as-You-Go Billing Flow**:
- User can add payment method (P0)
- Initial balance loading works ($100 minimum) (P0)
- Usage deducted from balance in real-time (P0)
- Balance displays correctly (P0)
- Auto-reload triggers at threshold ($10) (P0)
- Failed payment handled gracefully (P0)

#### Multi-Tenancy & Organizations

**Organization Management Flow**:
- User can create organization (P0)
- User becomes organization owner automatically (P0)
- Organization slug unique (P0)
- User can switch active organization (P0)
- Organization settings update correctly (P0)

**Member Management Flow**:
- Owner can invite members (P0)
- Admin can invite members (P0)
- Member cannot invite others (P0)
- Invited user can accept invitation (P0)
- Owner can remove members (P0)
- Owner can change member roles (P0)

**Role-Based Access Control (RBAC)**:
- Owner can manage organization settings (P0)
- Admin can invite members but not delete organization (P0)
- Member cannot manage organization settings (P0)
- Permission checks work via `hasPermission()` (P0)
- Role changes take effect immediately (P0)

**Data Isolation & Security**:
- User cannot access other organization's data (P0)
- API endpoints filter by organizationId (P0)
- Screen Agents scoped to organization (P0)
- Analytics scoped to organization (P0)
- Billing data scoped to organization (P0)

#### API Endpoints

**Screen Agents API**:
- GET /api/screen-agents - List agents (P0)
- POST /api/screen-agents - Create agent (P0)
- GET /api/screen-agents/[id] - Get agent (P0)
- PATCH /api/screen-agents/[id] - Update agent (P0)
- DELETE /api/screen-agents/[id] - Delete agent (P1)
- API enforces organization isolation (P0)

**Presentations API**:
- POST /api/presentations - Create session (P0)
- GET /api/presentations/[token] - Get session (P0)
- PATCH /api/presentations/[token] - Update session (P0)
- POST /api/presentations/[token]/end - End session (P0)

**Analytics API**:
- GET /api/analytics/dashboard - Get dashboard data (P0)
- GET /api/analytics/screen-agent/[id] - Get agent analytics (P0)
- GET /api/analytics/insights/[sessionId] - Get insights (P1)

**Billing API**:
- GET /api/billing/account - Get billing account (P0)
- POST /api/billing/add-payment - Add payment method (P0)
- POST /api/billing/load-balance - Load balance (P0)
- GET /api/billing/transactions - Get transactions (P1)

**Knowledge API**:
- POST /api/knowledge - Create knowledge source (P0)
- GET /api/knowledge - List documents (P0)
- DELETE /api/knowledge/[id] - Delete document (P1)
- GET /api/knowledge/[id]/status - Get processing status (P1)

**Error Handling & Rate Limiting**:
- API returns 401 for unauthenticated requests (P0)
- API returns 403 for unauthorized requests (P0)
- API returns 400 for invalid data (P0)
- API returns 404 for not found resources (P0)
- API returns 500 for server errors (P0)
- API rate limiting works (P0)

#### Integration & External Services

**Database Integration**:
- MongoDB connection works (P0)
- Prisma operations work (P0)
- Mongoose operations work (P0)
- Transactions work correctly (P1)
- Database indexes work correctly (P1)

**External Services Integration**:
- Stripe integration works (P0)
- Stripe webhook verification works (P0)
- LiveKit integration works (P0)
- Uploadthing integration works (P0)
- Resend email integration works (P0)
- Redis integration works (P0)
- OpenAI API integration works (P0)
- ElevenLabs API integration works (P1)

**Background Jobs Integration**:
- Email jobs process correctly (P0)
- Knowledge processing jobs work (P0)
- Video analysis jobs work (P1)
- Job retry logic works (P1)
- Job failure handling works (P1)

#### Performance & Scalability

**Load Testing**:
- API handles 100 concurrent requests (P1)
- Dashboard loads in < 2 seconds (P1)
- Analytics queries complete in < 3 seconds (P1)
- File upload handles large files (P1)

**Stress Testing**:
- System recovers from high load (P1)
- System handles burst traffic (P1)
- Worker queues handle backlog (P1)
- Database connection pool handles stress (P1)

#### Security & Compliance

**Authentication Security**:
- Password hashing works (P0)
- Session tokens secure (P0)
- CSRF protection works (P0)
- SQL injection prevented (P0)
- XSS prevention works (P0)
- Password complexity enforced (P0)

**Authorization Security**:
- Vertical privilege escalation prevented (P0)
- Horizontal privilege escalation prevented (P0)
- Role-based access enforced (P0)
- API key scoping works (P0)
- Session hijacking prevented (P0)

**Data Security**:
- Website credentials encrypted at rest (P0)
- Sensitive data not logged (P0)
- HTTPS enforced in production (P0)
- Environment variables not exposed (P0)
- Data encryption in transit (P0)

**API Security**:
- API rate limiting prevents abuse (P0)
- Webhook signature verification works (P0)
- Input validation prevents malicious data (P0)
- API authentication required (P0)

#### User Experience & Accessibility

**UI/UX Testing**:
- Navigation works smoothly (P1)
- Forms validate inline (P1)
- Loading states display correctly (P1)
- Error messages user-friendly (P1)
- Empty states helpful (P2)
- Responsive design works (P1)
- Accessibility standards met (WCAG AA) (P1)

**Cross-Browser & Device Testing**:
- Chrome (latest) (P0)
- Firefox (latest) (P1)
- Safari (latest) (P1)
- Edge (latest) (P2)
- Mobile Chrome (iOS) (P1)
- Mobile Safari (iOS) (P1)
- Mobile Chrome (Android) (P1)

### Sign-Off Checklist

**Critical Path (P0) - Must Pass for Release**:
- [ ] All P0 authentication tests passing
- [ ] Route protection working correctly
- [ ] Agent creation wizard complete
- [ ] Sessions create and end correctly
- [ ] Free tier limits enforced
- [ ] Organization isolation working
- [ ] All P0 API endpoints functional
- [ ] Authentication security verified
- [ ] Authorization security verified
- [ ] Core features performant

**High Priority (P1) - Should Pass for Release**:
- [ ] Dashboard displays correctly
- [ ] Document upload working
- [ ] Enterprise teams working
- [ ] UI/UX polished
- [ ] Responsive design working
- [ ] Accessibility standards met

---

## Related Documentation

- **Architecture**: `docs/ARCHITECTURE.md`
- **Development Guide**: `docs/DEVELOPMENT.md`
- **OpenAPI Specification**: `docs/openapi.json`
