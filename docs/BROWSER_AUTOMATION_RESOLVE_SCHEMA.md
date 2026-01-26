# Browser Automation Service: Resolve Endpoint Schema

**Document Version:** 1.0  
**Date:** January 25, 2026  
**Purpose:** Canonical request/response schema for the **browser automation / knowledge extraction service** `GET /api/knowledge/resolve` endpoint.  
**Consumers:** Next.js Thin Client backend (`GET /api/knowledge/resolve`), which proxies to this endpoint when org-specific knowledge is used (§1.6 `THIN_CLIENT_ROADMAP_SERVER.md`).

**References:**  
- `THIN_CLIENT_ROADMAP_SERVER.md` §3.1, §3.2 — Task 2 proxy and resolve contract  
- `SERVER_SIDE_AGENT_ARCH.md` §5 — Resolve API specification  
- `lib/knowledge-extraction/resolve-client.ts` — Next.js client that calls this API  

---

## 1. Overview

The extraction service exposes **`GET /api/knowledge/resolve`** so the Next.js app can fetch org-specific knowledge (chunks and citations) for a given **URL** and optional **query**, scoped by **tenant**. Next.js adds auth, `allowed_domains` filtering, and `hasOrgKnowledge`; it **proxies** only when the domain matches and org-specific knowledge is used.

This document defines **only** the extraction service’s API contract. The Next.js route contract (including `allowed`, `domain`, `hasOrgKnowledge`) is in `THIN_CLIENT_ROADMAP_SERVER.md` §3.2 and `SERVER_SIDE_AGENT_ARCH.md` §5.

---

## 2. Request

### 2.1 Method and path

| Item | Value |
|------|--------|
| **Method** | `GET` |
| **Path** | `/api/knowledge/resolve` |

### 2.2 Query parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | **Yes** | Active tab URL (absolute). Used to derive **Active Domain** and scope retrieval. |
| `query` | string | No | Optional query for relevance filtering (e.g. user question or keyword). |

**Example:**  
`GET /api/knowledge/resolve?url=https%3A%2F%2Fapp.example.com%2Fpage&query=how%20to%20submit`

### 2.3 Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | No | `application/json` — response is JSON. |
| `X-Tenant-ID` | **Yes** | Tenant ID (`userId` or `organizationId`). All retrieval **MUST** be scoped by this value; no cross-tenant data. |

**Example:**

```http
GET /api/knowledge/resolve?url=https://app.example.com/page&query=submit HTTP/1.1
Host: <extraction-service-host>
Content-Type: application/json
X-Tenant-ID: org_abc123
```

### 2.4 Request summary (TypeScript)

```ts
// Conceptual — not necessarily implemented as a type in the extraction service
interface ResolveRequest {
  url: string   // from query param
  query?: string
  tenantId: string  // from X-Tenant-ID header
}
```

---

## 3. Response

### 3.1 Success (200 OK)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `context` | `KnowledgeChunk[]` | **Yes** | Top-k chunks (e.g. from RAG or stored extracts). Empty array if none. |
| `citations` | `Citation[]` | No | Optional citations derived from chunk metadata. Empty array if none. |

**No** `allowed`, `domain`, or `hasOrgKnowledge` — those are added by the **Next.js** resolve route.

### 3.2 KnowledgeChunk

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | **Yes** | Unique chunk ID (e.g. UUID or stable ref). |
| `content` | string | **Yes** | Chunk text content. |
| `documentTitle` | string | **Yes** | Title of the source document (or page/section). |
| `metadata` | `Record<string, unknown>` | No | Optional metadata (e.g. `section`, `page`, `sourceUrl`). |

**Example:**

```json
{
  "id": "chunk_01",
  "content": "To submit an expense, go to Finance > Submit.",
  "documentTitle": "Expense Policy",
  "metadata": { "section": "Submission", "page": 2 }
}
```

### 3.3 Citation

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `documentId` | string | **Yes** | Source document ID. |
| `documentTitle` | string | **Yes** | Human-readable document title. |
| `section` | string | No | Optional section or heading. |
| `page` | number | No | Optional page number. |

**Example:**

```json
{
  "documentId": "doc_xyz",
  "documentTitle": "Expense Policy",
  "section": "Submission",
  "page": 2
}
```

### 3.4 Full response example (200 OK)

```json
{
  "context": [
    {
      "id": "chunk_01",
      "content": "To submit an expense, go to Finance > Submit.",
      "documentTitle": "Expense Policy",
      "metadata": { "section": "Submission", "page": 2 }
    }
  ],
  "citations": [
    {
      "documentId": "doc_xyz",
      "documentTitle": "Expense Policy",
      "section": "Submission",
      "page": 2
    }
  ]
}
```

### 3.5 Empty response (200 OK)

When no org-specific knowledge exists for `(tenantId, url, query)`:

```json
{
  "context": [],
  "citations": []
}
```

### 3.6 Response schema (conceptual)

```ts
// Zod-style; extraction service may use different validation.
interface KnowledgeChunk {
  id: string
  content: string
  documentTitle: string
  metadata?: Record<string, unknown>
}

interface Citation {
  documentId: string
  documentTitle: string
  section?: string
  page?: number
}

interface ResolveResponse {
  context: KnowledgeChunk[]
  citations?: Citation[]
}
```

---

## 4. Error responses

| Status | Condition | Body |
|--------|-----------|------|
| **400** | Invalid `url` (e.g. not a valid URL) | `{ "error": "...", "detail": "..." }` |
| **401** | Missing or invalid `X-Tenant-ID` (if the extraction service enforces it) | `{ "error": "Unauthorized", "detail": "..." }` |
| **500** | Server or RAG/retrieval error | `{ "error": "...", "detail": "..." }` |

Next.js maps non-2xx responses from the extraction service into its own error handling (e.g. 500 with a generic message).

---

## 5. Isolation and implementation notes

- **Tenant isolation:** Every retrieval **MUST** filter by `X-Tenant-ID`. No cross-tenant access.
- **Domain / URL:** The extraction service may use `url` to derive domain and scope retrieval (e.g. knowledge stored per domain or per `knowledge_id`). How it maps `(tenantId, url, query)` to stored chunks is implementation-defined.
- **Next.js usage:** Next.js calls this endpoint only when **org-specific** path is chosen (§1.6): domain matches `allowed_domains` and we use org knowledge. It **never** calls for public-only; it returns `hasOrgKnowledge: false`, `context: []`, `citations: []` without calling.

---

## 6. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-25 | Initial schema: request (GET, query params, `X-Tenant-ID`), response (`context`, `citations`), types, errors. |
