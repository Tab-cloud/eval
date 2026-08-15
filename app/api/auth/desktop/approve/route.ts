import { cookieToken, getSessionUser } from "../../../../auth/core";
import {
  approveDesktopAuthorization,
  DesktopAuthorizationError,
} from "../../../../auth/desktop";
import { rejectCrossSiteWrite } from "../../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "请先登录 Web 账号。" }, { status: 401 });
  let payload: { userCode?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求格式无效。" }, { status: 400 });
  }
  try {
    const userCode = typeof payload.userCode === "string" ? payload.userCode : "";
    return Response.json(await approveDesktopAuthorization(userCode, user));
  } catch (error) {
    if (error instanceof DesktopAuthorizationError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
