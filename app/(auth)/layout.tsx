import Link from "next/link"
import { APP_NAME } from "@/lib/utils/constants"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div>
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-2xl font-bold">{APP_NAME}</span>
            </Link>
          </div>

          <div className="space-y-6">
            <blockquote className="text-xl font-medium leading-relaxed">
              &ldquo;Create intelligent, conversational screen presentations that
              respond to viewer questions in real-time while demonstrating live websites.&rdquo;
            </blockquote>
            <div className="flex items-center space-x-4">
              <div className="h-px flex-1 bg-white/30" />
              <span className="text-sm text-white/70">
                Interactive AI-powered presentations
              </span>
              <div className="h-px flex-1 bg-white/30" />
            </div>
          </div>

          <div className="text-sm text-white/60">
            &copy; {new Date().getFullYear()} {APP_NAME}. MIT License.
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/5 rounded-full" />
      </div>

      {/* Right side - Auth forms */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden text-center">
            <Link href="/" className="inline-flex items-center space-x-2">
              <span className="text-2xl font-bold text-brand-gradient">
                {APP_NAME}
              </span>
            </Link>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}
