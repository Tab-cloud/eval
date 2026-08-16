import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, SESSION_COOKIE } from "../auth/core";
import { desktopAuthorizationSummary } from "../auth/desktop";
import { DeviceApproval } from "./DeviceApproval";
import "./style.css";

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const code = ((await searchParams).code?.trim() ?? "").slice(0, 32);
  const returnPath = `/device?code=${encodeURIComponent(code)}`;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(token);
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(returnPath)}`);
  const request = await desktopAuthorizationSummary(code);
  if (!request) return <DeviceProblem title="绑定请求已失效" detail="请返回 Eval 桌面端重新发起账号绑定。"/>;
  if (request.status !== "pending") return <DeviceProblem title="绑定请求已经处理" detail="请返回 Eval 桌面端查看当前账号状态。"/>;
  return <DeviceApproval
    userCode={code}
    deviceName={request.deviceName}
    clientVersion={request.clientVersion}
    displayName={user.displayName}
    accountIdentity={user.email ?? user.phoneE164 ?? user.username ?? user.displayName}
  />;
}

function DeviceProblem({ title, detail }: { title: string; detail: string }) {
  return <main className="device-page"><section className="device-card">
    <div className="device-brand"><span aria-hidden="true"/><strong>Eval</strong></div>
    <p className="device-kicker">DESKTOP AUTHORIZATION</p>
    <h1>{title}</h1><p>{detail}</p><a className="device-secondary" href="/console">返回 Web 控制台</a>
  </section></main>;
}
