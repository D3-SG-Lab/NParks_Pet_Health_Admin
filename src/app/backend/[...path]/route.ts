/**
 * Same-origin proxy to the NParksPetHealth API: /backend/<path> → <API_BASE_URL>/<path>.
 *
 * The API sends no CORS headers, so the browser must never talk to it directly.
 * A plain Next.js rewrite passes upstream redirects (e.g. http → https) back to
 * the browser, which then follows them cross-origin and fails with a CORS error.
 * Fetching on the server follows redirects here instead.
 */
import type { NextRequest } from "next/server"

import { API_BASE_URL } from "@/services/api/config"

const FORWARD_REQUEST_HEADERS = ["authorization", "content-type", "accept", "accept-language"]
const DROP_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  if (!API_BASE_URL) {
    return Response.json({ error: "API_NOT_CONFIGURED", message: "NEXT_PUBLIC_API_BASE_URL is not set." }, { status: 501 })
  }
  const { path } = await ctx.params
  const target = `${API_BASE_URL}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`

  const headers = new Headers()
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  const hasBody = !["GET", "HEAD"].includes(req.method)

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "follow",
      cache: "no-store",
    })
  } catch (e) {
    return Response.json(
      {
        error: "BAD_GATEWAY",
        message: `The API at ${API_BASE_URL} couldn’t be reached (${e instanceof Error ? e.message : "network error"}).`,
      },
      { status: 502 }
    )
  }

  const out = new Headers(upstream.headers)
  for (const name of DROP_RESPONSE_HEADERS) out.delete(name)
  const body = [204, 304].includes(upstream.status) || req.method === "HEAD" ? null : await upstream.arrayBuffer()
  return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: out })
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD }
