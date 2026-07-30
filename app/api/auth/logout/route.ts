import { clearSessionCookie, cookieToken, revokeSession } from "../../../auth/core";
import { rejectCrossSiteWrite } from "../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  await revokeSession(cookieToken(request));
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie(new URL(request.url).protocol === "https:") } },
  );
}
