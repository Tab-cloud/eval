import { postgresDatabase } from "../../../../db/postgres";

export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    await postgresDatabase().prepare("SELECT 1 AS ok").first();
    return Response.json(
      { status: "ok", service: "eval-agent-web", database: "postgresql", version: "0.2.0", timestamp },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable", service: "eval-agent-web", database: "unreachable", version: "0.2.0", timestamp },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
