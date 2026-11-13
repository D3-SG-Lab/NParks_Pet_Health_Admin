import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // A separate output folder lets the API-mode e2e build (.next-api) sit next to the normal one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  // The browser calls the same-origin /backend path; src/app/backend/[...path]/route.ts
  // forwards it to the API (which sends no CORS headers) and follows redirects server-side.
  partialPrefetching: true,
  experimental: {
    instantInsights: {
      // The workbench is rendered on the client only: the session and the mock
      // data layer live in the browser, so the server can never render the
      // pages and the default dev-only check reports every route as "dropped
      // from rendering". Validate only segments that opt in with `instant`.
      // Revisit once the real API and server-side sessions exist.
      validationLevel: "manual-warning",
    },
  },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
