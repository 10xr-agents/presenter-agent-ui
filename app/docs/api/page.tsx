"use client"

import dynamic from "next/dynamic"
import "swagger-ui-react/swagger-ui.css"

// Dynamically import SwaggerUI to avoid SSR issues
const SwaggerUI = dynamic(() => import("swagger-ui-react"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-muted-foreground">Loading API documentation...</div>
    </div>
  ),
})

export default function ApiDocsPage() {
  return (
    <div className="swagger-wrapper">
      <SwaggerUI
        url="/api/docs"
        docExpansion="list"
        defaultModelsExpandDepth={1}
        persistAuthorization={true}
        tryItOutEnabled={true}
      />
      <style jsx global>{`
        /* Custom styling to match the design system */
        .swagger-wrapper {
          min-height: 100vh;
          background: hsl(var(--background));
        }

        .swagger-ui {
          font-family: inherit;
        }

        .swagger-ui .topbar {
          display: none;
        }

        .swagger-ui .info {
          margin: 24px 0;
        }

        .swagger-ui .info .title {
          font-size: 1.5rem;
          font-weight: 600;
          color: hsl(var(--foreground));
        }

        .swagger-ui .info .description {
          font-size: 0.875rem;
          color: hsl(var(--foreground));
        }

        .swagger-ui .info .description p {
          margin-bottom: 1rem;
        }

        .swagger-ui .info .description code {
          background: hsl(var(--muted));
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.8125rem;
        }

        .swagger-ui .info .description pre {
          background: hsl(var(--muted));
          border-radius: 0.5rem;
          padding: 1rem;
          overflow-x: auto;
        }

        .swagger-ui .opblock-tag {
          font-size: 0.875rem;
          font-weight: 600;
          color: hsl(var(--foreground));
          border-bottom: 1px solid hsl(var(--border));
        }

        .swagger-ui .opblock {
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--border));
          margin-bottom: 0.75rem;
          box-shadow: none;
        }

        .swagger-ui .opblock .opblock-summary {
          border: none;
          padding: 0.75rem 1rem;
        }

        .swagger-ui .opblock .opblock-summary-method {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.375rem 0.5rem;
          border-radius: 0.25rem;
          min-width: 60px;
        }

        .swagger-ui .opblock .opblock-summary-path {
          font-size: 0.875rem;
          font-weight: 500;
        }

        .swagger-ui .opblock .opblock-summary-description {
          font-size: 0.8125rem;
          color: hsl(var(--muted-foreground));
        }

        .swagger-ui .opblock.opblock-get {
          background: hsl(var(--muted) / 0.3);
          border-color: hsl(210 100% 50% / 0.3);
        }

        .swagger-ui .opblock.opblock-get .opblock-summary-method {
          background: hsl(210 100% 50%);
        }

        .swagger-ui .opblock.opblock-post {
          background: hsl(var(--muted) / 0.3);
          border-color: hsl(142 76% 36% / 0.3);
        }

        .swagger-ui .opblock.opblock-post .opblock-summary-method {
          background: hsl(142 76% 36%);
        }

        .swagger-ui .opblock.opblock-put {
          background: hsl(var(--muted) / 0.3);
          border-color: hsl(38 92% 50% / 0.3);
        }

        .swagger-ui .opblock.opblock-put .opblock-summary-method {
          background: hsl(38 92% 50%);
        }

        .swagger-ui .opblock.opblock-patch {
          background: hsl(var(--muted) / 0.3);
          border-color: hsl(38 92% 50% / 0.3);
        }

        .swagger-ui .opblock.opblock-patch .opblock-summary-method {
          background: hsl(38 92% 50%);
        }

        .swagger-ui .opblock.opblock-delete {
          background: hsl(var(--muted) / 0.3);
          border-color: hsl(0 84% 60% / 0.3);
        }

        .swagger-ui .opblock.opblock-delete .opblock-summary-method {
          background: hsl(0 84% 60%);
        }

        .swagger-ui .opblock-body {
          padding: 1rem;
        }

        .swagger-ui .opblock-section-header {
          background: transparent;
          padding: 0.5rem 0;
        }

        .swagger-ui .opblock-section-header h4 {
          font-size: 0.8125rem;
          font-weight: 600;
          color: hsl(var(--foreground));
        }

        .swagger-ui .parameters-col_description {
          font-size: 0.8125rem;
        }

        .swagger-ui .parameter__name {
          font-size: 0.8125rem;
          font-weight: 500;
        }

        .swagger-ui .parameter__type {
          font-size: 0.75rem;
          color: hsl(var(--muted-foreground));
        }

        .swagger-ui .parameter__in {
          font-size: 0.6875rem;
          color: hsl(var(--muted-foreground));
        }

        .swagger-ui table tbody tr td {
          font-size: 0.8125rem;
          padding: 0.5rem;
          border-color: hsl(var(--border));
        }

        .swagger-ui table thead tr th {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.5rem;
          border-color: hsl(var(--border));
          color: hsl(var(--muted-foreground));
        }

        .swagger-ui .btn {
          font-size: 0.8125rem;
          font-weight: 500;
          border-radius: 0.375rem;
          padding: 0.5rem 1rem;
        }

        .swagger-ui .btn.execute {
          background: hsl(var(--primary));
          border-color: hsl(var(--primary));
        }

        .swagger-ui .btn.execute:hover {
          background: hsl(var(--primary) / 0.9);
        }

        .swagger-ui .btn.cancel {
          background: transparent;
          border-color: hsl(var(--border));
          color: hsl(var(--foreground));
        }

        .swagger-ui .model-box {
          background: hsl(var(--muted) / 0.3);
          border-radius: 0.5rem;
        }

        .swagger-ui .model {
          font-size: 0.8125rem;
        }

        .swagger-ui .model-title {
          font-size: 0.875rem;
          font-weight: 600;
        }

        .swagger-ui .responses-inner {
          padding: 1rem;
        }

        .swagger-ui .responses-table {
          font-size: 0.8125rem;
        }

        .swagger-ui .response-col_status {
          font-weight: 600;
        }

        .swagger-ui select {
          font-size: 0.8125rem;
          border-radius: 0.375rem;
          border-color: hsl(var(--border));
          background: hsl(var(--background));
        }

        .swagger-ui input[type="text"],
        .swagger-ui textarea {
          font-size: 0.8125rem;
          border-radius: 0.375rem;
          border-color: hsl(var(--border));
          background: hsl(var(--background));
        }

        .swagger-ui .highlight-code {
          border-radius: 0.5rem;
        }

        .swagger-ui .microlight {
          font-size: 0.75rem;
          background: hsl(var(--muted)) !important;
          border-radius: 0.375rem;
        }

        .swagger-ui .authorize {
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          font-size: 0.8125rem;
        }

        .swagger-ui .auth-wrapper {
          padding: 1rem;
        }

        .swagger-ui .auth-container {
          padding: 1rem;
          border-radius: 0.5rem;
        }

        .swagger-ui .scheme-container {
          background: hsl(var(--muted) / 0.3);
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
        }

        .swagger-ui .loading-container {
          padding: 2rem;
        }

        .swagger-ui .loading-container .loading:after {
          border-color: hsl(var(--primary)) transparent;
        }

        /* Dark mode adjustments */
        .dark .swagger-ui {
          color: hsl(var(--foreground));
        }

        .dark .swagger-ui .info .title,
        .dark .swagger-ui .opblock-tag {
          color: hsl(var(--foreground));
        }

        .dark .swagger-ui .opblock-section-header h4 {
          color: hsl(var(--foreground));
        }

        .dark .swagger-ui table thead tr th,
        .dark .swagger-ui table tbody tr td {
          color: hsl(var(--foreground));
        }

        .dark .swagger-ui .parameter__name,
        .dark .swagger-ui .parameter__type {
          color: hsl(var(--foreground));
        }

        .dark .swagger-ui .model-title {
          color: hsl(var(--foreground));
        }

        .dark .swagger-ui a {
          color: hsl(var(--primary));
        }

        .dark .swagger-ui .response-col_description__inner {
          color: hsl(var(--foreground));
        }
      `}</style>
    </div>
  )
}
