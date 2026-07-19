import { clearSessionCookie, cookieToken, revokeSession } from "../../../auth/core";

export async function POST(request: Request) {
  await revokeSession(cookieToken(request));
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie(new URL(request.url).protocol === "https:") } },
  );
}
