# Screen Agent Platform - Architecture & System Design

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Patterns](#architecture-patterns)
3. [Technology Stack](#technology-stack)
4. [Database Architecture](#database-architecture)
5. [Authentication & Authorization](#authentication--authorization)
6. [Multi-Tenancy](#multi-tenancy)
7. [API Architecture](#api-architecture)
8. [Knowledge Extraction System](#knowledge-extraction-system)
9. [S3 File Storage Architecture](#s3-file-storage-architecture)
10. [Browser Automation Service](#browser-automation-service)
11. [Background Processing](#background-processing)
12. [External Services Integration](#external-services-integration)
13. [Security Architecture](#security-architecture)
14. [Deployment Architecture](#deployment-architecture)

---

## System Overview

### What We Are Building

**Screen Agent Platform** is an enterprise-grade, multi-tenant SaaS platform that enables businesses to create, distribute, and analyze interactive AI-powered screen presentations. Organizations use Screen Agents to deliver personalized, voice-guided walkthroughs of their web applications for sales demos, customer onboarding, product training, and technical support.

### Core Value Proposition

- **Sales Teams:** Convert website visitors into qualified leads by providing personalized product demos on-demand, 24/7
- **Customer Success:** Scale onboarding and reduce time-to-value with interactive presentations
- **Support Organizations:** Deflect support tickets with interactive troubleshooting guides
- **Product Teams:** Gather deep analytics on feature usage and friction points

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Web App    │  │  Admin UI    │  │  Public View │         │
│  │  (Next.js)   │  │  (Next.js)   │  │  (Next.js)   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  API Routes  │  │ Server       │  │  Server      │         │
│  │  (Next.js)   │  │ Components   │  │  Actions     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   MongoDB    │    │    Redis     │    │  S3 Storage  │
│  (Database)  │    │  (Job Queue) │    │  (Files)     │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌──────────────┐
                    │   Workers    │
                    │  (BullMQ)    │
                    └──────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   LiveKit    │    │   Stripe     │    │  AI Services │
│  (Video)     │    │  (Billing)   │    │  (OpenAI)    │
└──────────────┘    └──────────────┘    └──────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Browser Automation  │
                    │      Service        │
                    └─────────────────────┘
```

---

## Architecture Patterns

### 1. Multi-Tenancy Architecture

**Pattern**: Organization-based isolation with hybrid database approach

- **Prisma (Better Auth)**: Manages authentication data with type-safe operations
- **Mongoose (Application Data)**: Manages Screen Agents, Sessions, Analytics, Billing
- **Tenant Isolation**: All queries filtered by `organizationId` or `userId` (normal mode)

**Modes**:
- **Normal Mode**: User-scoped data (`userId` as tenant identifier)
- **Organization Mode**: Organization-scoped data (`organizationId` as tenant identifier)

### 2. API Architecture

**Pattern**: RESTful API with Next.js API Routes

- **Route Structure**: `/api/{resource}/{id?}/{action?}`
- **Authentication**: Better Auth session-based
- **Authorization**: Role-based access control (RBAC)
- **Error Handling**: Consistent error responses with Sentry integration

### 3. Background Processing

**Pattern**: Queue-based job processing with BullMQ

- **Queues**: `email`, `processing`, `webhooks`
- **Workers**: Separate worker processes for job execution
- **Retry Logic**: Exponential backoff with configurable retries
- **Monitoring**: Job status tracking and failure handling

### 4. File Storage Architecture

**Pattern**: S3-compatible storage with presigned URLs

- **Development**: DigitalOcean Spaces
- **Production**: AWS S3 (with IAM roles)
- **Security**: Presigned URLs (1-hour expiry) instead of credential sharing
- **Organization**: Files organized by `{organizationId}/knowledge/{knowledgeId}/`

---

## Technology Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4
- **Components**: shadcn/ui (Radix UI primitives)
- **Build Tool**: Turbopack (development)

### Backend
- **Framework**: Next.js API Routes
- **Server Components**: React Server Components
- **Server Actions**: Form handling and mutations
- **Runtime**: Node.js 18+

### Database
- **Primary**: MongoDB (Atlas recommended)
- **Hybrid Approach**:
  - **Prisma**: Better Auth authentication data
  - **Mongoose**: Application data (Screen Agents, Sessions, Analytics, Billing)
- **Connection**: Singleton pattern with lazy initialization

### Authentication & Authorization
- **Library**: Better Auth
- **Methods**: Email/password, Google OAuth
- **Session Management**: Database-backed sessions
- **Multi-Tenancy**: Organization-based isolation

### Background Processing
- **Queue System**: BullMQ
- **Message Broker**: Redis
- **Workers**: Separate Node.js processes
- **Job Types**: Email, knowledge processing, video analysis, billing

### External Services
- **Video Conferencing**: LiveKit
- **Billing**: Stripe
- **Email**: Resend
- **File Uploads**: Uploadthing (legacy), S3 (new)
- **AI Services**: OpenAI, Anthropic
- **Analytics**: PostHog
- **Error Tracking**: Sentry

---

## Database Architecture

### Hybrid Database Approach

**Why Hybrid?**
- Better Auth requires Prisma for type-safe authentication
- Application features benefit from Mongoose's rich schema validation
- Both use the same MongoDB database (Atlas recommended)

### Prisma (Better Auth)
- **Location**: `lib/db/prisma.ts`
- **Usage**: Authentication, sessions, users
- **Schema**: Auto-generated by Better Auth CLI
- **Connection**: Managed by Better Auth

### Mongoose (Application Data)
- **Location**: `lib/db/mongoose.ts`
- **Usage**: Screen Agents, Sessions, Analytics, Billing, Knowledge
- **Models**: Defined in `lib/models/`
- **Connection**: Singleton pattern with lazy initialization

### Key Models

**Screen Agents**:
- `ScreenAgent` - Agent configuration and settings
- `KnowledgeDocument` - Knowledge base documents
- `KnowledgeSource` - Knowledge extraction sources (URLs, files)

**Presentations**:
- `PresentationSession` - Session records and metadata
- `SessionRecording` - Video recordings and transcriptions

**Analytics**:
- `AnalyticsEvent` - User interaction events
- Usage tracking and aggregation

**Billing**:
- `BillingAccount` - Organization billing accounts
- `Billing` - Transaction records

**Organizations**:
- `Team` - Organization/team records
- `TeamMembership` - User-organization relationships

### Indexing Strategy

- **Organization Isolation**: All queries indexed by `organizationId`
- **User Isolation**: Normal mode queries indexed by `userId`
- **Composite Indexes**: `{ organizationId: 1, status: 1 }` for efficient filtering
- **Unique Constraints**: Email, shareable tokens, etc.

---

## Authentication & Authorization

### Authentication (Better Auth)

**Methods**:
- Email/password authentication
- Google OAuth (optional)
- Email verification via Resend
- Password reset functionality

**Session Management**:
- Database-backed sessions (MongoDB)
- Configurable session expiry
- Secure cookie-based session storage

**Configuration**:
- Location: `lib/auth/auth.ts`
- Environment variables: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

### Authorization (RBAC)

**Roles**:
- **Owner**: Full organization control
- **Admin**: Manage organization settings and members
- **Member**: Access organization resources
- **Team Admin**: Manage team resources (Enterprise)
- **Team Member**: Access team resources (Enterprise)

**Permissions**:
- **Basic**: Role-based permissions
- **Enterprise**: Custom permissions per role

**Implementation**:
- Location: `lib/utils/user-role.ts`
- Configuration: `config/roles.yaml`
- Middleware: `proxy.ts` (protected routes)

### Multi-Tenancy

**Tenant Identification**:
- **Normal Mode**: `userId` (user's own data)
- **Organization Mode**: `organizationId` (organization's data)

**Data Isolation**:
- All queries filtered by tenant identifier
- No cross-tenant data access
- Organization switching via Better Auth

**Implementation**:
- Location: `lib/utils/tenant-state.ts`
- Functions: `getTenantState()`, `getActiveOrganizationId()`

---

## Multi-Tenancy

### Tenant Modes

**Normal Mode**:
- User-scoped data
- No organization context
- Personal Screen Agents and sessions

**Organization Mode**:
- Organization-scoped data
- Team collaboration
- Shared Screen Agents and resources
- Role-based access control

### Organization Structure

```
Organization (Team)
├── Owner (1)
├── Admins (multiple)
├── Members (multiple)
└── Teams (Enterprise only)
    ├── Team Admin
    └── Team Members
```

### Data Isolation

**Strategy**: Query-level filtering

```typescript
// All queries include tenant filter
const query = {
  organizationId: knowledgeOrgId, // or userId in normal mode
  // ... other filters
}
```

**Security**:
- All API routes verify tenant access
- No cross-tenant data leakage
- Organization switching requires proper authentication

---

## API Architecture

### Route Structure

```
/api/{resource}/{id?}/{action?}
```

**Examples**:
- `GET /api/screen-agents` - List Screen Agents
- `POST /api/screen-agents` - Create Screen Agent
- `GET /api/screen-agents/[id]` - Get Screen Agent
- `PATCH /api/screen-agents/[id]` - Update Screen Agent
- `DELETE /api/screen-agents/[id]` - Delete Screen Agent
- `POST /api/screen-agents/[id]/resync` - Resync Screen Agent

### Authentication

**Middleware**: `proxy.ts` (Next.js 16 middleware)

**Protected Routes**:
- All `/api/*` routes (except `/api/auth/*`, `/api/health`)
- All `/(app)/*` routes

**Session Verification**:
```typescript
const session = await auth.api.getSession({ headers: await headers() })
if (!session) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

### Authorization

**Role Checking**:
```typescript
import { getUserRole } from "@/lib/utils/user-role"

const role = await getUserRole(session.user.id, organizationId)
if (role !== "owner" && role !== "admin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
```

### Error Handling

**Consistent Error Responses**:
```typescript
{
  error: string
  detail?: string
  code?: string
}
```

**Sentry Integration**:
```typescript
Sentry.captureException(error, {
  tags: {
    operation: "create_screen_agent",
    organizationId,
  },
})
```

---

## Knowledge Extraction System

### Overview

Knowledge extraction system processes various content sources (websites, documentation, videos, files) and extracts structured knowledge for Screen Agents to use during presentations.

### Architecture

**Components**:
1. **Frontend**: Knowledge creation and management UI
2. **Next.js API**: File upload to S3, ingestion request to browser automation service
3. **S3 Storage**: File storage (DigitalOcean Spaces / AWS S3)
4. **Browser Automation Service**: External service that processes content
5. **MongoDB**: Knowledge source metadata and extraction results

### Flow

```
User Uploads File
    │
    ▼
Next.js API validates & uploads to S3
    │
    ▼
S3 stores file, returns reference
    │
    ▼
Next.js API stores S3 reference in MongoDB
    │
    ▼
Next.js API sends S3 reference to Browser Automation Service
    │
    ▼
Browser Automation Service downloads from S3
    │
    ▼
Browser Automation Service processes & extracts knowledge
    │
    ▼
Results stored in MongoDB (via webhook or polling)
```

### Knowledge Sources

**Types**:
- **Website**: URL-based crawling
- **Documentation**: Documentation site crawling
- **Video**: Video file processing
- **File**: PDF, Markdown, text files

**Storage**:
- **URL-based**: Source URL stored in `sourceUrl`
- **File-based**: S3 reference stored in `s3Reference`

### Sync History

**Tracking**: All sync operations tracked in `syncHistory` array

**Entries**:
- Initial sync
- Resync operations
- Status updates
- Progress tracking

---

## S3 File Storage Architecture

### Overview

This section describes the S3-based file storage architecture for knowledge extraction. Files are uploaded to S3 (DigitalOcean Spaces in development, AWS S3 in production) before being processed by the browser automation service.

### Key Benefits
- **Scalability**: S3 handles large files efficiently
- **Security**: Presigned URLs eliminate credential sharing
- **Reliability**: S3 provides durable storage with redundancy
- **Cost-Effective**: Pay only for storage used
- **Multi-Provider**: Supports both DigitalOcean Spaces and AWS S3

### Storage Strategy
- **Development**: DigitalOcean Spaces (S3-compatible) with access key/secret
- **Production**: AWS S3 with IAM roles (or access key/secret if needed)
- **File Types Supported**: Videos, docs (PDF, MD, TXT, HTML), text files, audio files, YAML/JSON files

### System Flow

```
┌─────────┐      ┌──────────┐      ┌──────┐      ┌──────────────┐      ┌─────────────────────┐
│ Client  │─────▶│ Next.js  │─────▶│  S3  │─────▶│   MongoDB    │─────▶│ Browser Automation │
│         │      │   API    │      │      │      │              │      │      Service       │
└─────────┘      └──────────┘      └──────┘      └──────────────┘      └─────────────────────┘
   │                  │                │                  │                        │
   │ Upload File      │ Upload to S3   │ Store Reference │ Send S3 Reference      │ Download from S3
   │                  │                │                 │                        │
   └──────────────────┴────────────────┴─────────────────┴────────────────────────┘
```

### Detailed Flow
1. **Client** uploads file via multipart/form-data to Next.js API
2. **Next.js API** validates file type and size
3. **Next.js API** uploads file to S3 and generates presigned URL
4. **Next.js API** stores S3 reference and metadata in MongoDB
5. **Next.js API** sends S3 reference (with presigned URL) to browser automation service
6. **Browser Automation Service** downloads file from S3 using presigned URL
7. **Browser Automation Service** processes file and extracts knowledge

### Implementation Status

#### ✅ Completed Phases

**Phase 1: S3 Infrastructure Setup ✅**
- ✅ Installed AWS SDK (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- ✅ Created S3 client utility (`lib/storage/s3-client.ts`)
  - Supports both DigitalOcean Spaces and AWS S3
  - Lazy initialization pattern (per RULESETS.md)
  - Presigned URL generation
  - File validation utilities
- ✅ Added S3 environment variables to `env.mjs`

**Phase 2: File Upload API ✅**
- ✅ Created `/api/knowledge/upload-to-s3` endpoint
- ✅ File type validation (videos, docs, audio, data files)
- ✅ File size limits enforcement
- ✅ S3 key generation (`{organizationId}/knowledge/{knowledgeId}/{timestamp}-{filename}`)
- ✅ Presigned URL generation (1-hour expiry)

**Phase 3: Knowledge Creation Updates ✅**
- ✅ Updated `/api/knowledge/route.ts` to support S3 uploads
- ✅ New flow: Upload to S3 → Get S3 reference → Send to browser automation service
- ✅ Backward compatibility: Can disable S3 with `use_s3=false` form parameter
- ✅ Updated `IngestionStartRequest` interface to include S3 reference
- ✅ Updated `startIngestion` client to send S3 reference
- ✅ Resync endpoint updated to support S3 references for file-based sources

**Phase 4: Sync History Tracking ✅**
- ✅ Verified all sync operations properly append to `syncHistory` array
- ✅ Resync operations create new entries (preserves all history)
- ✅ Initial sync creates first entry
- ✅ Status updates modify existing entries (no duplicates)
- ✅ All sync processes are tracked

**Phase 5: Model Updates ✅**
- ✅ Added `s3Reference` field to KnowledgeSource schema
- ✅ Added `fileMetadata` field to KnowledgeSource schema
- ✅ Updated TypeScript interfaces

**Phase 6: Frontend Updates ✅**
- ✅ Updated knowledge creation form to use S3 upload flow
- ✅ Show upload progress for S3 uploads (with progress bar and status indicators)
- ✅ Handle S3 upload errors gracefully (error states displayed)
- ✅ File type validation in frontend (already implemented)

### S3 Client Features

**Location**: `lib/storage/s3-client.ts`

**Key Features**:
- **Lazy Initialization**: S3 client is created only when needed (per RULESETS.md)
- **Multi-Provider Support**: Works with AWS S3 and DigitalOcean Spaces
- **Presigned URLs**: Secure file access without credential sharing
- **File Validation**: Type and size validation before upload
- **Error Handling**: Comprehensive error handling with Sentry integration

**Key Functions**:
- `uploadFileToS3()`: Upload file to S3 and return reference
- `generatePresignedUrl()`: Generate presigned URL for downloading
- `fileExists()`: Check if file exists in S3
- `generateS3Key()`: Generate unique S3 key
- `validateFileType()`: Validate file type against allowed types
- `getFileSizeLimit()`: Get file size limit based on type

### Knowledge Creation Flow (New)

1. **Client** sends file via multipart/form-data to `/api/knowledge`
2. **API** validates file type and size
3. **API** uploads file to S3 using `uploadFileToS3()`
4. **API** generates presigned URL (valid for 1 hour)
5. **API** creates knowledge source record with S3 reference in MongoDB
6. **API** sends S3 reference to browser automation service via `startIngestion()`
7. **Browser Automation Service** downloads file from S3 using presigned URL
8. **Browser Automation Service** processes file

### Sync History Tracking

**Implementation**: All sync operations properly track history in `syncHistory` array

- **Initial Sync**: Creates first entry in `syncHistory` array
- **Resync**: Appends new entry to `syncHistory` array (preserves all history)
- **Status Updates**: Updates existing entry (doesn't create duplicates)
- **All Operations**: Properly tracked and preserved

**Example Sync History**:
```typescript
syncHistory: [
  {
    jobId: "job-1",
    workflowId: "workflow-1",
    status: "completed",
    triggerType: "initial",
    startedAt: "2025-01-15T10:00:00Z",
    completedAt: "2025-01-15T10:05:00Z",
    progress: 100,
    errorMessages: [],
    warnings: []
  },
  {
    jobId: "job-2",
    workflowId: "workflow-2",
    status: "running",
    triggerType: "resync",
    startedAt: "2025-01-15T12:00:00Z",
    progress: 50,
    errorMessages: [],
    warnings: []
  }
]
```

### File Type Support

**Supported Types**:
- **Videos**: `.mp4`, `.mov`, `.avi`, `.webm`, `.mkv`
- **Documents**: `.pdf`, `.md`, `.txt`, `.html`, `.docx`, `.pptx`
- **Audio**: `.mp3`, `.wav`, `.ogg`, `.m4a`
- **Data Files**: `.yaml`, `.yml`, `.json`, `.xml`
- **Code**: `.js`, `.ts`, `.py`, `.java`, `.cpp`, etc.

**File Size Limits**:
- Videos: 500MB
- Documents: 50MB
- Audio: 100MB
- Data/Code: 10MB

### S3 Key Structure

**Format**: `{organizationId}/knowledge/{knowledgeId}/{timestamp}-{filename}`

**Example**: `org-123/knowledge/know-456/20250115-120000-documentation.pdf`

**Benefits**:
- Organized by organization
- Easy to find all files for a knowledge source
- Timestamp prevents naming conflicts
- Supports easy cleanup/deletion

### Browser Automation Service API Changes

**Unified Endpoint**: Extend `/api/knowledge/ingest/start` to support both URL-based and S3-based file ingestion.

**Request Body**:
```json
{
  "source_type": "documentation" | "website" | "video" | "file",
  
  // For URL-based sources (existing functionality)
  "source_url": string,  // Required for documentation, website, video
  
  // For file-based sources (NEW)
  "s3_reference": {
    "bucket": string,
    "key": string,
    "region": string,        // Optional, for AWS
    "endpoint": string,      // Optional, for DigitalOcean Spaces
    "presigned_url": string, // Presigned URL for downloading (valid for 1 hour)
    "expires_at": string     // ISO 8601 timestamp
  },
  "file_metadata": {
    "filename": string,
    "size": number,
    "content_type": string,
    "uploaded_at": string    // ISO 8601 timestamp
  },
  
  // Common options
  "options": {
    "max_pages": number,           // website only
    "max_depth": number,           // website only
    "extract_code_blocks": boolean, // documentation only
    "extract_thumbnails": boolean   // video only
  },
  "job_id": string  // Optional, auto-generated if not provided
}
```

### Configuration

#### Environment Variables

**Development (DigitalOcean Spaces)**:
```env
S3_PROVIDER=digitalocean
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_REGION=nyc3
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
```

**Production (AWS S3)**:
```env
S3_PROVIDER=aws
S3_REGION=us-east-1
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY_ID=your-access-key  # Optional if using IAM roles
S3_SECRET_ACCESS_KEY=your-secret-key  # Optional if using IAM roles
# If using IAM roles, credentials come from environment/instance profile
```

### Data Models

**KnowledgeSource Schema Updates**:
```typescript
{
  // Existing fields...
  sourceType: "documentation" | "website" | "video" | "file"
  sourceUrl?: string  // For URL-based sources
  sourceName: string
  
  // NEW: S3 storage reference (for file-based sources)
  s3Reference?: {
    bucket: string
    key: string
    region?: string
    endpoint?: string
    url?: string  // Public URL if available
  }
  
  // NEW: File metadata
  fileMetadata?: {
    originalFilename: string
    size: number
    contentType: string
    uploadedAt: Date
  }
  
  // Sync history (tracks all sync operations)
  syncHistory?: Array<{
    jobId: string
    workflowId?: string
    status: "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"
    triggerType: "initial" | "resync"
    startedAt: Date
    completedAt?: Date
    phase?: string
    progress?: number  // 0-100
    errorMessages?: string[]
    warnings?: string[]
  }>
}
```

### Error Handling

**S3 Upload Failures**:
- **Error**: S3 upload fails (network, permissions, etc.)
- **Action**: Return error to client, don't create knowledge record
- **Recovery**: Client can retry upload

**S3 Download Failures (Browser Automation Service)**:
- **Error**: Service cannot download from S3
- **Action**: Service should retry with exponential backoff
- **Recovery**: Request new presigned URL if expired

**Presigned URL Expiry**:
- **Error**: Presigned URL expires during processing
- **Action**: Service should request new presigned URL before expiry
- **Recovery**: New endpoint: `POST /api/knowledge/presigned-url`

### Security

**Presigned URLs**:
- **Validity**: 1 hour expiry
- **Scope**: Specific to bucket/key combination
- **Security**: No credential sharing required
- **Best Practice**: Generate new presigned URL if processing takes longer than 1 hour

**Bucket Policies**:
- **Access Control**: Restrict access to specific paths
- **Encryption**: Enable S3 server-side encryption
- **IAM Roles**: Use IAM roles in production (recommended)
- **CORS**: Configure CORS for browser uploads if needed

**Credentials**:
- **Storage**: Never log or expose credentials
- **Environment**: Store in environment variables only
- **IAM Roles**: Prefer IAM roles over access keys in production
- **Rotation**: Rotate credentials regularly

---

## Browser Automation Service

### Overview

The Browser Automation Service is an external Python service that handles browser automation, knowledge extraction, and real-time screen sharing. It supports multiple communication channels for different use cases.

### Communication Architecture

**Critical Architectural Decision**: This architecture is designed to handle **thousands of concurrent browser sessions** efficiently.

#### Communication Types

| Communication Type | Direction | Technology | Why? |
|-------------------|-----------|------------|------|
| **Jobs** (Knowledge Retrieval) | API → Worker | **RQ** | Needs persistence & retry for long-running tasks. |
| **Real-time Events** (Page loaded, DOM updated, Mouse moved) | Browser → Agent | **Redis Pub/Sub** | Needs <5ms latency. No persistence needed. |
| **Heavy Results** (Scraped data, Screenshots) | Browser → Agent | **Redis/S3 + Pub/Sub** | Store data, notify agent of location via Pub/Sub. |

#### 1. Agent → Browser Service (Commands)

**Use: RQ (Redis Queue)**

**Why RQ?**
- ✅ **Reliability**: Commands must not be lost. If Browser Service is restarting or busy, commands sit in the queue until processed.
- ✅ **Retry Logic**: Failed commands can be retried automatically.
- ✅ **Job Management**: Track job status (queued → active → completed/failed).
- ✅ **Scalability**: Handle thousands of concurrent commands efficiently.

**Implementation**:
```python
from rq import Queue, Retry
from redis import Redis

# IMPORTANT: RQ requires decode_responses=False because it stores binary data (pickled objects) in Redis
redis_conn = Redis.from_url("redis://localhost:6379", decode_responses=False)
knowledge_queue = Queue("knowledge-retrieval", connection=redis_conn)

job = knowledge_queue.enqueue(
    'navigator.knowledge.job_queue:process_knowledge_job',
    {
        'start_url': start_url,
        'max_pages': max_pages,
        'job_id': job_id,
    },
    job_id=job_id,
    retry=Retry(max=3, interval=60),
    job_timeout='1h',
)
```

#### 2. Browser Service → Agent (Events)

**Use: Redis Pub/Sub** (NOT RQ)

**Why Redis Pub/Sub?**
- ✅ **Speed**: Sub-millisecond latency for real-time events.
- ✅ **Fan-Out**: Multiple agents can subscribe to the same channel.
- ✅ **Lightweight**: No persistence overhead - events are fire-and-forget.
- ✅ **High Throughput**: Can handle millions of events per second.

**Implementation**:
```python
# Browser Service (Publisher)
from redis.asyncio import Redis
import json

redis_client = Redis(host='localhost', port=6379)

async def broadcast_event(session_id, event_type, event_data):
    channel = f"browser:events:{session_id}"
    await redis_client.publish(
        channel,
        json.dumps({
            "type": event_type,
            "data": event_data,
            "timestamp": time.time()
        })
    )
```

### MongoDB Persistence

**Default Connection**: `mongodb://localhost:27017`  
**Default Database**: `browser_automation_service`

**MongoDB Collections**:
All collections use the standardized prefix `brwsr_auto_svc_`:

- **`brwsr_auto_svc_pages`**: Knowledge retrieval pages (content, metadata)
- **`brwsr_auto_svc_links`**: Link relationships between pages
- **`brwsr_auto_svc_embeddings`**: Vector embeddings for semantic search
- **`brwsr_auto_svc_sessions`**: Presentation flow session state
- **`brwsr_auto_svc_jobs`**: Knowledge retrieval job state and metadata

### Redis Integration

**Default Connection**: `redis://localhost:6379`

#### Redis Pub/Sub Channels

**Browser Events Channel**:
- **Channel Pattern**: `browser:events:{room_name}`
- **Purpose**: Real-time event streaming for browser automation sessions
- **Event Types**: `page_navigation`, `page_load_complete`, `action_completed`, `action_error`, `dom_change`, `browser_error`, `screen_content_update`, `presentation_started`, `presentation_paused`, `presentation_resumed`, `action_queued`, `action_processing`

**Knowledge Retrieval Progress Channels**:
- **Channel Pattern**: `exploration:{job_id}:progress`
- **Purpose**: Real-time progress updates for knowledge retrieval jobs
- **Channels**: `exploration:{job_id}:progress`, `exploration:{job_id}:page_completed`, `exploration:external_links`, `exploration:errors`

#### RQ Queues

**Knowledge Retrieval Queue**:
- **Queue Name**: `knowledge-retrieval`
- **Purpose**: Durable job queue for long-running knowledge retrieval tasks
- **Worker Management**: Automatically managed by JobManager (no manual startup needed)
- **Auto-scaling**: Workers scale up/down based on queue length
- **Health Monitoring**: Dead workers are automatically restarted
- **Stuck Job Monitor**: Jobs stuck in 'queued' status for >2 minutes are automatically marked as failed

**Redis Configuration**:
- **CRITICAL**: RQ requires `decode_responses=False` because it stores binary data (pickled objects) in Redis
- RQ handles encoding/decoding internally

### REST API

**Base URL**: `http://localhost:8000`

**Endpoints**:
- `POST /mcp/tools/call` - Execute MCP tools via HTTP
- `GET /mcp/tools` - List all available MCP tools
- `GET /health` - Health check endpoint
- `GET /rooms/{room_name}/connections` - Get WebSocket connection count
- `POST /api/knowledge/explore/start` - Start knowledge retrieval job
- `GET /api/knowledge/explore/status/{job_id}` - Get job status
- `POST /api/knowledge/explore/pause` - Pause job
- `POST /api/knowledge/explore/resume` - Resume job
- `POST /api/knowledge/explore/cancel` - Cancel job
- `GET /api/knowledge/explore/results/{job_id}` - Get job results
- `GET /api/knowledge/explore/jobs` - List all jobs

**OpenAPI/Swagger Specification**:
- Available at `http://localhost:8000/docs` (Swagger UI)
- Available at `http://localhost:8000/redoc` (ReDoc)
- OpenAPI JSON: `http://localhost:8000/openapi.json`

### MCP Protocol

The Browser Automation Service exposes capabilities as MCP tools, allowing external services to control browser automation via the Model Context Protocol.

**Server Name**: `browser-automation-service`

**Connection**: 
- **HTTP**: `http://localhost:8000/mcp/tools/call`
- **WebSocket**: `ws://localhost:8000/mcp/events/{room_name}` (optional, Redis Pub/Sub preferred)
- **STDIO**: For Claude Desktop integration

**Browser Automation Tools**:
1. `start_browser_session` - Start a new browser session for a LiveKit room with video streaming
2. `pause_browser_session` - Pause video publishing for a browser session
3. `resume_browser_session` - Resume video publishing for a browser session
4. `close_browser_session` - Close a browser session and stop streaming
5. `execute_action` - Execute a browser action command (navigate, click, type, scroll, wait, go_back, refresh, send_keys)
6. `get_browser_context` - Get current browser context (URL, title, ready state, scroll position, viewport, cursor position)
7. `get_screen_content` - Get screen content with DOM summary
8. `recover_browser_session` - Attempt to recover a failed browser session

**Knowledge Retrieval Tools**:
9. `start_knowledge_exploration` - Start a knowledge retrieval job
10. `get_exploration_status` - Get live status and progress for a job
11. `pause_exploration` - Pause a running job
12. `resume_exploration` - Resume a paused job
13. `cancel_exploration` - Cancel a job
14. `get_knowledge_results` - Get results for a job
15. `query_knowledge` - Query stored knowledge (pages, semantic search, links, sitemaps)

### WebSocket Interface

**URL**: `/mcp/events/{room_name}`

**Purpose**: Alternative real-time event streaming via WebSocket (optional fallback)

**Note**: The primary event streaming mechanism is **Redis Pub/Sub** for better performance and scalability. WebSocket is available as an optional fallback.

### LiveKit Integration

**Purpose**: Video streaming and real-time data

**Transport**: WebRTC via LiveKit

**Configuration**:
- **Environment Variables**:
  - `LIVEKIT_URL`: LiveKit server URL (e.g., `wss://livekit.example.com`)
  - `LIVEKIT_API_KEY`: LiveKit API key
  - `LIVEKIT_API_SECRET`: LiveKit API secret
- **Or**: Provide pre-generated token via `livekit_token` parameter

**Video Streaming**:
- **Frame Rate**: Configurable (default: 10 FPS)
- **Viewport**: Configurable (default: 1920x1080)
- **Encoding**: H.264
- **Quality**: Adaptive based on network conditions

### Event Types

**Browser Automation Events**:
- `page_navigation` - Page navigation occurred
- `page_load_complete` - Page finished loading
- `action_completed` - Action completed successfully
- `action_error` - Action failed
- `dom_change` - Significant DOM change
- `browser_error` - Browser error occurred
- `screen_content_update` - Screen content updated
- `presentation_started` - Presentation session started
- `presentation_paused` - Presentation paused
- `presentation_resumed` - Presentation resumed
- `action_queued` - Action queued for execution
- `action_processing` - Action being processed

**Knowledge Retrieval Events**:
- `exploration_progress` - Real-time progress updates
- `page_completed` - Page completed during exploration
- `external_link_detected` - External link detected (not followed)
- `exploration_error` - Error occurred during exploration

### Performance Considerations

**Redis Pub/Sub**:
- **Latency**: Sub-millisecond for local Redis
- **Throughput**: Millions of events per second
- **Fan-Out**: Multiple subscribers per channel
- **No Persistence**: Events are fire-and-forget

**RQ (Redis Queue)**:
- **Latency**: ~1-5ms for job queuing
- **Throughput**: Thousands of jobs per second
- **Persistence**: Jobs stored in Redis
- **Retry**: Automatic retry with configurable interval (max=3, interval=60s)
- **Workers**: Auto-scaling worker processes managed by JobManager
- **Redis Configuration**: **CRITICAL** - RQ requires `decode_responses=False`

**WebSocket**:
- **Latency**: ~10-50ms (network dependent)
- **Throughput**: Limited by connection count
- **Persistence**: No persistence (connection-based)
- **Use Case**: Fallback for clients that prefer WebSocket

### Connection Pooling Best Practices

**⚠️ Critical: Connection Pooling**

With thousands of agents, you cannot open a new Redis connection for every single message.

**❌ DON'T DO THIS**:
```python
async def send_event():
    redis = Redis()  # New connection every time - BAD!
    await redis.publish(...)
```

**✅ DO THIS**:
```python
# Global connection pool (shared across all agents in process)
_redis_pool = None

async def get_redis():
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = Redis(host='localhost', port=6379)
    return _redis_pool

async def send_event():
    redis = await get_redis()  # Reuse connection pool
    await redis.publish(...)
```

---

## Background Processing

### Queue System (BullMQ)

**Location**: `lib/queue/`

**Queues**:
- **email**: Email sending (5 workers)
- **processing**: Long-running tasks (3 workers)
- **webhooks**: External HTTP calls (10 workers)

### Job Types

**Email Jobs**:
- Welcome emails
- Verification emails
- Notification emails

**Processing Jobs**:
- Knowledge extraction processing
- Video analysis
- Usage aggregation

**Webhook Jobs**:
- Stripe webhooks
- External service callbacks

### Worker Process

**Location**: `scripts/worker.ts`

**Execution**:
```bash
pnpm worker
```

**Features**:
- Automatic retry with exponential backoff
- Job status tracking
- Error handling and logging
- Graceful shutdown

### Redis Connection

**Location**: `lib/queue/redis.ts`

**Pattern**: Singleton with lazy initialization

**Configuration**: `REDIS_URL` environment variable

---

## External Services Integration

### LiveKit (Video Conferencing)

**Usage**: Real-time screen sharing and video conferencing

**Features**:
- Screen sharing
- Voice communication
- Session recording
- Token-based authentication

**Configuration**: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`

### Stripe (Billing)

**Usage**: Payment processing and subscription management

**Features**:
- Pay-as-you-go billing
- Auto-reload functionality
- Invoice generation
- Webhook handling

**Configuration**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

**API Version**: `2025-02-24.acacia` (per RULESETS.md)

### Resend (Email)

**Usage**: Transactional email sending

**Features**:
- Welcome emails
- Verification emails
- Notification emails

**Configuration**: `RESEND_API_KEY`, `EMAIL_FROM`

### S3 Storage

**Usage**: File storage for knowledge extraction

**Providers**:
- DigitalOcean Spaces (development)
- AWS S3 (production)

**Configuration**: `S3_PROVIDER`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

### AI Services

**OpenAI**:
- Voice generation
- Knowledge processing
- Analytics insights

**Anthropic**:
- Alternative AI provider
- Knowledge processing

**Configuration**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`

---

## Security Architecture

### Authentication Security

- **Session Management**: Secure, database-backed sessions
- **Password Hashing**: Better Auth handles password security
- **OAuth**: Secure OAuth 2.0 flow with Google

### Authorization Security

- **RBAC**: Role-based access control
- **Tenant Isolation**: Query-level filtering prevents cross-tenant access
- **Route Protection**: Middleware protects all authenticated routes

### Data Security

- **Encryption**: S3 server-side encryption
- **Presigned URLs**: Time-limited access (1-hour expiry)
- **Credentials**: Never logged or exposed
- **Environment Variables**: Secure storage of secrets

### API Security

- **Rate Limiting**: Per-route rate limiting
- **CORS**: Configured for specific origins
- **Input Validation**: Zod schema validation
- **Error Handling**: No sensitive data in error messages

---

## Deployment Architecture

### Development

**Local Setup**:
- Next.js dev server (Turbopack)
- MongoDB (local or Atlas)
- Redis (Docker or local)
- S3 (DigitalOcean Spaces)

**Docker Compose**:
- App service
- Worker service
- Redis service

### Production

**Recommended Stack**:
- **Hosting**: Vercel, AWS, or DigitalOcean App Platform
- **Database**: MongoDB Atlas
- **Cache/Queue**: Redis Cloud or AWS ElastiCache
- **Storage**: AWS S3 or DigitalOcean Spaces
- **CDN**: Vercel Edge Network or CloudFront

### Environment Variables

**Required**:
- `MONGODB_URI`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

**Optional**:
- `REDIS_URL`
- `S3_*` variables
- `STRIPE_*` variables
- `LIVEKIT_*` variables
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

**See**: `.env.example` for complete list

---

## Related Documentation

- **API Reference**: `docs/API_REFERENCE.md`
- **Development Guide**: `docs/DEVELOPMENT.md`