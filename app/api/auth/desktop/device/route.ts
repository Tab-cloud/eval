import {
  createDesktopAuthorization,
  DesktopAuthorizationError,
} from "../../../../auth/desktop";

export async function POST(request: Request) {
  let payload: { deviceName?: unknown; clientVersion?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求格式无效。", code: "invalid_request" }, { status: 400 });
  }
  try {
    return Response.json(await createDesktopAuthorization(request, payload), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return authorizationError(error);
  }
}

function authorizationError(error: unknown) {
  if (error instanceof DesktopAuthorizationError) {
    return Response.json({ error: error.message, code: error.code }, {
      status: error.status,
      headers: error.status === 429 ? { "Retry-After": "3600" } : undefined,
    });
  }
  throw error;
}
