"use client"

import { Suspense } from "react"
import { LoginForm } from "./login-form"

export function LoginFormWrapper() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}
