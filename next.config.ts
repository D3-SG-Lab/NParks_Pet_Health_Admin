import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
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
