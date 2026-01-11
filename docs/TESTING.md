# Screen Agent Platform - Testing Documentation

Comprehensive testing tracker organized by feature, flow, and functionality. This document serves as a sign-off checklist to ensure the entire platform is thoroughly tested before release.

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [User Onboarding Flow](#user-onboarding-flow)
3. [Screen Agent Creation & Management](#screen-agent-creation--management)
4. [Presentation Session Flow](#presentation-session-flow)
5. [Knowledge Management](#knowledge-management)
6. [Analytics & Insights](#analytics--insights)
7. [Billing & Usage Flow](#billing--usage-flow)
8. [Multi-Tenancy & Organizations](#multi-tenancy--organizations)
9. [Team Management (Enterprise)](#team-management-enterprise)
10. [Platform Administration](#platform-administration)
11. [API Endpoints](#api-endpoints)
12. [Integration & External Services](#integration--external-services)
13. [Performance & Scalability](#performance--scalability)
14. [Security & Compliance](#security--compliance)
15. [User Experience & Accessibility](#user-experience--accessibility)
16. [Sign-Off Checklist](#sign-off-checklist)

---

## Testing Strategy

### Testing Levels

1. **Unit Tests**: Individual components and functions (Vitest + React Testing Library)
2. **Integration Tests**: API endpoints and database operations (Vitest)
3. **E2E Tests**: Complete user flows (Playwright)
4. **Manual Tests**: UI/UX, edge cases, exploratory testing
5. **Performance Tests**: Load, stress, and scalability testing
6. **Security Tests**: Authentication, authorization, data protection

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

### Test Automation Indicators

- 🤖 **Automated**: Test is automated (unit/integration/E2E)
- 👤 **Manual**: Test requires manual execution
- 🔄 **Hybrid**: Partially automated, requires manual verification

---

## User Onboarding Flow

### Registration & Account Setup

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ONBOARD-001 | User can register with email/password | 🤖 E2E | P0 | ⬜ | Create account, verify email |
| ONBOARD-002 | User can register/login with Google OAuth | 🤖 E2E | P1 | ⬜ | OAuth flow completes successfully |
| ONBOARD-003 | Email verification required before account activation | 🤖 E2E | P0 | ⬜ | Cannot access app without verification |
| ONBOARD-004 | Password reset flow works correctly | 🤖 E2E | P0 | ⬜ | Reset email sent, password updated |
| ONBOARD-005 | User can login with valid credentials | 🤖 E2E | P0 | ⬜ | Successful login redirects to dashboard |
| ONBOARD-006 | User cannot login with invalid credentials | 🤖 E2E | P0 | ⬜ | Error message displayed |
| ONBOARD-007 | Session persists across browser restarts | 👤 Manual | P1 | ⬜ | Login state maintained |
| ONBOARD-008 | Session expires after inactivity | 👤 Manual | P1 | ⬜ | Redirect to login after timeout |
| ONBOARD-009 | User can logout successfully | 🤖 E2E | P0 | ⬜ | Session cleared, redirected to login |

### Onboarding Wizard

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ONBOARD-010 | Onboarding wizard displays after first login | 🤖 E2E | P1 | ⬜ | Wizard appears |
| ONBOARD-011 | User can skip onboarding wizard | 🤖 E2E | P1 | ⬜ | Skip button works |
| ONBOARD-012 | User can accept team invitation during onboarding | 🤖 E2E | P2 | ⬜ | Invitation flow integrated |
| ONBOARD-013 | Onboarding tour highlights key features | 👤 Manual | P2 | ⬜ | Tour displays correctly |
| ONBOARD-014 | Organization created during onboarding | 🤖 E2E | P0 | ⬜ | Default org created, user is owner |

### Route Protection & Access Control

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ONBOARD-015 | Unauthenticated user redirected from protected routes | 🤖 E2E | P0 | ⬜ | `/dashboard`, `/billing`, `/screen-agents` |
| ONBOARD-016 | Authenticated user can access protected routes | 🤖 E2E | P0 | ⬜ | All protected routes accessible |
| ONBOARD-017 | Platform admin routes require `platform_admin` role | 🤖 E2E | P0 | ⬜ | `/platform/*` routes protected |
| ONBOARD-018 | Organization routes require organization membership | 🤖 E2E | P0 | ⬜ | Cannot access other orgs' data |

---

## Screen Agent Creation & Management

### Creation Wizard Flow

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| AGENT-001 | User can start Screen Agent creation wizard | 🤖 E2E | P0 | ⬜ | Wizard opens from dashboard |
| AGENT-002 | Step 1: Basic Information validates required fields | 🤖 E2E | P0 | ⬜ | Name, website URL required |
| AGENT-003 | Step 1: Website URL validation works | 🤖 E2E | P0 | ⬜ | Invalid URLs rejected |
| AGENT-004 | Step 2: Voice configuration saves correctly | 🤖 E2E | P1 | ⬜ | Provider, voice ID, language |
| AGENT-005 | Step 2: Voice preview works | 👤 Manual | P2 | ⬜ | Preview audio plays |
| AGENT-006 | Step 3: Website credentials encrypted at rest | 🤖 Integration | P0 | ⬜ | Verify encryption in database |
| AGENT-007 | Step 3: Credential test connection works | 🤖 E2E | P1 | ⬜ | Test button validates credentials |
| AGENT-008 | Step 4: Knowledge documents upload successfully | 🤖 E2E | P1 | ⬜ | PDF, video, audio, URLs |
| AGENT-009 | Step 4: File size limits enforced | 🤖 E2E | P1 | ⬜ | Large files rejected |
| AGENT-010 | Step 4: File type validation works | 🤖 E2E | P0 | ⬜ | Invalid types rejected |
| AGENT-011 | Step 5: Agent personality settings save | 🤖 E2E | P2 | ⬜ | Welcome message, traits |
| AGENT-012 | Wizard auto-saves draft on navigation | 👤 Manual | P2 | ⬜ | Progress saved between steps |
| AGENT-013 | Agent can be saved as Draft | 🤖 E2E | P0 | ⬜ | Draft status, not published |
| AGENT-014 | Agent validation before publishing | 🤖 E2E | P0 | ⬜ | Website reachable, voice valid |
| AGENT-015 | Agent publishes successfully | 🤖 E2E | P0 | ⬜ | Status: Active, shareable link generated |

### Agent Management Operations

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| AGENT-016 | User can view list of Screen Agents | 🤖 E2E | P0 | ⬜ | Filter, search, pagination |
| AGENT-017 | User can filter agents by status | 🤖 E2E | P1 | ⬜ | Draft, Active, Paused, Archived |
| AGENT-018 | User can search agents by name | 🤖 E2E | P1 | ⬜ | Search functionality works |
| AGENT-019 | User can edit Screen Agent configuration | 🤖 E2E | P0 | ⬜ | Update all fields |
| AGENT-020 | User can pause/resume Screen Agent | 🤖 E2E | P0 | ⬜ | Status changes, link behavior |
| AGENT-021 | User can archive Screen Agent | 🤖 E2E | P1 | ⬜ | Status: Archived, link unavailable |
| AGENT-022 | User can delete Screen Agent | 🤖 E2E | P1 | ⬜ | Confirmation required, soft delete |
| AGENT-023 | Agent duplication works | 🤖 E2E | P2 | ⬜ | Duplicate creates new agent |

### Sharing & Distribution

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| AGENT-024 | Shareable link works for Active agents | 🤖 E2E | P0 | ⬜ | Public access via token |
| AGENT-025 | Shareable link returns error for Paused agents | 🤖 E2E | P0 | ⬜ | "Unavailable" message |
| AGENT-026 | Shareable link returns error for Archived agents | 🤖 E2E | P0 | ⬜ | "Not found" message |
| AGENT-027 | Embed code generates correctly | 🤖 E2E | P1 | ⬜ | iframe code with correct parameters |
| AGENT-028 | QR code generates for shareable link | 👤 Manual | P2 | ⬜ | QR code displays correctly |
| AGENT-029 | Custom branding options work (Enterprise) | 🤖 E2E | P2 | ⬜ | Logo, colors applied |

### Visibility & Access Control

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| AGENT-030 | Private agents visible only to owner | 🤖 E2E | P0 | ⬜ | Not visible to other users |
| AGENT-031 | Team agents visible to team members | 🤖 E2E | P0 | ⬜ | Team members can access |
| AGENT-032 | Organization agents visible to org members | 🤖 E2E | P0 | ⬜ | All org members can access |
| AGENT-033 | Public agents accessible via shareable link | 🤖 E2E | P0 | ⬜ | No auth required |

### Usage Limits & Quotas

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| AGENT-034 | Free tier allows only 1 Screen Agent | 🤖 E2E | P0 | ⬜ | Creation blocked after limit |
| AGENT-035 | Usage limit warning displayed at 80% | 🤖 E2E | P1 | ⬜ | Banner notification |
| AGENT-036 | Screen Agent creation blocked at limit | 🤖 E2E | P0 | ⬜ | Error message, upgrade prompt |
| AGENT-037 | Enterprise tier allows unlimited agents | 🤖 E2E | P0 | ⬜ | No limit enforced |

---

## Presentation Session Flow

### Session Initiation

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| SESSION-001 | Viewer can access presentation via shareable link | 🤖 E2E | P0 | ⬜ | Public access without auth |
| SESSION-002 | Session token validates correctly | 🤖 Integration | P0 | ⬜ | Invalid tokens rejected |
| SESSION-003 | Expired session tokens rejected | 🤖 E2E | P0 | ⬜ | "Session expired" message |
| SESSION-004 | Viewer authentication required when configured | 🤖 E2E | P0 | ⬜ | Email/SSO required |
| SESSION-005 | Pre-session questions collect data | 👤 Manual | P2 | ⬜ | Custom fields saved |
| SESSION-006 | Session creates LiveKit room | 🤖 Integration | P0 | ⬜ | Room ID stored, room active |
| SESSION-007 | Session initialization completes successfully | 🤖 E2E | P0 | ⬜ | All components loaded |

### Live Presentation Experience

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| SESSION-008 | Video stream displays correctly | 👤 Manual | P0 | ⬜ | Screen agent video visible |
| SESSION-009 | Audio stream works correctly | 👤 Manual | P0 | ⬜ | Voice narration audible |
| SESSION-010 | Audio quality is clear and consistent | 👤 Manual | P1 | ⬜ | No distortion, good quality |
| SESSION-011 | Viewer can ask questions via voice | 👤 Manual | P1 | ⬜ | Voice input transcribed |
| SESSION-012 | Viewer can ask questions via text | 🤖 E2E | P1 | ⬜ | Text questions sent |
| SESSION-013 | Agent responds to viewer questions | 👤 Manual | P1 | ⬜ | AI response generated |
| SESSION-014 | Agent responses are contextually relevant | 👤 Manual | P1 | ⬜ | Responses use knowledge base |
| SESSION-015 | Screen navigation works correctly | 👤 Manual | P0 | ⬜ | Agent navigates website |
| SESSION-016 | Navigation is smooth and accurate | 👤 Manual | P1 | ⬜ | No lag, correct pages |
| SESSION-017 | Presentation controls work (mute, fullscreen) | 👤 Manual | P1 | ⬜ | Controls functional |
| SESSION-018 | Viewer can pause/resume presentation | 👤 Manual | P2 | ⬜ | Pause functionality works |
| SESSION-019 | Session timeout closes after max duration | 🤖 E2E | P0 | ⬜ | Session ends automatically |

### Session Completion & Cleanup

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| SESSION-020 | Viewer can end session manually | 🤖 E2E | P0 | ⬜ | End button works |
| SESSION-021 | Post-session survey collects feedback | 🤖 E2E | P1 | ⬜ | Survey data saved |
| SESSION-022 | Session duration calculated correctly | 🤖 Integration | P0 | ⬜ | Duration in seconds accurate |
| SESSION-023 | Usage minutes tracked for billing | 🤖 Integration | P0 | ⬜ | UsageEvent created |
| SESSION-024 | Session recording saved (if enabled) | 🤖 Integration | P1 | ⬜ | Recording reference stored |
| SESSION-025 | Session analytics events created | 🤖 Integration | P0 | ⬜ | AnalyticsEvent created |
| SESSION-026 | LiveKit room cleaned up after session | 🤖 Integration | P0 | ⬜ | Room deleted |
| SESSION-027 | Session data persisted correctly | 🤖 Integration | P0 | ⬜ | All data saved to database |

### Session Rate Limiting & Abuse Prevention

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| SESSION-028 | Rate limiting prevents abuse | 🤖 E2E | P0 | ⬜ | Max 10 requests per minute |
| SESSION-029 | Concurrent session limit enforced | 🤖 E2E | P1 | ⬜ | Max 5 sessions per IP |
| SESSION-030 | Rate limit error messages clear | 🤖 E2E | P1 | ⬜ | User-friendly error displayed |

---

## Knowledge Management

### Document Upload Flow

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| KNOW-001 | User can upload PDF documents | 🤖 E2E | P0 | ⬜ | File uploaded, processed |
| KNOW-002 | User can upload video files (MP4, MOV) | 🤖 E2E | P1 | ⬜ | Video uploaded |
| KNOW-003 | User can upload audio files (MP3, WAV) | 🤖 E2E | P1 | ⬜ | Audio uploaded |
| KNOW-004 | User can add text URLs | 🤖 E2E | P1 | ⬜ | URL added to knowledge base |
| KNOW-005 | File size limits enforced | 🤖 E2E | P1 | ⬜ | Large files rejected |
| KNOW-006 | File type validation works | 🤖 E2E | P0 | ⬜ | Invalid types rejected |
| KNOW-007 | Upload progress displays correctly | 👤 Manual | P2 | ⬜ | Progress bar updates |
| KNOW-008 | Multiple files can be uploaded simultaneously | 🤖 E2E | P1 | ⬜ | Batch upload works |
| KNOW-009 | Upload cancellation works | 👤 Manual | P2 | ⬜ | Cancel button stops upload |

### Knowledge Processing Pipeline

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| KNOW-010 | PDF text extraction works | 🤖 Integration | P0 | ⬜ | Text extracted correctly |
| KNOW-011 | Video transcription works | 🤖 Integration | P1 | ⬜ | Audio transcribed to text |
| KNOW-012 | Audio transcription works | 🤖 Integration | P1 | ⬜ | Audio transcribed to text |
| KNOW-013 | Embedding generation works | 🤖 Integration | P1 | ⬜ | Vectors generated |
| KNOW-014 | Knowledge processing runs in background | 🤖 Integration | P0 | ⬜ | Job queued, processed async |
| KNOW-015 | Processing status updates correctly | 🤖 E2E | P0 | ⬜ | Status: Pending → Processing → Ready |
| KNOW-016 | Failed processing shows error message | 🤖 E2E | P0 | ⬜ | Status: Failed, error displayed |
| KNOW-017 | Processing retry works on failure | 🤖 Integration | P1 | ⬜ | Failed jobs retried |

### Knowledge Retrieval & Usage

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| KNOW-018 | Knowledge documents retrieved during presentation | 👤 Manual | P1 | ⬜ | AI uses knowledge in responses |
| KNOW-019 | Semantic search works for knowledge | 🤖 Integration | P1 | ⬜ | Relevant documents found |
| KNOW-020 | Knowledge relevance scoring works | 🤖 Integration | P2 | ⬜ | Most relevant docs prioritized |
| KNOW-021 | Knowledge documents deleted correctly | 🤖 E2E | P1 | ⬜ | Document removed from agent |
| KNOW-022 | Knowledge document list displays correctly | 🤖 E2E | P0 | ⬜ | All documents shown |
| KNOW-023 | Knowledge document preview works | 👤 Manual | P2 | ⬜ | Preview displays content |

---

## Analytics & Insights

### Dashboard Overview

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ANAL-001 | Organization dashboard displays metrics | 🤖 E2E | P0 | ⬜ | Total minutes, viewers, agents, cost |
| ANAL-002 | Dashboard filters by time period | 🤖 E2E | P1 | ⬜ | 1, 7, 30, 90 days |
| ANAL-003 | Usage chart displays correctly | 👤 Manual | P1 | ⬜ | Chart renders, data accurate |
| ANAL-004 | Cost chart displays correctly | 👤 Manual | P1 | ⬜ | Chart renders, data accurate |
| ANAL-005 | Top agents table displays correctly | 🤖 E2E | P1 | ⬜ | Ranked by session count |
| ANAL-006 | Activity feed shows recent sessions | 🤖 E2E | P1 | ⬜ | Latest sessions displayed |
| ANAL-007 | Dashboard loads in < 2 seconds | 👤 Manual | P1 | ⬜ | Performance acceptable |
| ANAL-008 | Dashboard exports to JSON | 🤖 E2E | P2 | ⬜ | Export button works |
| ANAL-009 | Dashboard exports to CSV | 🤖 E2E | P2 | ⬜ | CSV format correct |
| ANAL-010 | Dashboard exports to PDF | 🤖 E2E | P2 | ⬜ | PDF format correct |

### Screen Agent Analytics

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ANAL-011 | Agent-specific analytics display correctly | 🤖 E2E | P0 | ⬜ | Agent metrics accurate |
| ANAL-012 | Viewer list displays correctly | 🤖 E2E | P1 | ⬜ | Viewer details shown |
| ANAL-013 | Session history displays correctly | 🤖 E2E | P1 | ⬜ | All sessions listed |
| ANAL-014 | Engagement metrics calculated correctly | 🤖 Integration | P1 | ⬜ | Metrics accurate |
| ANAL-015 | Question analysis displays clustered questions | 👤 Manual | P1 | ⬜ | Questions grouped by topic |
| ANAL-016 | Topic extraction displays key topics | 👤 Manual | P1 | ⬜ | Topics extracted correctly |

### Post-Session Analysis

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ANAL-017 | Video analysis runs after session | 🤖 Integration | P1 | ⬜ | Analysis job queued |
| ANAL-018 | Question clustering works | 🤖 Integration | P1 | ⬜ | Similar questions grouped |
| ANAL-019 | Topic extraction works | 🤖 Integration | P1 | ⬜ | Key topics identified |
| ANAL-020 | Insights generation works | 🤖 Integration | P1 | ⬜ | Summary and findings generated |
| ANAL-021 | Analysis results displayed in UI | 🤖 E2E | P1 | ⬜ | Insights shown to user |
| ANAL-022 | Analysis completion notification sent | 🤖 Integration | P2 | ⬜ | Notification created |
| ANAL-023 | Analysis processing time acceptable | 👤 Manual | P2 | ⬜ | Completes within reasonable time |

---

## Billing & Usage Flow

### Free Tier Experience

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| BILL-001 | Free tier allocation (20 minutes, 1 agent) works | 🤖 E2E | P0 | ⬜ | Limits enforced |
| BILL-002 | Free minutes consumed correctly | 🤖 Integration | P0 | ⬜ | Usage tracked accurately |
| BILL-003 | Warning displayed at 80% usage (16 minutes) | 🤖 E2E | P1 | ⬜ | Banner notification |
| BILL-004 | New sessions blocked at 100% usage | 🤖 E2E | P0 | ⬜ | Cannot start new session |
| BILL-005 | No payment method required for free tier | 🤖 E2E | P0 | ⬜ | Can use without card |
| BILL-006 | Free tier reset monthly | 🤖 Integration | P0 | ⬜ | Allocation resets correctly |

### Pay-as-You-Go Billing Flow

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| BILL-007 | User can add payment method | 🤖 E2E | P0 | ⬜ | Stripe integration works |
| BILL-008 | Initial balance loading works ($100 minimum) | 🤖 E2E | P0 | ⬜ | Balance credited correctly |
| BILL-009 | Usage deducted from balance in real-time | 🤖 Integration | P0 | ⬜ | Balance decreases correctly |
| BILL-010 | Balance displays correctly | 🤖 E2E | P0 | ⬜ | Current balance accurate |
| BILL-011 | Auto-reload triggers at threshold ($10) | 🤖 Integration | P0 | ⬜ | Automatic reload works |
| BILL-012 | Auto-reload charges payment method | 🤖 Integration | P0 | ⬜ | Stripe charge succeeds |
| BILL-013 | Auto-reload notification sent | 🤖 Integration | P1 | ⬜ | Email notification |
| BILL-014 | Failed payment handled gracefully | 🤖 E2E | P0 | ⬜ | Error message, retry logic |
| BILL-015 | Usage forecast displays correctly | 👤 Manual | P2 | ⬜ | Projected usage shown |
| BILL-016 | Transaction history displays correctly | 🤖 E2E | P1 | ⬜ | All transactions listed |

### Enterprise Billing Flow

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| BILL-017 | Platform admin can create enterprise contract | 🤖 E2E | P0 | ⬜ | Contract created |
| BILL-018 | Committed usage tracked correctly | 🤖 Integration | P0 | ⬜ | Usage against commitment |
| BILL-019 | Overage charges calculated correctly | 🤖 Integration | P0 | ⬜ | Overage rate applied |
| BILL-020 | Invoice generation works | 🤖 Integration | P1 | ⬜ | Invoice created with line items |
| BILL-021 | Invoice PDF generated | 🤖 Integration | P2 | ⬜ | PDF format correct |
| BILL-022 | Invoice sent to billing email | 🤖 Integration | P1 | ⬜ | Email sent successfully |
| BILL-023 | Invoice payment tracking works | 🤖 Integration | P1 | ⬜ | Payment status updated |

### Usage Tracking & Metering

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| BILL-024 | UsageEvent created for each session minute | 🤖 Integration | P0 | ⬜ | Events created correctly |
| BILL-025 | UsageEvent cost calculated correctly | 🤖 Integration | P0 | ⬜ | Unit cost × quantity |
| BILL-026 | Usage aggregation works correctly | 🤖 Integration | P0 | ⬜ | Total usage calculated |
| BILL-027 | Usage limits enforced | 🤖 E2E | P0 | ⬜ | Limits checked before action |
| BILL-028 | Usage warnings sent at thresholds | 🤖 Integration | P1 | ⬜ | Notifications sent |
| BILL-029 | Usage breakdown by agent displays | 🤖 E2E | P1 | ⬜ | Per-agent usage shown |

---

## Multi-Tenancy & Organizations

### Organization Management Flow

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ORG-001 | User can create organization | 🤖 E2E | P0 | ⬜ | Organization created |
| ORG-002 | User becomes organization owner automatically | 🤖 Integration | P0 | ⬜ | Owner role assigned |
| ORG-003 | Organization slug unique | 🤖 Integration | P0 | ⬜ | Duplicate slugs rejected |
| ORG-004 | User can view organization list | 🤖 E2E | P0 | ⬜ | Organizations displayed |
| ORG-005 | User can switch active organization | 🤖 E2E | P0 | ⬜ | Context switches correctly |
| ORG-006 | Organization limit enforced (5 per user) | 🤖 E2E | P1 | ⬜ | Cannot create > 5 orgs |
| ORG-007 | Organization settings update correctly | 🤖 E2E | P0 | ⬜ | Name, description updated |
| ORG-008 | Organization deletion works (owner only) | 🤖 E2E | P1 | ⬜ | Org deleted, data cleaned |

### Member Management Flow

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ORG-009 | Owner can invite members | 🤖 E2E | P0 | ⬜ | Invitation email sent |
| ORG-010 | Admin can invite members | 🤖 E2E | P0 | ⬜ | Invitation works |
| ORG-011 | Member cannot invite others | 🤖 E2E | P0 | ⬜ | Invite button hidden |
| ORG-012 | Invitation email contains link | 🤖 E2E | P1 | ⬜ | Link works correctly |
| ORG-013 | Invited user can accept invitation | 🤖 E2E | P0 | ⬜ | Membership created |
| ORG-014 | Invited user can decline invitation | 🤖 E2E | P1 | ⬜ | Invitation declined |
| ORG-015 | Membership limit enforced (100 per org) | 🤖 E2E | P1 | ⬜ | Cannot invite > 100 members |
| ORG-016 | Owner can remove members | 🤖 E2E | P0 | ⬜ | Member removed |
| ORG-017 | Owner can change member roles | 🤖 E2E | P0 | ⬜ | Role updated |
| ORG-018 | Owner cannot remove themselves | 🤖 E2E | P0 | ⬜ | Error message |

### Role-Based Access Control (RBAC)

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ORG-019 | Owner can manage organization settings | 🤖 E2E | P0 | ⬜ | Update org, delete org |
| ORG-020 | Admin can invite members but not delete organization | 🤖 E2E | P0 | ⬜ | Admin permissions enforced |
| ORG-021 | Member cannot manage organization settings | 🤖 E2E | P0 | ⬜ | Settings page hidden/disabled |
| ORG-022 | Permission checks work via `hasPermission()` | 🤖 Integration | P0 | ⬜ | API endpoints enforce permissions |
| ORG-023 | Role changes take effect immediately | 🤖 E2E | P0 | ⬜ | Permissions updated instantly |

### Data Isolation & Security

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ORG-024 | User cannot access other organization's data | 🤖 E2E | P0 | ⬜ | Data scoped by organizationId |
| ORG-025 | API endpoints filter by organizationId | 🤖 Integration | P0 | ⬜ | Only org data returned |
| ORG-026 | Screen Agents scoped to organization | 🤖 E2E | P0 | ⬜ | Cannot see other orgs' agents |
| ORG-027 | Analytics scoped to organization | 🤖 E2E | P0 | ⬜ | Only org analytics shown |
| ORG-028 | Billing data scoped to organization | 🤖 E2E | P0 | ⬜ | Cannot see other orgs' billing |

---

## Team Management (Enterprise)

### Team Creation Flow

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| TEAM-001 | Enterprise org admin can create teams | 🤖 E2E | P0 | ⬜ | Team created |
| TEAM-002 | Basic org cannot create teams | 🤖 E2E | P0 | ⬜ | Teams feature disabled |
| TEAM-003 | Team name and description saved | 🤖 E2E | P0 | ⬜ | Fields persisted |
| TEAM-004 | Team assigned to organization correctly | 🤖 Integration | P0 | ⬜ | organizationId set |

### Team Member Management

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| TEAM-005 | Team admin can add members | 🤖 E2E | P0 | ⬜ | Members added |
| TEAM-006 | Team admin can remove members | 🤖 E2E | P0 | ⬜ | Members removed |
| TEAM-007 | Team member cannot modify membership | 🤖 E2E | P0 | ⬜ | Edit buttons hidden |
| TEAM-008 | Organization admin can manage all teams | 🤖 E2E | P0 | ⬜ | Full access |
| TEAM-009 | Team member list displays correctly | 🤖 E2E | P1 | ⬜ | All members shown |

### Team-Owned Screen Agents

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| TEAM-010 | Team-owned agents visible to team members | 🤖 E2E | P0 | ⬜ | Team visibility works |
| TEAM-011 | Team admin can edit team-owned agents | 🤖 E2E | P0 | ⬜ | Edit access granted |
| TEAM-012 | Team member can view but not edit team agents | 🤖 E2E | P0 | ⬜ | Read-only access |
| TEAM-013 | Individual-owned agents remain private | 🤖 E2E | P0 | ⬜ | Not visible to team |
| TEAM-014 | Agent ownership transfer to team works | 🤖 E2E | P1 | ⬜ | Ownership changed |

### Organization Upgrade Flow

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| TEAM-015 | Basic org can upgrade to Enterprise | 🤖 E2E | P1 | ⬜ | Upgrade flow works |
| TEAM-016 | All members converted to "General" team | 🤖 Integration | P0 | ⬜ | Team migration works |
| TEAM-017 | All agents assigned to General team | 🤖 Integration | P0 | ⬜ | Agent migration works |
| TEAM-018 | Enterprise features enabled after upgrade | 🤖 E2E | P0 | ⬜ | Teams, SSO, etc. available |
| TEAM-019 | Upgrade process preserves all data | 🤖 Integration | P0 | ⬜ | No data loss |

---

## Platform Administration

### Organization Management

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ADMIN-001 | Platform admin can view all organizations | 🤖 E2E | P0 | ⬜ | List displays all orgs |
| ADMIN-002 | Platform admin can view organization details | 🤖 E2E | P0 | ⬜ | Details page works |
| ADMIN-003 | Platform admin can upgrade/downgrade orgs | 🤖 E2E | P0 | ⬜ | Tier changes work |
| ADMIN-004 | Platform admin can suspend/reactivate orgs | 🤖 E2E | P0 | ⬜ | Status changes work |
| ADMIN-005 | Organization search and filtering works | 🤖 E2E | P1 | ⬜ | Search functional |

### Contract Management Flow

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ADMIN-006 | Platform admin can create enterprise contracts | 🤖 E2E | P0 | ⬜ | Contract creation works |
| ADMIN-007 | Contract terms saved correctly | 🤖 Integration | P0 | ⬜ | Rates, limits stored |
| ADMIN-008 | Contract updates work | 🤖 E2E | P1 | ⬜ | Terms can be modified |
| ADMIN-009 | Contract termination works | 🤖 E2E | P1 | ⬜ | Contract ended correctly |
| ADMIN-010 | Contract history displays correctly | 🤖 E2E | P2 | ⬜ | All contracts listed |

### Usage Monitoring & Analytics

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ADMIN-011 | Platform-wide usage metrics display | 🤖 E2E | P1 | ⬜ | System metrics shown |
| ADMIN-012 | Cost attribution works | 🤖 Integration | P1 | ⬜ | Costs by org calculated |
| ADMIN-013 | Resource utilization tracked | 👤 Manual | P2 | ⬜ | Server metrics displayed |
| ADMIN-014 | Usage trends display correctly | 👤 Manual | P2 | ⬜ | Charts render correctly |

### Support Tools

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| ADMIN-015 | User impersonation works | 🤖 E2E | P0 | ⬜ | Admin can impersonate user |
| ADMIN-016 | Impersonation logged in audit trail | 🤖 Integration | P0 | ⬜ | Audit log entry created |
| ADMIN-017 | Detailed logs accessible | 👤 Manual | P1 | ⬜ | Log viewer works |
| ADMIN-018 | Manual billing adjustments work | 🤖 E2E | P1 | ⬜ | Adjustments saved |
| ADMIN-019 | Feature flags can be toggled | 🤖 E2E | P1 | ⬜ | Flags work correctly |

---

## API Endpoints

### Screen Agents API

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| API-001 | GET /api/screen-agents - List agents | 🤖 Integration | P0 | ⬜ | Returns filtered list |
| API-002 | POST /api/screen-agents - Create agent | 🤖 Integration | P0 | ⬜ | Agent created |
| API-003 | GET /api/screen-agents/[id] - Get agent | 🤖 Integration | P0 | ⬜ | Agent details returned |
| API-004 | PATCH /api/screen-agents/[id] - Update agent | 🤖 Integration | P0 | ⬜ | Agent updated |
| API-005 | DELETE /api/screen-agents/[id] - Delete agent | 🤖 Integration | P1 | ⬜ | Agent deleted |
| API-006 | API enforces organization isolation | 🤖 Integration | P0 | ⬜ | Cannot access other orgs |

### Presentations API

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| API-007 | POST /api/presentations - Create session | 🤖 Integration | P0 | ⬜ | Session created |
| API-008 | GET /api/presentations/[token] - Get session | 🤖 Integration | P0 | ⬜ | Session details returned |
| API-009 | PATCH /api/presentations/[token] - Update session | 🤖 Integration | P0 | ⬜ | Session updated |
| API-010 | POST /api/presentations/[token]/end - End session | 🤖 Integration | P0 | ⬜ | Session ended |
| API-011 | GET /api/presentations - List sessions | 🤖 Integration | P1 | ⬜ | Sessions returned |

### Analytics API

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| API-012 | GET /api/analytics/dashboard - Get dashboard data | 🤖 Integration | P0 | ⬜ | Metrics returned |
| API-013 | GET /api/analytics/screen-agent/[id] - Get agent analytics | 🤖 Integration | P0 | ⬜ | Agent metrics returned |
| API-014 | GET /api/analytics/insights/[sessionId] - Get insights | 🤖 Integration | P1 | ⬜ | Insights returned |
| API-015 | GET /api/analytics/export - Export analytics | 🤖 Integration | P2 | ⬜ | Export works |

### Billing API

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| API-016 | GET /api/billing/account - Get billing account | 🤖 Integration | P0 | ⬜ | Account details returned |
| API-017 | POST /api/billing/add-payment - Add payment method | 🤖 Integration | P0 | ⬜ | Stripe integration works |
| API-018 | POST /api/billing/load-balance - Load balance | 🤖 Integration | P0 | ⬜ | Balance credited |
| API-019 | GET /api/billing/transactions - Get transactions | 🤖 Integration | P1 | ⬜ | Transaction history |
| API-020 | GET /api/billing/invoices - Get invoices | 🤖 Integration | P1 | ⬜ | Invoices returned |

### Usage API

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| API-021 | GET /api/usage/metering - Get usage metrics | 🤖 Integration | P0 | ⬜ | Metrics returned |
| API-022 | GET /api/usage/limits - Get usage limits | 🤖 Integration | P0 | ⬜ | Limits returned |
| API-023 | GET /api/usage/warnings - Get warnings | 🤖 Integration | P1 | ⬜ | Warnings returned |

### Knowledge API

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| API-024 | POST /api/knowledge/upload - Upload document | 🤖 Integration | P0 | ⬜ | Document uploaded |
| API-025 | GET /api/knowledge - List documents | 🤖 Integration | P0 | ⬜ | Documents returned |
| API-026 | DELETE /api/knowledge/[id] - Delete document | 🤖 Integration | P1 | ⬜ | Document deleted |
| API-027 | GET /api/knowledge/[id]/status - Get processing status | 🤖 Integration | P1 | ⬜ | Status returned |

### Admin API

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| API-028 | GET /api/admin/organizations - List all orgs | 🤖 Integration | P0 | ⬜ | Requires admin role |
| API-029 | GET /api/admin/organizations/[id] - Get org | 🤖 Integration | P0 | ⬜ | Org details returned |
| API-030 | POST /api/admin/contracts - Create contract | 🤖 Integration | P0 | ⬜ | Contract created |
| API-031 | POST /api/admin/impersonate - Impersonate user | 🤖 Integration | P0 | ⬜ | Impersonation works |

### Error Handling & Rate Limiting

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| API-032 | API returns 401 for unauthenticated requests | 🤖 Integration | P0 | ⬜ | Unauthorized response |
| API-033 | API returns 403 for unauthorized requests | 🤖 Integration | P0 | ⬜ | Forbidden response |
| API-034 | API returns 400 for invalid data | 🤖 Integration | P0 | ⬜ | Validation errors |
| API-035 | API returns 404 for not found resources | 🤖 Integration | P0 | ⬜ | Not found response |
| API-036 | API returns 500 for server errors | 🤖 Integration | P0 | ⬜ | Error handling works |
| API-037 | API rate limiting works | 🤖 Integration | P0 | ⬜ | Rate limits enforced |
| API-038 | Rate limit headers included in response | 🤖 Integration | P1 | ⬜ | Headers correct |

---

## Integration & External Services

### Database Integration

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| INT-001 | MongoDB connection works | 🤖 Integration | P0 | ⬜ | Connection established |
| INT-002 | Prisma operations work | 🤖 Integration | P0 | ⬜ | Auth data operations |
| INT-003 | Mongoose operations work | 🤖 Integration | P0 | ⬜ | App data operations |
| INT-004 | Transactions work correctly | 🤖 Integration | P1 | ⬜ | Multi-document updates |
| INT-005 | Database indexes work correctly | 🤖 Integration | P1 | ⬜ | Queries optimized |
| INT-006 | Database connection pooling works | 🤖 Integration | P1 | ⬜ | Pool management correct |

### External Services Integration

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| INT-007 | Stripe integration works | 🤖 Integration | P0 | ⬜ | Payment processing |
| INT-008 | Stripe webhook verification works | 🤖 Integration | P0 | ⬜ | Signature validation |
| INT-009 | LiveKit integration works | 🤖 Integration | P0 | ⬜ | Room creation, tokens |
| INT-010 | Uploadthing integration works | 🤖 Integration | P0 | ⬜ | File uploads |
| INT-011 | Resend email integration works | 🤖 Integration | P0 | ⬜ | Emails sent |
| INT-012 | Redis integration works | 🤖 Integration | P0 | ⬜ | Job queue operations |
| INT-013 | OpenAI API integration works | 🤖 Integration | P0 | ⬜ | AI responses generated |
| INT-014 | ElevenLabs API integration works | 🤖 Integration | P1 | ⬜ | Voice synthesis works |

### Background Jobs Integration

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| INT-015 | Email jobs process correctly | 🤖 Integration | P0 | ⬜ | Emails sent via queue |
| INT-016 | Knowledge processing jobs work | 🤖 Integration | P0 | ⬜ | Processing completes |
| INT-017 | Video analysis jobs work | 🤖 Integration | P1 | ⬜ | Analysis completes |
| INT-018 | Job retry logic works | 🤖 Integration | P1 | ⬜ | Failed jobs retried |
| INT-019 | Job failure handling works | 🤖 Integration | P1 | ⬜ | Errors logged |
| INT-020 | Job priority queuing works | 🤖 Integration | P2 | ⬜ | Priority respected |

---

## Performance & Scalability

### Load Testing

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| PERF-001 | API handles 100 concurrent requests | 👤 Manual | P1 | ⬜ | Response times acceptable |
| PERF-002 | Dashboard loads in < 2 seconds | 👤 Manual | P1 | ⬜ | Page load time |
| PERF-003 | Analytics queries complete in < 3 seconds | 👤 Manual | P1 | ⬜ | Query performance |
| PERF-004 | 10,000 concurrent presentation sessions | 👤 Manual | P2 | ⬜ | System handles load |
| PERF-005 | Database handles 1M+ documents | 👤 Manual | P2 | ⬜ | Query performance maintained |
| PERF-006 | File upload handles large files | 👤 Manual | P1 | ⬜ | Upload completes |

### Stress Testing

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| PERF-007 | System recovers from high load | 👤 Manual | P1 | ⬜ | Graceful degradation |
| PERF-008 | System handles burst traffic | 👤 Manual | P1 | ⬜ | Rate limiting works |
| PERF-009 | Worker queues handle backlog | 👤 Manual | P1 | ⬜ | Jobs processed eventually |
| PERF-010 | Database connection pool handles stress | 👤 Manual | P1 | ⬜ | No connection errors |

### Scalability Testing

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| PERF-011 | Horizontal scaling works | 👤 Manual | P2 | ⬜ | Multiple instances |
| PERF-012 | Database scaling works | 👤 Manual | P2 | ⬜ | Read replicas, sharding |
| PERF-013 | Redis scaling works | 👤 Manual | P2 | ⬜ | Cluster mode |
| PERF-014 | CDN integration works | 👤 Manual | P2 | ⬜ | Static assets served |

---

## Security & Compliance

### Authentication Security

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| SEC-001 | Password hashing works (bcrypt/argon2) | 🤖 Integration | P0 | ⬜ | Passwords hashed |
| SEC-002 | Session tokens secure (httpOnly, secure) | 🤖 Integration | P0 | ⬜ | Cookie flags correct |
| SEC-003 | CSRF protection works | 🤖 Integration | P0 | ⬜ | CSRF tokens validated |
| SEC-004 | SQL injection prevented | 🤖 Integration | P0 | ⬜ | Input sanitized |
| SEC-005 | XSS prevention works | 🤖 Integration | P0 | ⬜ | Output escaped |
| SEC-006 | Password complexity enforced | 🤖 E2E | P0 | ⬜ | Weak passwords rejected |

### Authorization Security

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| SEC-007 | Vertical privilege escalation prevented | 🤖 E2E | P0 | ⬜ | Cannot access admin routes |
| SEC-008 | Horizontal privilege escalation prevented | 🤖 E2E | P0 | ⬜ | Cannot access other orgs |
| SEC-009 | Role-based access enforced | 🤖 E2E | P0 | ⬜ | Permissions checked |
| SEC-010 | API key scoping works | 🤖 Integration | P0 | ⬜ | Scopes enforced |
| SEC-011 | Session hijacking prevented | 🤖 Integration | P0 | ⬜ | Token validation works |

### Data Security

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| SEC-012 | Website credentials encrypted at rest | 🤖 Integration | P0 | ⬜ | Encryption verified |
| SEC-013 | Sensitive data not logged | 👤 Manual | P0 | ⬜ | No secrets in logs |
| SEC-014 | HTTPS enforced in production | 👤 Manual | P0 | ⬜ | HTTP redirects to HTTPS |
| SEC-015 | Environment variables not exposed | 👤 Manual | P0 | ⬜ | No secrets in client code |
| SEC-016 | Data encryption in transit | 👤 Manual | P0 | ⬜ | TLS/SSL verified |
| SEC-017 | PII data handling compliant | 👤 Manual | P1 | ⬜ | GDPR compliance |

### API Security

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| SEC-018 | API rate limiting prevents abuse | 🤖 Integration | P0 | ⬜ | Limits enforced |
| SEC-019 | Webhook signature verification works | 🤖 Integration | P0 | ⬜ | Invalid signatures rejected |
| SEC-020 | Input validation prevents malicious data | 🤖 Integration | P0 | ⬜ | Invalid inputs rejected |
| SEC-021 | API authentication required | 🤖 Integration | P0 | ⬜ | Unauthenticated requests rejected |

### Compliance & Data Privacy

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| SEC-022 | Data export works (GDPR) | 🤖 E2E | P1 | ⬜ | User data exported |
| SEC-023 | Data deletion works (GDPR) | 🤖 E2E | P1 | ⬜ | User data deleted |
| SEC-024 | Audit logging works | 🤖 Integration | P0 | ⬜ | All actions logged |
| SEC-025 | Data retention policies enforced | 🤖 Integration | P1 | ⬜ | Old data purged |

---

## User Experience & Accessibility

### UI/UX Testing

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| UX-001 | Navigation works smoothly | 👤 Manual | P1 | ⬜ | Links, routing |
| UX-002 | Forms validate inline | 👤 Manual | P1 | ⬜ | Error messages clear |
| UX-003 | Loading states display correctly | 👤 Manual | P1 | ⬜ | Spinners, skeletons |
| UX-004 | Error messages user-friendly | 👤 Manual | P1 | ⬜ | Clear, actionable |
| UX-005 | Empty states helpful | 👤 Manual | P2 | ⬜ | Guidance provided |
| UX-006 | Responsive design works (mobile, tablet, desktop) | 👤 Manual | P1 | ⬜ | All breakpoints |
| UX-007 | Dark mode works correctly | 👤 Manual | P2 | ⬜ | Theme switching |
| UX-008 | Accessibility standards met (WCAG AA) | 👤 Manual | P1 | ⬜ | Keyboard nav, screen readers |
| UX-009 | Tooltips and help text clear | 👤 Manual | P2 | ⬜ | Helpful guidance |

### User Flows

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| UX-010 | Onboarding flow smooth | 🤖 E2E | P1 | ⬜ | Complete flow |
| UX-011 | Screen Agent creation wizard intuitive | 👤 Manual | P1 | ⬜ | Steps clear, progress visible |
| UX-012 | Presentation viewer experience smooth | 👤 Manual | P0 | ⬜ | Video, audio, controls |
| UX-013 | Analytics dashboard easy to understand | 👤 Manual | P1 | ⬜ | Metrics clear |
| UX-014 | Billing flow clear and transparent | 👤 Manual | P1 | ⬜ | Costs explained |

### Cross-Browser & Device Testing

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| UX-015 | Chrome (latest) | 👤 Manual | P0 | ⬜ | All features work |
| UX-016 | Firefox (latest) | 👤 Manual | P1 | ⬜ | All features work |
| UX-017 | Safari (latest) | 👤 Manual | P1 | ⬜ | All features work |
| UX-018 | Edge (latest) | 👤 Manual | P2 | ⬜ | All features work |
| UX-019 | Mobile Chrome (iOS) | 👤 Manual | P1 | ⬜ | Responsive design |
| UX-020 | Mobile Safari (iOS) | 👤 Manual | P1 | ⬜ | Responsive design |
| UX-021 | Mobile Chrome (Android) | 👤 Manual | P1 | ⬜ | Responsive design |

### Edge Cases & Error Scenarios

| ID | Test Case | Type | Priority | Status | Notes |
|----|-----------|------|----------|--------|-------|
| UX-022 | Very long agent names handled | 👤 Manual | P2 | ⬜ | Truncation/validation |
| UX-023 | Special characters in inputs handled | 🤖 E2E | P1 | ⬜ | Escaping works |
| UX-024 | Concurrent edits handled | 👤 Manual | P2 | ⬜ | Conflict resolution |
| UX-025 | Network interruption during upload | 👤 Manual | P2 | ⬜ | Graceful failure |
| UX-026 | Browser tab closed during session | 👤 Manual | P2 | ⬜ | Session cleanup |
| UX-027 | Multiple organizations with same name | 🤖 Integration | P1 | ⬜ | Slug uniqueness |
| UX-028 | Database connection failure handled | 👤 Manual | P0 | ⬜ | Error message, retry |
| UX-029 | Redis connection failure handled | 👤 Manual | P0 | ⬜ | Graceful degradation |
| UX-030 | External API failure handled | 👤 Manual | P0 | ⬜ | Error handling works |
| UX-031 | File upload failure handled | 🤖 E2E | P1 | ⬜ | Error message displayed |
| UX-032 | Payment processing failure handled | 🤖 E2E | P0 | ⬜ | Error, retry option |

---

## Sign-Off Checklist

### Critical Path (P0) - Must Pass for Release

**User Onboarding:**
- [ ] All P0 authentication tests passing
- [ ] Route protection working correctly
- [ ] Email verification working

**Screen Agent Management:**
- [ ] Agent creation wizard complete
- [ ] Agent editing, publishing working
- [ ] Shareable links functional
- [ ] Usage limits enforced

**Presentation Sessions:**
- [ ] Sessions create and end correctly
- [ ] LiveKit integration working
- [ ] Video/audio streams functional
- [ ] Usage tracking accurate

**Billing:**
- [ ] Free tier limits enforced
- [ ] Pay-as-you-go billing working
- [ ] Payment processing functional
- [ ] Usage metering accurate

**Multi-Tenancy:**
- [ ] Organization isolation working
- [ ] Member invitations working
- [ ] Data scoping correct
- [ ] RBAC enforced

**API Endpoints:**
- [ ] All P0 API endpoints functional
- [ ] Error handling correct
- [ ] Rate limiting working

**Security:**
- [ ] Authentication security verified
- [ ] Authorization security verified
- [ ] Data encryption verified
- [ ] Input validation working

**Performance:**
- [ ] Core features performant
- [ ] Database queries optimized
- [ ] Page load times acceptable

### High Priority (P1) - Should Pass for Release

**Analytics:**
- [ ] Dashboard displays correctly
- [ ] Analytics data accurate
- [ ] Post-session analysis working

**Knowledge Management:**
- [ ] Document upload working
- [ ] Processing pipeline functional
- [ ] Knowledge retrieval working

**Team Management:**
- [ ] Enterprise teams working
- [ ] Team permissions correct
- [ ] Upgrade flow functional

**Platform Administration:**
- [ ] Admin interface functional
- [ ] Organization management working
- [ ] Contract management working

**User Experience:**
- [ ] UI/UX polished
- [ ] Responsive design working
- [ ] Accessibility standards met
- [ ] Cross-browser compatibility verified

### Medium/Low Priority (P2/P3) - Nice to Have

**Additional Features:**
- [ ] Export functionality complete
- [ ] Advanced analytics working
- [ ] Dark mode polished
- [ ] Additional browser support

---

## Test Execution Plan

### Phase 1: Automated Test Development (Week 1-2)

1. **Unit Tests**
   - Write unit tests for all utility functions
   - Write unit tests for React components
   - Target: 80%+ code coverage

2. **Integration Tests**
   - Write integration tests for all API endpoints
   - Write integration tests for database operations
   - Write integration tests for external service integrations

3. **E2E Tests**
   - Write E2E tests for critical user flows
   - Write E2E tests for authentication
   - Write E2E tests for Screen Agent management

### Phase 2: Manual Testing (Week 3)

1. **Functional Testing**
   - Test all features manually
   - Verify UI/UX
   - Test edge cases

2. **Exploratory Testing**
   - Explore application for bugs
   - Test error scenarios
   - Test concurrent operations

3. **Cross-Browser Testing**
   - Test in Chrome, Firefox, Safari, Edge
   - Test on mobile devices
   - Test responsive design

### Phase 3: Performance & Security Testing (Week 4)

1. **Performance Testing**
   - Load testing
   - Stress testing
   - Scalability testing

2. **Security Testing**
   - Authentication/authorization testing
   - Data security verification
   - API security testing

3. **Compliance Testing**
   - GDPR compliance verification
   - Data export/deletion testing

### Phase 4: Final Sign-Off (Week 5)

1. **Regression Testing**
   - Run all automated tests
   - Verify bug fixes
   - Test previously fixed issues

2. **Sign-Off Review**
   - Review all test results
   - Address any remaining issues
   - Final approval for release

---

## Test Automation Framework

### Unit Tests

**Framework:** Vitest + React Testing Library

```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

**Coverage Target:** 80%+ for critical paths

### Integration Tests

**Framework:** Vitest + Supertest (for API routes)

**Location:** `lib/__tests__/` and `app/api/__tests__/`

**Example:**
```typescript
// app/api/__tests__/screen-agents.test.ts
import { describe, it, expect } from 'vitest'
import { GET } from '../screen-agents/route'

describe('GET /api/screen-agents', () => {
  it('returns list of agents', async () => {
    // Test implementation
  })
})
```

### E2E Tests

**Framework:** Playwright

**Location:** `e2e/`

**Example:**
```typescript
// e2e/screen-agent-creation.spec.ts
import { test, expect } from '@playwright/test'

test('user can create screen agent', async ({ page }) => {
  // Test implementation
})
```

**Run E2E Tests:**
```bash
pnpm e2e:headless  # Run headless
pnpm e2e:ui        # Run with UI
```

---

## Bug Tracking

### Bug Severity Levels

- **Critical (S0):** System unusable, data loss risk
- **High (S1):** Major feature broken, workaround exists
- **Medium (S2):** Minor feature broken, workaround exists
- **Low (S3):** Cosmetic issue, polish needed

### Bug Report Template

```markdown
**Test ID:** [e.g., AGENT-001]
**Severity:** [S0/S1/S2/S3]
**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Step 3

**Expected Result:** [What should happen]
**Actual Result:** [What actually happens]
**Screenshots/Logs:** [Attach if applicable]
**Environment:** [Browser, OS, etc.]
```

---

## Test Metrics & Reporting

### Key Metrics

- **Test Coverage:** Percentage of code covered by tests
- **Test Pass Rate:** Percentage of tests passing
- **Bug Detection Rate:** Bugs found per test executed
- **Test Execution Time:** Time to run all tests
- **P0/P1 Pass Rate:** Critical tests passing

### Reporting

**Weekly Test Status Report:**
- Tests executed this week
- Tests passing/failing
- Bugs found and fixed
- Blockers and dependencies

**Release Readiness Report:**
- Overall test status
- Critical path status
- Known issues and risks
- Sign-off recommendation

---

## Continuous Testing

### CI/CD Integration

**Pre-Commit:**
- Run linting
- Run type checking
- Run unit tests

**Pre-Merge:**
- Run all unit tests
- Run integration tests
- Run E2E tests on staging

**Pre-Release:**
- Run full test suite
- Run performance tests
- Run security scans

### Test Maintenance

- Review and update tests weekly
- Remove obsolete tests
- Add tests for new features
- Improve test coverage continuously

---

## Sign-Off Criteria

### Release Sign-Off Requirements

**Must Have:**
- ✅ All P0 tests passing (100%)
- ✅ All P1 tests passing (≥95%)
- ✅ Security audit passed
- ✅ Performance benchmarks met
- ✅ No critical bugs (S0) open
- ✅ No high-severity bugs (S1) in critical paths

**Should Have:**
- ✅ All P2 tests passing (≥90%)
- ✅ Cross-browser compatibility verified
- ✅ Accessibility standards met
- ✅ User acceptance testing completed

**Nice to Have:**
- ✅ All P3 tests passing
- ✅ Advanced features polished
- ✅ Documentation complete

---

## Test Environment

### Environments

1. **Development:** Local development, developers
2. **Staging:** Pre-production, QA team
3. **Production:** Live environment, users

### Test Data

- Use realistic test data
- Anonymize production data if used
- Create test fixtures for consistency
- Clean up test data regularly

---

## Resources

### Testing Tools

- **Unit Testing:** Vitest, React Testing Library
- **E2E Testing:** Playwright
- **API Testing:** Supertest, Postman
- **Performance Testing:** k6, Artillery
- **Security Testing:** OWASP ZAP, Snyk

### Documentation

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://testingjavascript.com/)

---

## Conclusion

This testing document serves as a comprehensive tracker for all platform testing activities, organized by feature, flow, and functionality. Regular updates to test status and results will ensure the platform meets quality standards before release.

**Last Updated:** [Date]
**Next Review:** [Date]
**Test Status:** ⬜ Not Started / 🔄 In Progress / ✅ Complete

---

**Screen Agent Platform Testing Team**
