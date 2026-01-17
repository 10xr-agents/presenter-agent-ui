# Knowledge Extraction API Specification

**Version**: 1.0.0  
**Date**: January 14, 2026  
**Status**: Production Ready

Complete REST API specification for the Knowledge Extraction System, including process tracking, workflow management, and knowledge retrieval endpoints.

---

## Table of Contents

1. [Overview](#1-overview)
2. [API Fundamentals](#2-api-fundamentals)
3. [Ingestion API](#3-ingestion-api)
4. [Graph Query API](#4-graph-query-api)
5. [Knowledge Definition API](#5-knowledge-definition-api)
6. [Workflow Management API](#6-workflow-management-api)
7. [Verification API](#7-verification-api)
8. [Health Check API](#8-health-check-api)
9. [Error Handling](#9-error-handling)
10. [Process Tracking](#10-process-tracking)
11. [Rate Limiting](#11-rate-limiting)
12. [SDK Usage](#12-sdk-usage)
13. [Examples & Tutorials](#13-examples--tutorials)

---

## 1. Overview

### 1.1 Introduction

The Knowledge Extraction API provides RESTful endpoints for:
- **Ingesting knowledge** from documentation, websites, and videos
- **Querying knowledge graphs** to find navigation paths and relationships
- **Retrieving knowledge definitions** (screens, tasks, actions, transitions)
- **Tracking workflow progress** with real-time status updates
- **Verifying extracted knowledge** using browser-based validation (optional)

### 1.2 Key Features

✅ **Multi-Source Ingestion**: Extract knowledge from docs, websites, videos  
✅ **Graph Queries**: Find paths, neighbors, search screens  
✅ **Durable Workflows**: Temporal-powered execution with retry policies  
✅ **Progress Tracking**: Real-time status, checkpoints, error reporting  
✅ **Optional Verification**: Browser-based validation with feature flags  
✅ **Comprehensive Schemas**: Pydantic models for type safety  

### 1.3 Architecture

```
┌─────────────┐
│   Client    │
│  (HTTP/S)   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│   FastAPI REST API      │
│  /api/knowledge/*       │
└──────┬──────────────────┘
       │
       ├─────────────┬──────────────┬──────────────┐
       ▼             ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Temporal │  │ MongoDB  │  │ ArangoDB │  │  Redis   │
│Workflows │  │(Persist) │  │ (Graph)  │  │(Events)  │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

---

## 2. API Fundamentals

### 2.1 Base URL

```
Production:  https://api.yourservice.com
Development: http://localhost:8000
```

### 2.2 API Prefix

All endpoints are prefixed with `/api/knowledge`:

```
http://localhost:8000/api/knowledge/{endpoint}
```

### 2.3 Content Types

**Request**: `application/json` (except file upload endpoints)  
**Response**: `application/json`

### 2.4 HTTP Methods

- **GET**: Retrieve resources
- **POST**: Create resources, start workflows
- **PUT**: Update resources (not yet implemented)
- **DELETE**: Delete resources (not yet implemented)

### 2.5 Versioning

Current API version: **v1** (unversioned prefix `/api/knowledge`)

Future versions will use explicit versioning:
- `/api/v2/knowledge` (future)

### 2.6 Response Format

All successful responses follow this structure:

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

Error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Additional error context
    }
  },
  "meta": {
    "timestamp": "2026-01-14T10:00:00Z"
  }
}
```

---

## 3. Ingestion API

Endpoints for starting knowledge extraction workflows from various sources.

### 3.1 Start Ingestion (URL-based)

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
  "job_id": "string (optional, auto-generated if not provided)"
}
```

**Response Schema** (200 OK):

```json
{
  "job_id": "string (UUID format)",
  "workflow_id": "string (Temporal workflow ID)",
  "status": "queued",
  "estimated_duration_seconds": "integer (estimated completion time)",
  "message": "string (human-readable status)"
}
```

**Example Request**:

```bash
curl -X POST http://localhost:8000/api/knowledge/ingest/start \
  -H "Content-Type: application/json" \
  -d '{
    "source_type": "documentation",
    "source_url": "https://docs.example.com",
    "source_name": "Example Documentation",
    "options": {
      "extract_code_blocks": true
    }
  }'
```

**Example Response**:

```json
{
  "job_id": "job-abc123def456",
  "workflow_id": "knowledge-extraction-job-abc123def456",
  "status": "queued",
  "estimated_duration_seconds": 300,
  "message": "Knowledge extraction workflow started successfully for documentation"
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

---

### 3.2 Start Ingestion (File Upload)

Start knowledge extraction from an uploaded file.

**Endpoint**: `POST /api/knowledge/ingest/upload`

**Request**: `multipart/form-data`

**Form Fields**:
- `source_type`: `documentation` | `video` (required)
- `source_name`: string (required)
- `file`: File upload (required)
- `job_id`: string (optional)

**Supported File Types**:
- **Documentation**: `.md`, `.pdf`, `.txt`, `.html`
- **Video**: `.mp4`, `.mov`, `.avi`, `.webm`

**Response Schema** (200 OK):

```json
{
  "job_id": "string",
  "workflow_id": "string",
  "status": "queued",
  "estimated_duration_seconds": "integer",
  "message": "string"
}
```

**Example Request**:

```bash
curl -X POST http://localhost:8000/api/knowledge/ingest/upload \
  -F "source_type=documentation" \
  -F "source_name=User Guide" \
  -F "file=@/path/to/user-guide.pdf"
```

**Status Codes**:
- `200 OK`: File uploaded and workflow started
- `400 Bad Request`: Invalid file type or missing fields
- `413 Payload Too Large`: File exceeds size limit
- `501 Not Implemented`: Feature not yet available
- `500 Internal Server Error`: Upload failed

**File Size Limits**:
- Documentation: 50 MB max
- Video: 500 MB max

**Current Status**: ⚠️ **Not Yet Implemented** (returns 501)

---

## 4. Graph Query API

Query the knowledge graph to find navigation paths, adjacent screens, and relationships.

### 4.1 Query Graph

Execute graph queries using ArangoDB graph traversal.

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
  "query_type": "string (executed query type)",
  "results": [
    {
      // Query-specific result objects
    }
  ],
  "count": "integer (number of results)",
  "execution_time_ms": "float (query execution time)"
}
```

**Query Types**:

#### 4.1.1 Find Path

Find shortest path between two screens.

**Required Fields**: `source_screen_id`, `target_screen_id`

**Example Request**:

```bash
curl -X POST http://localhost:8000/api/knowledge/graph/query \
  -H "Content-Type: application/json" \
  -d '{
    "query_type": "find_path",
    "source_screen_id": "screen-home",
    "target_screen_id": "screen-settings",
    "website_id": "example-app"
  }'
```

**Example Response**:

```json
{
  "query_type": "find_path",
  "results": [
    {
      "path": [
        {
          "screen_id": "screen-home",
          "screen_name": "Home Page",
          "transition": "click_menu_button"
        },
        {
          "screen_id": "screen-menu",
          "screen_name": "Navigation Menu",
          "transition": "click_settings_link"
        },
        {
          "screen_id": "screen-settings",
          "screen_name": "Settings Page"
        }
      ],
      "total_cost": 2.5,
      "reliability": 0.92,
      "hop_count": 2
    }
  ],
  "count": 1,
  "execution_time_ms": 45.2
}
```

#### 4.1.2 Get Neighbors

Get adjacent screens (1-hop away).

**Required Fields**: `source_screen_id`

**Example Request**:

```bash
curl -X POST http://localhost:8000/api/knowledge/graph/query \
  -H "Content-Type: application/json" \
  -d '{
    "query_type": "get_neighbors",
    "source_screen_id": "screen-home",
    "limit": 5
  }'
```

**Example Response**:

```json
{
  "query_type": "get_neighbors",
  "results": [
    {
      "screen_id": "screen-login",
      "screen_name": "Login Page",
      "transition_cost": 1.0,
      "reliability": 0.98
    },
    {
      "screen_id": "screen-dashboard",
      "screen_name": "Dashboard",
      "transition_cost": 1.5,
      "reliability": 0.95
    }
  ],
  "count": 2,
  "execution_time_ms": 12.3
}
```

#### 4.1.3 Search Screens

Search screens by name or website.

**Required Fields**: `screen_name` OR `website_id`

**Example Request**:

```bash
curl -X POST http://localhost:8000/api/knowledge/graph/query \
  -H "Content-Type: application/json" \
  -d '{
    "query_type": "search_screens",
    "website_id": "example-app",
    "limit": 10
  }'
```

**Example Response**:

```json
{
  "query_type": "search_screens",
  "results": [
    {
      "count": 42,
      "website_id": "example-app"
    }
  ],
  "count": 1,
  "execution_time_ms": 8.5
}
```

#### 4.1.4 Get Transitions

Get all transitions from a screen.

**Required Fields**: `source_screen_id`

**Example Request**:

```bash
curl -X POST http://localhost:8000/api/knowledge/graph/query \
  -H "Content-Type: application/json" \
  -d '{
    "query_type": "get_transitions",
    "source_screen_id": "screen-home",
    "limit": 10
  }'
```

**Example Response**:

```json
{
  "query_type": "get_transitions",
  "results": [
    {
      "transition_id": "trans-123",
      "source_screen_id": "screen-home",
      "target_screen_id": "screen-login",
      "trigger_action": "click_login_button",
      "cost": 1.0,
      "reliability": 0.98,
      "conditions": ["user_not_authenticated"],
      "effects": ["user_session_created"]
    }
  ],
  "count": 1,
  "execution_time_ms": 15.7
}
```

**Status Codes**:
- `200 OK`: Query executed successfully
- `400 Bad Request`: Missing required fields or invalid query type
- `500 Internal Server Error`: Query execution failed

---

## 5. Knowledge Definition API

Retrieve full definitions of knowledge entities (screens, tasks, actions, transitions).

### 5.1 Get Screen Definition

Retrieve complete screen definition from MongoDB.

**Endpoint**: `GET /api/knowledge/screens/{screen_id}`

**Path Parameters**:
- `screen_id`: string (required) - Screen identifier

**Response Schema** (200 OK):

```json
{
  "screen_id": "string",
  "name": "string",
  "website_id": "string",
  "description": "string",
  "url_patterns": ["string"],
  "state_signature": {
    "indicators": [
      {
        "type": "dom_element" | "url_segment" | "title_keyword",
        "value": "string",
        "match_type": "exact" | "regex" | "contains"
      }
    ],
    "negative_indicators": [
      {
        "type": "string",
        "value": "string",
        "description": "string"
      }
    ]
  },
  "ui_elements": [
    {
      "element_id": "string",
      "element_name": "string",
      "element_type": "button" | "input" | "link" | "dropdown",
      "selectors": {
        "primary": {
          "strategy": "css" | "xpath" | "text" | "aria_label",
          "value": "string"
        },
        "fallback": [
          {
            "strategy": "string",
            "value": "string",
            "priority": "integer"
          }
        ]
      },
      "affordances": ["string"]
    }
  ],
  "metadata": {
    "created_at": "string (ISO 8601)",
    "updated_at": "string (ISO 8601)",
    "reliability_score": "float (0-1)",
    "last_verified": "string (ISO 8601)"
  }
}
```

**Example Request**:

```bash
curl http://localhost:8000/api/knowledge/screens/screen-login
```

**Example Response**:

```json
{
  "screen_id": "screen-login",
  "name": "Login Page",
  "website_id": "example-app",
  "description": "User authentication screen",
  "url_patterns": ["/login", "/signin", "/auth/login"],
  "state_signature": {
    "indicators": [
      {
        "type": "dom_element",
        "value": "form[id='login-form']",
        "match_type": "css"
      },
      {
        "type": "title_keyword",
        "value": "Login",
        "match_type": "contains"
      }
    ],
    "negative_indicators": []
  },
  "ui_elements": [
    {
      "element_id": "elem-username",
      "element_name": "Username Input",
      "element_type": "input",
      "selectors": {
        "primary": {
          "strategy": "css",
          "value": "input[name='username']"
        },
        "fallback": [
          {
            "strategy": "xpath",
            "value": "//input[@type='text'][@placeholder='Username']",
            "priority": 1
          }
        ]
      },
      "affordances": ["input_text", "clear"]
    }
  ],
  "metadata": {
    "created_at": "2026-01-14T10:00:00Z",
    "updated_at": "2026-01-14T10:00:00Z",
    "reliability_score": 0.95,
    "last_verified": "2026-01-14T10:00:00Z"
  }
}
```

**Status Codes**:
- `200 OK`: Screen found and returned
- `404 Not Found`: Screen does not exist
- `500 Internal Server Error`: Retrieval failed

---

### 5.2 Get Task Definition

Retrieve complete task definition from MongoDB.

**Endpoint**: `GET /api/knowledge/tasks/{task_id}`

**Path Parameters**:
- `task_id`: string (required) - Task identifier

**Response Schema** (200 OK):

```json
{
  "task_id": "string",
  "name": "string",
  "website_id": "string",
  "description": "string",
  "goal": "string",
  "steps": [
    {
      "step_id": "string",
      "step_name": "string",
      "step_order": "integer",
      "action_id": "string",
      "screen_id": "string",
      "preconditions": ["string"],
      "postconditions": ["string"]
    }
  ],
  "preconditions": [
    {
      "type": "screen_state" | "element_visible" | "data_available",
      "description": "string"
    }
  ],
  "postconditions": [
    {
      "type": "screen_changed" | "element_appeared" | "data_updated",
      "expected_value": "string"
    }
  ],
  "iterator_spec": {
    "enabled": "boolean",
    "items_source": "string",
    "max_iterations": "integer",
    "break_condition": "string"
  },
  "io_spec": {
    "inputs": [
      {
        "name": "string",
        "type": "string" | "integer" | "boolean" | "object",
        "required": "boolean",
        "volatility": "high" | "medium" | "low",
        "description": "string"
      }
    ],
    "outputs": [
      {
        "name": "string",
        "type": "string",
        "source": "string"
      }
    ]
  }
}
```

**Example Request**:

```bash
curl http://localhost:8000/api/knowledge/tasks/task-create-user
```

**Status Codes**:
- `200 OK`: Task found and returned
- `404 Not Found`: Task does not exist
- `500 Internal Server Error`: Retrieval failed

---

### 5.3 Get Action Definition

Retrieve complete action definition from MongoDB.

**Endpoint**: `GET /api/knowledge/actions/{action_id}`

**Path Parameters**:
- `action_id`: string (required) - Action identifier

**Response Schema** (200 OK):

```json
{
  "action_id": "string",
  "name": "string",
  "website_id": "string",
  "action_type": "click" | "input" | "select" | "navigate" | "extract" | "wait",
  "description": "string",
  "screen_id": "string",
  "element_id": "string",
  "execution_steps": [
    {
      "step_order": "integer",
      "command": "string",
      "parameters": {
        "selector": "string",
        "value": "string",
        "timeout": "integer"
      }
    }
  ],
  "preconditions": [
    {
      "type": "element_visible" | "element_enabled" | "screen_state",
      "description": "string"
    }
  ],
  "postconditions": [
    {
      "type": "element_appeared" | "screen_changed" | "data_updated",
      "expected_value": "string"
    }
  ],
  "error_handling": {
    "retry_policy": {
      "max_attempts": "integer",
      "backoff_seconds": "integer"
    },
    "fallback_actions": ["string (action_ids)"]
  }
}
```

**Example Request**:

```bash
curl http://localhost:8000/api/knowledge/actions/action-click-login
```

**Status Codes**:
- `200 OK`: Action found and returned
- `404 Not Found`: Action does not exist
- `500 Internal Server Error`: Retrieval failed

---

### 5.4 Get Transition Definition

Retrieve complete transition definition from MongoDB.

**Endpoint**: `GET /api/knowledge/transitions/{transition_id}`

**Path Parameters**:
- `transition_id`: string (required) - Transition identifier

**Response Schema** (200 OK):

```json
{
  "transition_id": "string",
  "website_id": "string",
  "source_screen_id": "string",
  "target_screen_id": "string",
  "trigger_action_id": "string",
  "transition_type": "user_action" | "auto_redirect" | "error_recovery",
  "conditions": [
    {
      "type": "auth_required" | "data_available",
      "description": "string"
    }
  ],
  "effects": [
    {
      "type": "state_changed" | "data_updated",
      "description": "string"
    }
  ],
  "metadata": {
    "cost": "float (time in seconds)",
    "reliability": "float (0-1)",
    "usage_count": "integer"
  }
}
```

**Example Request**:

```bash
curl http://localhost:8000/api/knowledge/transitions/trans-home-to-login
```

**Status Codes**:
- `200 OK`: Transition found and returned
- `404 Not Found`: Transition does not exist
- `500 Internal Server Error`: Retrieval failed

---

### 5.5 List Screens

List all screens for a website.

**Endpoint**: `GET /api/knowledge/screens`

**Query Parameters**:
- `website_id`: string (required) - Website identifier
- `limit`: integer (optional, default: 100) - Max results

**Response Schema** (200 OK):

```json
[
  {
    "screen_id": "string",
    "name": "string",
    "website_id": "string",
    // ... other screen fields
  }
]
```

**Example Request**:

```bash
curl "http://localhost:8000/api/knowledge/screens?website_id=example-app&limit=10"
```

**Status Codes**:
- `200 OK`: Screens returned
- `500 Internal Server Error`: Query failed

---

### 5.6 List Tasks

List all tasks for a website.

**Endpoint**: `GET /api/knowledge/tasks`

**Query Parameters**:
- `website_id`: string (required) - Website identifier
- `limit`: integer (optional, default: 100) - Max results

**Response Schema** (200 OK):

```json
[
  {
    "task_id": "string",
    "name": "string",
    "website_id": "string",
    // ... other task fields
  }
]
```

**Example Request**:

```bash
curl "http://localhost:8000/api/knowledge/tasks?website_id=example-app&limit=10"
```

**Status Codes**:
- `200 OK`: Tasks returned
- `500 Internal Server Error`: Query failed

---

## 6. Workflow Management API

Track and manage knowledge extraction workflows.

### 6.1 Get Workflow Status

Get detailed workflow execution status, progress, and errors.

**Endpoint**: `GET /api/knowledge/workflows/status/{job_id}`

**Path Parameters**:
- `job_id`: string (required) - Job identifier (returned from `/ingest/start`)

**Response Schema** (200 OK):

```json
{
  "job_id": "string",
  "workflow_id": "string",
  "status": "queued" | "running" | "completed" | "failed" | "cancelled",
  "phase": "string (current workflow phase)",
  "progress": "float (0-100, percentage complete)",
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
  "updated_at": "string (ISO 8601)",
  "metadata": {
    "source_type": "string",
    "source_url": "string",
    "estimated_completion": "string (ISO 8601)"
  }
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

**Example Request**:

```bash
curl http://localhost:8000/api/knowledge/workflows/status/job-abc123def456
```

**Example Response**:

```json
{
  "job_id": "job-abc123def456",
  "workflow_id": "knowledge-extraction-job-abc123def456",
  "status": "running",
  "phase": "extract_screens",
  "progress": 42.5,
  "errors": [],
  "warnings": [
    "Skipped invalid screen definition on page 15"
  ],
  "checkpoints": [
    {
      "activity_name": "ingest_source_activity",
      "checkpoint_id": 1,
      "items_processed": 10,
      "total_items": 20,
      "progress_percentage": 50.0
    },
    {
      "activity_name": "extract_screens_activity",
      "checkpoint_id": 2,
      "items_processed": 5,
      "total_items": 15,
      "progress_percentage": 33.3
    }
  ],
  "created_at": "2026-01-14T10:00:00Z",
  "updated_at": "2026-01-14T10:05:30Z",
  "metadata": {
    "source_type": "documentation",
    "source_url": "https://docs.example.com",
    "estimated_completion": "2026-01-14T10:10:00Z"
  }
}
```

**Status Codes**:
- `200 OK`: Status retrieved successfully
- `404 Not Found`: Job does not exist
- `500 Internal Server Error`: Status retrieval failed

---

### 6.2 List Workflows

List all workflows, optionally filtered by status.

**Endpoint**: `GET /api/knowledge/workflows/list`

**Query Parameters**:
- `status`: string (optional) - Filter by status (`queued`, `running`, `completed`, `failed`, `cancelled`)
- `limit`: integer (optional, default: 100) - Max results

**Response Schema** (200 OK):

```json
[
  {
    "job_id": "string",
    "workflow_id": "string",
    "status": "string",
    "phase": "string",
    "progress": "float",
    "created_at": "string (ISO 8601)",
    "updated_at": "string (ISO 8601)"
  }
]
```

**Example Request**:

```bash
# List all workflows
curl http://localhost:8000/api/knowledge/workflows/list

# List only running workflows
curl "http://localhost:8000/api/knowledge/workflows/list?status=running&limit=10"
```

**Example Response**:

```json
[
  {
    "job_id": "job-abc123",
    "workflow_id": "knowledge-extraction-job-abc123",
    "status": "completed",
    "phase": "completed",
    "progress": 100.0,
    "created_at": "2026-01-14T09:00:00Z",
    "updated_at": "2026-01-14T09:15:00Z"
  },
  {
    "job_id": "job-def456",
    "workflow_id": "knowledge-extraction-job-def456",
    "status": "running",
    "phase": "extract_tasks",
    "progress": 65.0,
    "created_at": "2026-01-14T10:00:00Z",
    "updated_at": "2026-01-14T10:05:00Z"
  }
]
```

**Status Codes**:
- `200 OK`: Workflows returned
- `500 Internal Server Error`: List retrieval failed

---

## 7. Verification API

Browser-based verification of extracted knowledge (optional feature).

### 7.1 Start Verification

Start browser-based verification workflow to validate extracted knowledge.

**Endpoint**: `POST /api/knowledge/verify/start`

**Feature Flag**: Requires `FEATURE_BROWSER_VERIFICATION=true`

**Request Schema**:

```json
{
  "target_type": "job" | "screen" | "task",
  "target_id": "string (job_id, screen_id, or task_id)",
  "verification_options": {
    "enable_enrichment": "boolean (optional, apply enrichments)",
    "headless": "boolean (optional, run browser headless)",
    "timeout_seconds": "integer (optional, verification timeout)"
  }
}
```

**Response Schema** (200 OK):

```json
{
  "verification_job_id": "string (verification workflow ID)",
  "target_type": "string",
  "target_id": "string",
  "status": "queued",
  "message": "string"
}
```

**Example Request**:

```bash
curl -X POST http://localhost:8000/api/knowledge/verify/start \
  -H "Content-Type: application/json" \
  -d '{
    "target_type": "screen",
    "target_id": "screen-login",
    "verification_options": {
      "enable_enrichment": true,
      "headless": false
    }
  }'
```

**Example Response**:

```json
{
  "verification_job_id": "verify-xyz789",
  "target_type": "screen",
  "target_id": "screen-login",
  "status": "queued",
  "message": "Verification workflow started for screen screen-login"
}
```

**Status Codes**:
- `200 OK`: Verification started successfully
- `400 Bad Request`: Invalid request parameters
- `503 Service Unavailable`: Feature disabled (FEATURE_BROWSER_VERIFICATION=false)
- `500 Internal Server Error`: Verification startup failed

**Verification Process**:
1. Load knowledge definitions (screens, tasks, actions)
2. Launch browser session
3. Navigate to target screens
4. Execute actions and validate results
5. Detect discrepancies (missing elements, changed selectors)
6. Apply enrichments (if enabled)
7. Generate verification report
8. Cleanup browser session

**Track Verification**: Use `/workflows/status/{verification_job_id}` to track progress.

---

## 8. Health Check API

Service health monitoring endpoint.

### 8.1 Health Check

Check API service health status.

**Endpoint**: `GET /api/knowledge/health`

**Response Schema** (200 OK):

```json
{
  "status": "healthy" | "unhealthy" | "degraded",
  "service": "knowledge-extraction-api",
  "version": "string",
  "dependencies": {
    "mongodb": "connected" | "disconnected",
    "arangodb": "connected" | "disconnected",
    "temporal": "connected" | "disconnected"
  },
  "timestamp": "string (ISO 8601)"
}
```

**Example Request**:

```bash
curl http://localhost:8000/api/knowledge/health
```

**Example Response**:

```json
{
  "status": "healthy",
  "service": "knowledge-extraction-api",
  "version": "1.0.0",
  "dependencies": {
    "mongodb": "connected",
    "arangodb": "connected",
    "temporal": "connected"
  },
  "timestamp": "2026-01-14T10:00:00Z"
}
```

**Status Codes**:
- `200 OK`: Service is healthy
- `503 Service Unavailable`: Service is unhealthy

---

## 9. Error Handling

### 9.1 Error Response Format

All errors follow this structure:

```json
{
  "detail": "string (human-readable error message)",
  "error_code": "string (optional, machine-readable code)",
  "context": {
    // Additional error details
  }
}
```

### 9.2 HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource does not exist |
| 413 | Payload Too Large | File/request too large |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 501 | Not Implemented | Feature not available |
| 503 | Service Unavailable | Service temporarily unavailable |

### 9.3 Common Errors

**Missing Required Field**:
```json
{
  "detail": "Field 'source_url' is required",
  "error_code": "MISSING_REQUIRED_FIELD"
}
```

**Resource Not Found**:
```json
{
  "detail": "Screen not found: screen-xyz",
  "error_code": "RESOURCE_NOT_FOUND"
}
```

**Workflow Failed**:
```json
{
  "detail": "Workflow execution failed: Connection timeout",
  "error_code": "WORKFLOW_EXECUTION_FAILED",
  "context": {
    "job_id": "job-abc123",
    "phase": "ingest_source",
    "error_type": "network"
  }
}
```

**Feature Disabled**:
```json
{
  "detail": "Browser verification is not enabled. Set FEATURE_BROWSER_VERIFICATION=true to enable.",
  "error_code": "FEATURE_DISABLED"
}
```

### 9.4 Error Recovery

For transient errors (network timeouts, database connection issues):
1. Workflows automatically retry with exponential backoff
2. Clients should retry 4xx errors after fixing request
3. Clients can retry 5xx errors with exponential backoff

**Retry Strategy** (recommended):
```
Initial delay: 1 second
Max delay: 30 seconds
Backoff factor: 2.0
Max attempts: 3
```

---

## 10. Process Tracking

### 10.1 Real-Time Progress Monitoring

Monitor workflow progress using polling:

```bash
#!/bin/bash
# Poll workflow status every 5 seconds

JOB_ID="job-abc123"

while true; do
  STATUS=$(curl -s http://localhost:8000/api/knowledge/workflows/status/$JOB_ID | jq -r '.status')
  PROGRESS=$(curl -s http://localhost:8000/api/knowledge/workflows/status/$JOB_ID | jq -r '.progress')
  
  echo "Status: $STATUS, Progress: $PROGRESS%"
  
  if [ "$STATUS" == "completed" ] || [ "$STATUS" == "failed" ]; then
    break
  fi
  
  sleep 5
done
```

### 10.2 Checkpoint-Based Progress

Workflows report progress via checkpoints:

```json
{
  "checkpoints": [
    {
      "activity_name": "extract_screens_activity",
      "checkpoint_id": 2,
      "items_processed": 15,
      "total_items": 42,
      "progress_percentage": 35.7
    }
  ]
}
```

**Checkpoint Lifecycle**:
1. Activity starts → checkpoint created
2. Items processed → checkpoint updated
3. Activity completes → checkpoint finalized
4. Next activity → new checkpoint

### 10.3 Event Streaming (Future)

Planned: WebSocket support for real-time updates.

```javascript
// Future implementation
const ws = new WebSocket('ws://localhost:8000/api/knowledge/workflows/stream');

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log(`Job ${update.job_id}: ${update.phase} - ${update.progress}%`);
};
```

---

## 11. Rate Limiting

### 11.1 Current Status

**Rate Limiting**: Not implemented (v1.0.0)

All endpoints are currently **unlimited** for development/testing.

### 11.2 Future Implementation

Planned rate limits:

| Endpoint Category | Rate Limit |
|------------------|------------|
| Ingestion | 10 requests/minute |
| Graph Query | 100 requests/minute |
| Knowledge Retrieval | 1000 requests/minute |
| Workflow Status | 1000 requests/minute |
| Verification | 5 requests/minute |

**Rate Limit Headers** (future):
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705234800
```

**Rate Limit Exceeded Response**:
```json
{
  "detail": "Rate limit exceeded. Try again in 60 seconds.",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 60
}
```

---

## 12. SDK Usage

### 12.1 Python SDK (Requests)

```python
import requests
import time

# Start ingestion
response = requests.post(
    "http://localhost:8000/api/knowledge/ingest/start",
    json={
        "source_type": "documentation",
        "source_url": "https://docs.example.com",
        "source_name": "Example Docs"
    }
)

data = response.json()
job_id = data["job_id"]
print(f"Started job: {job_id}")

# Poll for completion
while True:
    status_response = requests.get(
        f"http://localhost:8000/api/knowledge/workflows/status/{job_id}"
    )
    status_data = status_response.json()
    
    print(f"Status: {status_data['status']}, Progress: {status_data['progress']}%")
    
    if status_data["status"] in ["completed", "failed"]:
        break
    
    time.sleep(5)

# Get extracted screens
screens_response = requests.get(
    "http://localhost:8000/api/knowledge/screens",
    params={"website_id": "example-docs", "limit": 10}
)

screens = screens_response.json()
print(f"Extracted {len(screens)} screens")
```

### 12.2 JavaScript/TypeScript SDK

```typescript
// Start ingestion
const startResponse = await fetch('http://localhost:8000/api/knowledge/ingest/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source_type: 'documentation',
    source_url: 'https://docs.example.com',
    source_name: 'Example Docs'
  })
});

const { job_id } = await startResponse.json();
console.log(`Started job: ${job_id}`);

// Poll for completion
const pollStatus = async () => {
  const statusResponse = await fetch(
    `http://localhost:8000/api/knowledge/workflows/status/${job_id}`
  );
  const statusData = await statusResponse.json();
  
  console.log(`Status: ${statusData.status}, Progress: ${statusData.progress}%`);
  
  if (statusData.status === 'completed' || statusData.status === 'failed') {
    return statusData;
  }
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  return pollStatus();
};

await pollStatus();

// Get extracted screens
const screensResponse = await fetch(
  'http://localhost:8000/api/knowledge/screens?website_id=example-docs&limit=10'
);

const screens = await screensResponse.json();
console.log(`Extracted ${screens.length} screens`);
```

### 12.3 cURL Examples

See individual endpoint sections for cURL examples.

---

## 13. Examples & Tutorials

### 13.1 Complete Workflow Example

Extract knowledge from documentation and query the graph:

```bash
#!/bin/bash

# 1. Start ingestion
RESPONSE=$(curl -s -X POST http://localhost:8000/api/knowledge/ingest/start \
  -H "Content-Type: application/json" \
  -d '{
    "source_type": "documentation",
    "source_url": "https://docs.example.com",
    "source_name": "Example Documentation"
  }')

JOB_ID=$(echo $RESPONSE | jq -r '.job_id')
echo "Started job: $JOB_ID"

# 2. Wait for completion
while true; do
  STATUS=$(curl -s http://localhost:8000/api/knowledge/workflows/status/$JOB_ID | jq -r '.status')
  PROGRESS=$(curl -s http://localhost:8000/api/knowledge/workflows/status/$JOB_ID | jq -r '.progress')
  
  echo "Status: $STATUS, Progress: $PROGRESS%"
  
  if [ "$STATUS" == "completed" ]; then
    break
  fi
  
  if [ "$STATUS" == "failed" ]; then
    echo "Workflow failed!"
    exit 1
  fi
  
  sleep 5
done

# 3. List extracted screens
echo "Listing screens..."
curl -s "http://localhost:8000/api/knowledge/screens?website_id=example-docs&limit=5" | jq '.[].screen_id'

# 4. Query graph for navigation path
echo "Finding path between screens..."
curl -s -X POST http://localhost:8000/api/knowledge/graph/query \
  -H "Content-Type: application/json" \
  -d '{
    "query_type": "find_path",
    "source_screen_id": "screen-home",
    "target_screen_id": "screen-settings"
  }' | jq '.results[0].path'

echo "Complete!"
```

### 13.2 Verification Workflow Example

Extract and verify knowledge:

```bash
#!/bin/bash

# Enable verification feature
export FEATURE_BROWSER_VERIFICATION=true

# 1. Extract knowledge
INGEST_RESPONSE=$(curl -s -X POST http://localhost:8000/api/knowledge/ingest/start \
  -H "Content-Type: application/json" \
  -d '{
    "source_type": "website",
    "source_url": "https://app.example.com",
    "source_name": "Example App"
  }')

JOB_ID=$(echo $INGEST_RESPONSE | jq -r '.job_id')

# 2. Wait for extraction
while true; do
  STATUS=$(curl -s http://localhost:8000/api/knowledge/workflows/status/$JOB_ID | jq -r '.status')
  [ "$STATUS" == "completed" ] && break
  sleep 5
done

# 3. Start verification
VERIFY_RESPONSE=$(curl -s -X POST http://localhost:8000/api/knowledge/verify/start \
  -H "Content-Type: application/json" \
  -d '{
    "target_type": "job",
    "target_id": "'$JOB_ID'",
    "verification_options": {
      "enable_enrichment": true
    }
  }')

VERIFY_JOB_ID=$(echo $VERIFY_RESPONSE | jq -r '.verification_job_id')

# 4. Wait for verification
while true; do
  VERIFY_STATUS=$(curl -s http://localhost:8000/api/knowledge/workflows/status/$VERIFY_JOB_ID | jq -r '.status')
  [ "$VERIFY_STATUS" == "completed" ] && break
  sleep 5
done

echo "Verification complete!"
```

---

## Appendix A: OpenAPI Specification

Full OpenAPI/Swagger specification available at:

```
http://localhost:8000/api/knowledge/docs
```

(Auto-generated by FastAPI)

---

## Appendix B: Postman Collection

Import the API into Postman using this OpenAPI spec URL:

```
http://localhost:8000/api/knowledge/openapi.json
```

---

## Appendix C: Change Log

### Version 1.0.0 (2026-01-14)
- ✅ Initial release
- ✅ Ingestion API (URL-based)
- ✅ Graph Query API (4 query types)
- ✅ Knowledge Definition API (screens, tasks, actions, transitions)
- ✅ Workflow Management API (status, list)
- ✅ Verification API (optional, Phase 7)
- ✅ Health Check API

### Upcoming Features
- 🔜 File upload support (Phase 6.1)
- 🔜 Authentication & authorization
- 🔜 Rate limiting
- 🔜 WebSocket support for real-time updates
- 🔜 Bulk operations API
- 🔜 Export API (JSON, CSV formats)

---

**Last Updated**: January 14, 2026  
**Version**: 1.0.0  
**Status**: Production Ready

**Support**: For questions or issues, contact [support@yourservice.com](mailto:support@yourservice.com)

---

*This API specification provides complete documentation for the Knowledge Extraction REST API, including all endpoints, schemas, error handling, and usage examples.*
