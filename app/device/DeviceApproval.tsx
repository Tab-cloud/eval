"use client";

import { useState } from "react";

interface Props {
  userCode: string;
  deviceName: string;
  clientVersion: string;
  displayName: string;
  accountIdentity: string;
  tenantName: string;
}

export function DeviceApproval(props: Props) {
  const [state, setState] = useState<"idle" | "saving" | "approved">("idle");
  const [error, setError] = useState("");

  const approve = async () => {
    if (state !== "idle") return;
    setState("saving");
    setError("");
    try {
      const response = await fetch("/api/auth/desktop/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: props.userCode }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "设备授权失败。");
      setState("approved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "设备授权失败。");
      setState("idle");
    }
  };

  return <main className="device-page">
    <section className="device-card">
      <div className="device-brand"><span aria-hidden="true"/><strong>Eval</strong></div>
      {state === "approved" ? <>
        <div className="device-status success" aria-hidden="true"/>
        <p className="device-kicker">DEVICE CONNECTED</p>
        <h1>账号绑定成功</h1>
        <p>可以返回 Eval 桌面端，账号信息会自动完成同步。</p>
        <a className="device-secondary" href="/console">进入 Web 控制台</a>
      </> : <>
        <p className="device-kicker">DESKTOP AUTHORIZATION</p>
        <h1>绑定此 Eval 设备</h1>
        <p>确认后，这台设备将使用你的 Web 账号访问所属组织能力。本地文件权限仍由桌面端单独控制。</p>
        <dl>
          <div><dt>设备</dt><dd>{props.deviceName}</dd></div>
          <div><dt>客户端</dt><dd>Eval {props.clientVersion}</dd></div>
          <div><dt>账号</dt><dd>{props.displayName}<small>{props.accountIdentity}</small></dd></div>
          <div><dt>组织</dt><dd>{props.tenantName}</dd></div>
          <div><dt>验证码</dt><dd className="device-code">{props.userCode}</dd></div>
        </dl>
        {error && <div className="device-error" role="alert">{error}</div>}
        <button className="device-primary" onClick={() => void approve()} disabled={state === "saving"}>
          {state === "saving" ? "正在绑定…" : "确认绑定此设备"}
        </button>
        <a className="device-secondary" href="/console">取消并返回控制台</a>
      </>}
    </section>
  </main>;
}
