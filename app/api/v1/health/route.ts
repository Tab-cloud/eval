export async function GET() {
  return Response.json({ status: "ok", service: "luban-ai-gateway", version: "0.1.0", timestamp: new Date().toISOString() });
}
