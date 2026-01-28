#!/usr/bin/env npx tsx
/**
 * Real-time WebSocket server (Sockudo) for local dev
 *
 * Starts Sockudo (Rust, Pusher-compatible) on port 3005 via Docker.
 * Loads SOCKUDO_APP_* from .env.local so Sockudo registers the same app as Next.js.
 * Run in a separate terminal alongside `pnpm dev`.
 *
 * Prerequisites:
 *   - Docker installed and running
 *   - .env.local with SOCKUDO_APP_ID, SOCKUDO_APP_KEY, SOCKUDO_APP_SECRET (see .env.example)
 *
 * Usage:
 *   pnpm sockudo:dev
 *   npx tsx scripts/sockudo-dev.ts
 */

import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(__dirname, "..")

function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {}
  if (!existsSync(filePath)) return env
  const content = readFileSync(filePath, "utf-8")
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

// Load .env.local only if present; otherwise use process.env and defaults below
const envLocal = loadEnvFile(path.join(ROOT, ".env.local"))

const env = {
  ...process.env,
  SOCKUDO_APP_ID: envLocal.SOCKUDO_APP_ID ?? process.env.SOCKUDO_APP_ID ?? "app-id",
  SOCKUDO_APP_KEY: envLocal.SOCKUDO_APP_KEY ?? process.env.SOCKUDO_APP_KEY ?? "app-key",
  SOCKUDO_APP_SECRET: envLocal.SOCKUDO_APP_SECRET ?? process.env.SOCKUDO_APP_SECRET ?? "app-secret",
}

console.log("Starting Sockudo (port 3005) via Docker...")
console.log("Stop with Ctrl+C. Requires Docker.\n")

const child = spawn("docker", ["compose", "up", "sockudo"], {
  env,
  stdio: "inherit",
  cwd: ROOT,
})

child.on("error", (err: unknown) => {
  console.error("Docker failed (is Docker running?):", err)
  process.exit(1)
})

child.on("exit", (code, signal) => {
  if (code != null && code !== 0) process.exit(code)
  if (signal) process.exit(1)
})
