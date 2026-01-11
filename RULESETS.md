# RULESETS.md

**⚠️ CRITICAL: Follow these rules when generating code to prevent build and lint errors.**

This file contains mandatory code patterns that must be followed. These rules prevent known build issues and ensure code compatibility with our tech stack.

## Quick Reference

Before generating code, check these common patterns:
- [Mongoose Operations](#mongoose-model-operations) - Always use `(Model as any).method()`
- [Zod Validation](#zod-v4-validation) - Use `.refine()` for URLs/emails, `z.record(keyType, valueType)`
- [JSON Parsing](#json-parsing) - Always type assert `await request.json()`
- [File Extensions](#jsx-in-typescript-files) - Use `.tsx` for JSX, never `.ts`
- [Lazy Initialization](#lazy-initialization) - For clients requiring env vars (Stripe, Redis, etc.)
- [Error Handling](#error-handling) - Type errors as `unknown` in catch blocks

---

## 1. Next.js 16 Middleware

**Rule**: Always use `proxy.ts`, never `middleware.ts`

Next.js 16 deprecated `middleware.ts` in favor of `proxy.ts`.

```typescript
// ❌ WRONG
// middleware.ts
export function middleware() { ... }

// ✅ CORRECT
// proxy.ts
export function proxy() { ... }
```

**When to apply**: Creating or modifying middleware/routing logic in Next.js 16+

---

## 2. Mongoose Model Operations

**Rule**: Always use `(Model as any).method()` pattern for Mongoose operations

TypeScript cannot infer Mongoose model method signatures correctly.

```typescript
// ❌ WRONG
const notification = await Notification.create({ ... })
const user = await User.findOne({ email })
const count = await Post.countDocuments({ published: true })

// ✅ CORRECT
const notification = await (Notification as any).create({ ... })
const user = await (User as any).findOne({ email })
const count = await (Post as any).countDocuments({ published: true })
```

**Apply to these methods**: `create()`, `find()`, `findOne()`, `findById()`, `findOneAndUpdate()`, `findByIdAndUpdate()`, `countDocuments()`, `deleteOne()`, `deleteMany()`, `updateOne()`, `updateMany()`

**When to apply**: Any Mongoose model operation

---

## 3. Zod v4 Validation

**Rule**: Use `.refine()` for URL/email validation, specify key type for `z.record()`

Zod v4 changed API signatures - `.url()` and `.email()` are not available on strings, and `z.record()` requires key type.

### URL Validation

```typescript
// ❌ WRONG
link: z.string().url().optional()

// ✅ CORRECT
link: z.string().refine(
  (val) => {
    if (!val) return true
    try {
      new URL(val)
      return true
    } catch {
      return false
    }
  },
  { message: "Invalid URL format" }
).optional()
```

### Email Validation

```typescript
// ❌ WRONG
EMAIL_FROM: z.string().email().optional()

// ✅ CORRECT
EMAIL_FROM: z.string().refine(
  (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
  "Invalid email"
).optional()
```

### Record Type

```typescript
// ❌ WRONG
metadata: z.record(z.any()).optional()

// ✅ CORRECT
metadata: z.record(z.string(), z.any()).optional()
```

**When to apply**: All Zod validation schemas (env.mjs, API validation, forms)

---

## 4. JSON Parsing

**Rule**: Always type assert `await request.json()` and `await response.json()`

JSON parsing returns `unknown` type, requiring explicit type assertions.

```typescript
// ❌ WRONG
const body = await request.json()
const { messages, task } = body // Error: Property doesn't exist on unknown

// ✅ CORRECT
const body = (await request.json()) as {
  messages?: AgentMessage[]
  task?: string
  organizationId?: string
}
const { messages, task } = body // Works correctly
```

**When to apply**: All API routes (`app/api/**/route.ts`), fetch calls, response handlers

---

## 5. Better Auth Import Paths

**Rule**: Use `better-auth/client/plugins` for client-side plugins

```typescript
// ❌ WRONG
import { organizationClient } from "better-auth/react/plugins"

// ✅ CORRECT
import { organizationClient } from "better-auth/client/plugins"
```

**When to apply**: Importing Better Auth plugins in client components

---

## 6. JSX in TypeScript Files

**Rule**: Always use `.tsx` extension for files containing JSX

```typescript
// ❌ WRONG
// MyComponent.ts
export function MyComponent() {
  return <div>Hello</div>
}

// ✅ CORRECT
// MyComponent.tsx
export function MyComponent() {
  return <div>Hello</div>
}
```

**When to apply**: Any file containing JSX syntax (components, pages, layouts)

---

## 7. Mongoose Document Property Conflicts

**Rule**: Use `Omit<mongoose.Document, "conflictingProperty">` when interface properties conflict

```typescript
// ❌ WRONG
export interface ICost extends mongoose.Document {
  model: string // Conflicts with Document.model
}

// ✅ CORRECT
export interface ICost extends Omit<mongoose.Document, "model"> {
  model: string // Now safe
}
```

**When to apply**: Defining Mongoose document interfaces with properties that conflict with Document interface (e.g., `model`, `constructor`, `save`, etc.)

---

## 8. NextRequest IP Address

**Rule**: Extract IP from headers, never use `req.ip`

Next.js 16 `NextRequest` doesn't have `.ip` property.

```typescript
// ❌ WRONG
const ip = req.ip

// ✅ CORRECT
const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || 
           req.headers.get("x-real-ip") || 
           "anonymous"
```

**When to apply**: Any code accessing client IP from NextRequest

---

## 9. Stripe API Version

**Rule**: Use API version `"2025-02-24.acacia"` for Stripe

```typescript
// ✅ CORRECT
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
})
```

**When to apply**: Initializing Stripe client

---

## 10. Missing Type Declarations

**Rule**: Create `.d.ts` files for libraries without TypeScript types

```typescript
// js-yaml.d.ts
declare module "js-yaml" {
  export function load<T = any>(str: string, options?: any): T
  export function dump(obj: any, options?: any): string
  export function safeLoad<T = any>(str: string, options?: any): T
  export function safeDump(obj: any, options?: any): string
  const yaml: {
    load: typeof load
    dump: typeof dump
    safeLoad: typeof safeLoad
    safeDump: typeof safeDump
  }
  export default yaml
}
```

**When to apply**: Using third-party libraries without @types packages

---

## 11. Reduce Function Type Annotations

**Rule**: Always type reduce callback parameters explicitly

```typescript
// ❌ WRONG
const total = items.reduce((sum, item) => sum + item.value, 0)

// ✅ CORRECT
const total = items.reduce((sum: number, item: any) => sum + item.value, 0)
```

**When to apply**: Any reduce callback function

---

## 12. Better Auth Secret During Build

**Rule**: Provide fallback secret for build (development only)

```typescript
// ✅ CORRECT - Allow build without env vars
secret: process.env.BETTER_AUTH_SECRET || "development-secret-change-in-production-min-32-chars",
```

**When to apply**: Better Auth configuration that might be evaluated during build

---

## 13. Template Interface Mismatch

**Rule**: Use type assertions for additional Mongoose model properties

```typescript
// ✅ CORRECT - Use type assertion for additional properties
return (Template as any).create({
  ...data,
  featured: false as any,
  usageCount: 0 as any,
})
```

**When to apply**: Creating documents with properties not in function signature but required by model

---

## 14. Lazy Initialization

**Rule**: Use lazy initialization for third-party clients requiring environment variables

Clients like Stripe, Redis, and other services should not be initialized at module load time to allow builds without env vars.

### Stripe Client Pattern

```typescript
// ❌ WRONG - Fails during build if env var missing
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set")
}
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
})

// ✅ CORRECT - Lazy initialization
let stripeInstance: Stripe | null = null

function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set")
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    })
  }
  return stripeInstance
}

// Export as Proxy for backward compatibility
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripe()[prop as keyof Stripe]
  },
})

// Use getStripe() in functions
export async function createCheckoutSession(...) {
  const stripe = getStripe()
  return stripe.checkout.sessions.create(...)
}
```

### Redis Connection Pattern

```typescript
// ✅ CORRECT - Lazy initialization with lazyConnect
let redisInstance: Redis | null = null

function getRedisUrl(): string {
  return process.env.REDIS_URL || "redis://localhost:6379"
}

export function getRedis(): Redis {
  if (!redisInstance) {
    const url = getRedisUrl()
    redisInstance = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true, // Don't connect during build
    })
  }
  return redisInstance
}
```

**When to apply**: Any client/library that requires environment variables and might be imported during build

---

## 15. Mongoose Duplicate Index Warnings

**Rule**: Use only one indexing method - either `index: true` OR `Schema.index()`, not both

**IMPORTANT**: `unique: true` automatically creates an index! Do NOT add `Schema.index()` for fields with `unique: true`.

**Prefer `Schema.index()` over `index: true`** for better readability and flexibility (especially for composite indexes).

```typescript
// ❌ WRONG - Duplicate index definition (index: true + Schema.index())
const Schema = new Schema({
  organizationId: { type: String, required: true, index: true }, // Index defined here
  invoiceId: { type: String, index: true }, // Index defined here
})
Schema.index({ organizationId: 1 }) // And here - causes duplicate warning
Schema.index({ invoiceId: 1 }) // And here - causes duplicate warning

// ❌ WRONG - unique: true creates index, Schema.index() creates duplicate
const Schema = new Schema({
  shareableToken: { type: String, required: true, unique: true }, // unique: true creates index automatically
})
Schema.index({ shareableToken: 1 }) // DUPLICATE! unique: true already created the index

// ✅ CORRECT - Use only Schema.index() method
const Schema = new Schema({
  organizationId: { type: String, required: true }, // No index here
  invoiceId: { type: String }, // No index here
})
Schema.index({ organizationId: 1 }) // Only here
Schema.index({ invoiceId: 1 }) // Only here

// ✅ CORRECT - unique: true (no Schema.index() needed)
const Schema = new Schema({
  shareableToken: { type: String, required: true, unique: true }, // unique: true creates index automatically
  organizationId: { type: String, required: true, unique: true }, // unique: true creates index automatically
})
// No Schema.index() calls needed for unique fields

// ✅ CORRECT - Composite indexes (must use Schema.index())
const Schema = new Schema({
  organizationId: { type: String, required: true }, // No index: true
})
Schema.index({ organizationId: 1, status: 1 }) // Composite index
Schema.index({ organizationId: 1, createdAt: -1 }) // Another composite index starting with organizationId
```

**Note**: 
- `unique: true` automatically creates an index - do NOT add `Schema.index()` for the same field
- Composite indexes (indexes on multiple fields) can efficiently serve queries on their prefix fields. For example, an index on `{ organizationId: 1, status: 1 }` can also be used for queries on just `organizationId`, so you don't need a separate single-field index.

**When to apply**: Defining Mongoose schemas with indexes

---

## 16. Error Handling in Catch Blocks

**Rule**: Type catch block errors as `unknown` and check type before accessing properties

```typescript
// ❌ WRONG
try {
  await someOperation()
} catch (error) {
  console.error(error.message) // Error: Property 'message' doesn't exist on unknown
}

// ✅ CORRECT
try {
  await someOperation()
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
}
```

**When to apply**: All catch blocks in TypeScript files

---

## 17. BullMQ Queue Types

**Rule**: Use type assertions for Queue constructors and Redis connections

BullMQ v5 has complex type inference. Use type assertions for compatibility.

```typescript
// ✅ CORRECT - Queue creation
let emailQueue: Queue<EmailJobData> | null = null

export function getEmailQueue(): Queue<EmailJobData> {
  if (!emailQueue) {
    emailQueue = new Queue(QUEUE_NAMES.EMAIL, {
      connection: getRedis() as any, // Type assertion for Redis connection
      ...defaultQueueOptions,
    }) as Queue<EmailJobData>
  }
  return emailQueue
}

// ✅ CORRECT - Worker creation
const emailWorker = new Worker(QUEUE_NAMES.EMAIL, processEmailJob, {
  connection: createRedisConnection() as any, // Type assertion for Redis connection
  concurrency: 5,
})
```

**When to apply**: Creating BullMQ Queue and Worker instances

---

## Build Checklist

Before committing code, verify:

- [ ] No `middleware.ts` file exists (use `proxy.ts`)
- [ ] All Mongoose model calls use `(Model as any).method()` pattern
- [ ] All `request.json()` and `response.json()` have type assertions
- [ ] All Zod validations use v4-compatible syntax (`.refine()` for URLs/emails, `z.record(keyType, valueType)`)
- [ ] No JSX in `.ts` files (use `.tsx`)
- [ ] Better Auth imports use correct paths (`better-auth/client/plugins`)
- [ ] IP addresses extracted from headers, not `req.ip`
- [ ] Reduce callbacks have explicit type annotations
- [ ] Third-party clients (Stripe, Redis, etc.) use lazy initialization
- [ ] No duplicate Mongoose index definitions
- [ ] Catch blocks type errors as `unknown`
- [ ] BullMQ connections use type assertions

---

## Additional Notes

- These rules are derived from actual build issues encountered in this codebase
- Rules are prioritized to prevent the most common build failures
- When in doubt, follow the patterns shown in existing code
- For detailed explanations of why these rules exist, see the git history and build logs
