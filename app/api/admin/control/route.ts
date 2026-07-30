import { isAdminError, requireAdminRequest } from "../../../auth/admin";
import { adminSnapshot, executeAdminAction } from "../../../admin/store";
import { rejectCrossSiteWrite } from "../../../security/request";

export async function GET(request: Request) {
  const user = await requireAdminRequest(request);
  if (isAdminError(user)) return user;
  return Response.json(await adminSnapshot(user));
}

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await requireAdminRequest(request);
  if (isAdminError(user)) return user;
  let payload: { action?: unknown; input?: unknown };
  try { payload = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  if (typeof payload.action !== "string" || !payload.input || typeof payload.input !== "object") return Response.json({ error: "缺少操作参数。" }, { status: 400 });
  try {
    const result = await executeAdminAction(user, payload.action, payload.input as Record<string, unknown>);
    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败。";
    const status = /UNIQUE constraint failed: users.email/.test(message) ? 409 : 400;
    return Response.json({ error: status === 409 ? "该邮箱已经存在。" : message }, { status });
  }
}
