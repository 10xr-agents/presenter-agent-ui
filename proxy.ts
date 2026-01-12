import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Routes that require authentication
// Note: Routes in (app) directory are protected by the layout
const protectedRoutes: string[] = [
  "/dashboard",
  "/screen-agents",
  "/analytics",
  "/billing",
  "/teams",
  "/settings",
  "/admin",
]

// Routes that should redirect to home if already authenticated
const authRoutes = ["/login", "/register"]

// Admin routes (require platform_admin role)
const adminRoutes = ["/admin", "/platform"]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Get the session token from cookies
  const sessionToken = request.cookies.get("better-auth.session_token")?.value
  const isAuthenticated = !!sessionToken

  // Check if the current path is a protected route
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )

  // Check if the current path is an auth route
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  // Check if the current path is an admin route
  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route))

  // Redirect unauthenticated users from protected routes to login
  if ((isProtectedRoute || isAdminRoute) && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users from auth routes
  // Note: The (app) layout will handle onboarding check and redirect accordingly
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     * - api routes (handled separately)
     */
    "/((?!_next/static|_next/image|favicon.ico|public|api).*)",
  ],
}
