export function rejectCrossSiteWrite(request: Request): Response | null {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return null;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return Response.json({ error: "跨站写入请求已被拒绝。" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return Response.json({ error: "请求来源无效。" }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "请求来源无效。" }, { status: 403 });
    }
  }
  return null;
}
