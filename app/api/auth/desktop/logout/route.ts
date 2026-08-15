import { bearerToken, revokeDesktopSession } from "../../../../auth/desktop";

export async function POST(request: Request) {
  await revokeDesktopSession(bearerToken(request));
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
