// Serve the edited frontend while retaining the existing staging API and data.
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.pathname === "/api" || incoming.pathname.startsWith("/api/")) {
      const upstream = new URL(env.STAGING_API_ORIGIN);
      upstream.pathname = incoming.pathname;
      upstream.search = incoming.search;
      try {
        const forwarded = new Request(upstream, request);
        forwarded.headers.delete("Host");
        const response = await env.STAGING_API.fetch(forwarded, { redirect: "manual" });
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "no-store");
        const location = headers.get("Location");
        if (location) {
          const redirect = new URL(location, upstream);
          if (redirect.origin === upstream.origin) {
            headers.set("Location", `${incoming.origin}${redirect.pathname}${redirect.search}${redirect.hash}`);
          }
        }
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      } catch {
        console.error(JSON.stringify({ event: "staging_api_unavailable", path: incoming.pathname }));
        return Response.json({ error: "The staging backend is temporarily unavailable." }, { status: 502 });
      }
    }
    return env.ASSETS.fetch(request);
  }
};
