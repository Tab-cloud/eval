import {
  DesktopAuthorizationError,
  exchangeDesktopAuthorization,
} from "../../../../auth/desktop";

export async function POST(request: Request) {
  let payload: { deviceCode?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求格式无效。", code: "invalid_request" }, { status: 400 });
  }
  try {
    const deviceCode = typeof payload.deviceCode === "string" ? payload.deviceCode : "";
    return Response.json(await exchangeDesktopAuthorization(deviceCode), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DesktopAuthorizationError) {
      return Response.json({ error: error.message, code: error.code }, {
        status: error.status,
        headers: error.code === "authorization_pending" ? { "Retry-After": "2" } : undefined,
      });
    }
    throw error;
  }
}
