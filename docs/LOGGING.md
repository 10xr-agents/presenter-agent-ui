# Logging Best Practices

This document outlines logging best practices for the Screen Agent Platform to ensure consistent, debuggable, and maintainable logging throughout the codebase.

## Overview

We use a centralized logging utility (`lib/utils/logger.ts`) for all application logging. This ensures:
- Consistent log formatting
- Structured logging with context
- Environment-aware logging levels
- Easy integration with monitoring tools

## Logger Utility

### Import

```typescript
import { logger } from "@/lib/utils/logger"
```

### Available Methods

- `logger.debug(message, context?)` - Debug logs (only in development)
- `logger.info(message, context?)` - Informational logs
- `logger.warn(message, context?)` - Warning logs
- `logger.error(message, error?, context?)` - Error logs with error object

### Log Levels

- **DEBUG**: Detailed information for debugging (only shown in development)
- **INFO**: General informational messages (e.g., user actions, successful operations)
- **WARN**: Warning messages for potential issues (e.g., missing configuration)
- **ERROR**: Error messages with error objects (e.g., API failures, exceptions)

## Best Practices

### 1. Always Use the Logger Utility

❌ **Don't use:**
```typescript
console.log("User signed in")
console.error("Failed to send email:", error)
console.warn("Resend not configured")
```

✅ **Do use:**
```typescript
logger.info("User signed in", { userId, email })
logger.error("Failed to send email", error, { userId, email })
logger.warn("Resend not configured", { userId })
```

### 2. Include Contextual Information

Always include relevant context in your logs:

```typescript
// Good - includes context
logger.info("Screen agent created", {
  agentId: agent.id,
  userId: user.id,
  organizationId: org.id,
  agentName: agent.name,
})

// Bad - missing context
logger.info("Screen agent created")
```

### 3. Use Appropriate Log Levels

- **DEBUG**: Detailed debugging information
  ```typescript
  logger.debug("Processing request", { requestId, userId, endpoint })
  ```

- **INFO**: Successful operations, user actions
  ```typescript
  logger.info("User signed up successfully", { userId, email })
  ```

- **WARN**: Potential issues, missing configuration
  ```typescript
  logger.warn("Resend not configured, skipping email", { userId })
  ```

- **ERROR**: Errors with error objects
  ```typescript
  logger.error("Failed to send verification email", error, { userId, email })
  ```

### 4. Authentication & Authorization Logging

Always log authentication and authorization events with user context:

```typescript
// Sign up
logger.info("User signup requested", { email })
logger.info("User signup successful", { userId, email })
logger.error("User signup failed", error, { email })

// Sign in
logger.info("User signin requested", { email })
logger.info("User signin successful", { userId, email })
logger.warn("User signin failed - invalid credentials", { email })
logger.error("User signin failed", error, { email })

// Email verification
logger.info("Email verification requested", { userId, email })
logger.info("Email verification sent", { userId, email, emailId })
logger.error("Email verification failed", error, { userId, email })

// Password reset
logger.info("Password reset requested", { email })
logger.info("Password reset completed", { userId, email })
logger.error("Password reset failed", error, { email })

// Authorization
logger.warn("Unauthorized access attempted", { userId, resource, action })
logger.warn("Permission denied", { userId, organizationId, requiredPermission })
```

### 5. API Route Logging

Log API requests and responses:

```typescript
export async function POST(request: Request) {
  logger.info("API request received", {
    method: "POST",
    endpoint: "/api/screen-agents",
    userId: session?.user?.id,
  })

  try {
    // ... process request
    logger.info("API request successful", {
      endpoint: "/api/screen-agents",
      userId: session?.user?.id,
      statusCode: 200,
    })
    return successResponse(data)
  } catch (error: unknown) {
    logger.error("API request failed", error, {
      endpoint: "/api/screen-agents",
      userId: session?.user?.id,
    })
    return errorResponse("Internal server error", 500)
  }
}
```

### 6. External Service Integration Logging

Log external service calls (email, payment, etc.):

```typescript
// Before calling external service
logger.debug("Calling external service", {
  service: "Resend",
  action: "sendEmail",
  userId,
})

// After successful call
logger.info("External service call successful", {
  service: "Resend",
  action: "sendEmail",
  userId,
  emailId: result.data?.id,
})

// On error
logger.error("External service call failed", error, {
  service: "Resend",
  action: "sendEmail",
  userId,
  errorDetails: result.error,
})
```

### 7. Sensitive Data

**Never log sensitive data:**

❌ **Don't log:**
- Passwords or password hashes
- API keys or secrets
- Credit card numbers
- Full authentication tokens (log token ID only)
- Personal identification numbers (SSN, etc.)

✅ **Do log:**
- User IDs
- Email addresses (for debugging purposes)
- Resource IDs
- Error messages (sanitized)
- Request IDs
- Timestamps

### 8. Error Logging

Always include the error object when logging errors:

```typescript
try {
  await sendEmail()
} catch (error: unknown) {
  logger.error("Failed to send email", error, {
    userId,
    email,
    // Additional context
  })
}
```

The logger automatically extracts error details (message, stack, name) from Error objects.

### 9. Debug Logging

Use debug logs for detailed information that's only needed during development:

```typescript
logger.debug("Database query executed", {
  query: "findUser",
  userId,
  duration: queryTime,
})
```

Debug logs are automatically filtered out in production.

### 10. Log Format

The logger automatically formats logs with:
- Timestamp (ISO 8601)
- Log level
- Message
- Context (JSON)

Example output:
```
[2026-01-11T20:53:13.343Z] [INFO] Email verification sent successfully {"userId":"user123","email":"user@example.com","emailId":"msg_abc123"}
```

## Common Patterns

### Authentication Flow

```typescript
// Sign up
logger.info("User signup requested", { email })
try {
  const user = await createUser(data)
  logger.info("User created successfully", { userId: user.id, email: user.email })
  
  // Email verification is handled by Better Auth
  // Logging is in auth.ts sendVerificationEmail function
} catch (error: unknown) {
  logger.error("User signup failed", error, { email })
  throw error
}
```

### API Route Pattern

```typescript
export async function POST(request: Request) {
  const startTime = Date.now()
  
  logger.info("API request started", {
    method: "POST",
    endpoint: "/api/resource",
  })

  try {
    // ... validate request
    logger.debug("Request validation passed", { endpoint: "/api/resource" })

    // ... process request
    const result = await processRequest(data)
    
    logger.info("API request completed", {
      endpoint: "/api/resource",
      statusCode: 200,
      duration: Date.now() - startTime,
    })
    
    return successResponse(result)
  } catch (error: unknown) {
    logger.error("API request failed", error, {
      endpoint: "/api/resource",
      statusCode: 500,
      duration: Date.now() - startTime,
    })
    
    return errorResponse("Internal server error", 500)
  }
}
```

### Background Job Pattern

```typescript
async function processJob(job: Job) {
  logger.info("Job started", {
    jobId: job.id,
    jobType: job.name,
  })

  try {
    // ... process job
    logger.info("Job completed successfully", {
      jobId: job.id,
      jobType: job.name,
      duration: Date.now() - job.timestamp,
    })
  } catch (error: unknown) {
    logger.error("Job failed", error, {
      jobId: job.id,
      jobType: job.name,
      attempts: job.attemptsMade,
    })
    throw error // Re-throw for retry mechanism
  }
}
```

## Integration with Monitoring

### Sentry Integration

Error logs are automatically captured by Sentry when configured. The logger formats errors appropriately for Sentry ingestion.

### Production Monitoring

In production, consider:
- Log aggregation (e.g., Datadog, LogRocket, CloudWatch)
- Log retention policies
- Log indexing for search
- Alerting on error patterns

## Checklist

Before committing code, ensure:

- [ ] All logs use `logger` utility (no `console.log`/`console.error`)
- [ ] Appropriate log level is used (debug/info/warn/error)
- [ ] Contextual information is included
- [ ] No sensitive data is logged
- [ ] Error objects are passed to `logger.error()`
- [ ] Authentication/authorization events are logged
- [ ] External service calls are logged
- [ ] Debug logs are used for detailed development info

## Examples

See the following files for examples:
- `lib/auth/auth.ts` - Authentication logging
- `app/api/*` - API route logging (to be implemented)
- `lib/queue/workers.ts` - Background job logging (to be implemented)
