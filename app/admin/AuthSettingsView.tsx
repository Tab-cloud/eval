"use client";

import { Icon } from "../ui/icons";

export type AuthSettingsSnapshot = {
  callbackUrl: string;
  smsEnabled: boolean;
  aliyunSignName: string;
  aliyunTemplateCode: string;
  aliyunTemplateCodeKey: string;
  aliyunAccessKeyIdConfigured: boolean;
  aliyunAccessKeySecretConfigured: boolean;
  smsCodePepperConfigured: boolean;
  googleEnabled: boolean;
  googleClientIdConfigured: boolean;
  googleClientSecretConfigured: boolean;
  googleAllowedHostedDomain: string;
  githubEnabled: boolean;
  githubClientIdConfigured: boolean;
  githubClientSecretConfigured: boolean;
  githubCallbackUrl: string;
  smsCredentials: { accessKeyId: boolean; accessKeySecret: boolean; pepper: boolean };
  smsConfigured: boolean;
  googleConfigured: boolean;
  githubConfigured: boolean;
  updatedAt: number | null;
};

type Props = {
  settings: AuthSettingsSnapshot;
  busy: boolean;
  action: (name: string, input: Record<string, unknown>, success: string) => Promise<void>;
};

export function AuthSettingsView({ settings, busy, action }: Props) {
  const save = (form: HTMLFormElement) => {
    const data = new FormData(form);
    void action("save_auth_settings", {
      ...Object.fromEntries(data),
      smsEnabled: data.get("smsEnabled") === "on",
      googleEnabled: data.get("googleEnabled") === "on",
      githubEnabled: data.get("githubEnabled") === "on",
    }, "登录与身份配置已保存。").finally(() => {
      form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = ""; });
    });
  };

  return <div className="admin-module auth-settings-view">
    <section className="auth-provider-overview">
      <ProviderStatus
        label="ALIBABA CLOUD / SMS"
        title="中文手机号登录"
        enabled={settings.smsEnabled}
        configured={settings.smsConfigured}
        detail={settings.smsConfigured ? "短信凭据、签名和模板均已就绪" : "仍有短信凭据或元数据缺失"}
      />
      <ProviderStatus
        label="GOOGLE / OPENID CONNECT"
        title="英文 Google 登录"
        enabled={settings.googleEnabled}
        configured={settings.googleConfigured}
        detail={settings.googleConfigured ? "OAuth 客户端凭据已保存" : "Client ID 或 Client Secret 尚未配置"}
      />
      <ProviderStatus
        label="GITHUB / OAUTH 2.0"
        title="中英文 GitHub 登录"
        enabled={settings.githubEnabled}
        configured={settings.githubConfigured}
        detail={settings.githubConfigured ? "OAuth App 凭据已保存" : "GitHub Client ID 或 Client Secret 尚未配置"}
      />
      <article className="auth-provider-scope">
        <span>ACCOUNT SYSTEM</span>
        <strong>单站点账号</strong>
        <p>手机号、账号密码、Google 与 GitHub 均绑定到同一个 Eval 用户。</p>
      </article>
    </section>

    <form key={settings.updatedAt ?? "defaults"} className="auth-settings-form" onSubmit={event => {
      event.preventDefault();
      save(event.currentTarget);
    }}>
      <ProviderForm title="阿里云短信" eyebrow="01 / PHONE AUTH" icon="key">
        <label className="auth-provider-toggle"><input name="smsEnabled" type="checkbox" defaultChecked={settings.smsEnabled}/><span>启用中文手机号验证码登录</span></label>
        <div className="auth-field-grid">
          <Field label="短信签名名称"><input name="aliyunSignName" defaultValue={settings.aliyunSignName} placeholder="已通过阿里云审核的签名"/></Field>
          <Field label="短信模板代码"><input name="aliyunTemplateCode" defaultValue={settings.aliyunTemplateCode} placeholder="SMS_123456789"/></Field>
          <Field label="模板验证码变量"><input name="aliyunTemplateCodeKey" defaultValue={settings.aliyunTemplateCodeKey} pattern="[A-Za-z][A-Za-z0-9_]{0,31}" required/></Field>
          <ProtectedValueField label="AccessKey ID" name="aliyunAccessKeyId" configured={settings.aliyunAccessKeyIdConfigured} placeholder="只填写 LTAI... 的真实 ID" pattern="[A-Za-z0-9]{16,128}"/>
          <ProtectedValueField label="AccessKey Secret" name="aliyunAccessKeySecret" configured={settings.aliyunAccessKeySecretConfigured} placeholder="填写真实 AccessKey Secret"/>
          <ProtectedValueField label="验证码 Pepper" name="smsCodePepper" configured={settings.smsCodePepperConfigured} placeholder="填写至少 32 位随机值" minLength={32}/>
        </div>
      </ProviderForm>

      <ProviderForm title="Google 登录" eyebrow="02 / OIDC" icon="shield">
        <label className="auth-provider-toggle"><input name="googleEnabled" type="checkbox" defaultChecked={settings.googleEnabled}/><span>启用英文界面的 Google 邮箱登录</span></label>
        <div className="auth-field-grid">
          <ProtectedValueField label="OAuth Client ID" name="googleClientId" configured={settings.googleClientIdConfigured} placeholder="直接填写 Google OAuth Web Client ID"/>
          <ProtectedValueField label="OAuth Client Secret" name="googleClientSecret" configured={settings.googleClientSecretConfigured} placeholder="直接填写 Google OAuth Client Secret"/>
          <Field label="允许的 Workspace 域（可选）"><input name="googleAllowedHostedDomain" defaultValue={settings.googleAllowedHostedDomain} placeholder="company.com"/></Field>
          <div className="auth-callback-field">
            <span>授权回调地址</span>
            <code>{settings.callbackUrl}</code>
            <small>必须与 Google Cloud Console 中的 Authorized redirect URI 完全一致</small>
          </div>
        </div>
      </ProviderForm>

      <ProviderForm title="GitHub 登录" eyebrow="03 / OAUTH 2.0" icon="terminal">
        <label className="auth-provider-toggle"><input name="githubEnabled" type="checkbox" defaultChecked={settings.githubEnabled}/><span>启用中英文界面的 GitHub 账号登录</span></label>
        <div className="auth-field-grid">
          <ProtectedValueField label="OAuth Client ID" name="githubClientId" configured={settings.githubClientIdConfigured} placeholder="直接填写 GitHub OAuth App 的 Client ID"/>
          <ProtectedValueField label="OAuth Client Secret" name="githubClientSecret" configured={settings.githubClientSecretConfigured} placeholder="直接填写 GitHub OAuth App 的 Client Secret"/>
          <div className="auth-callback-field">
            <span>授权回调地址</span>
            <code>{settings.githubCallbackUrl}</code>
            <small>必须与 GitHub OAuth App 中的 Authorization callback URL 完全一致</small>
          </div>
          <div className="auth-callback-field">
            <span>最小授权范围</span>
            <code>user:email</code>
            <small>仅用于读取当前 GitHub 账号的已验证邮箱；不申请仓库或代码权限</small>
          </div>
        </div>
      </ProviderForm>

      <section className="auth-secret-policy">
        <div><Icon name="shield"/><span><b>凭据隔离</b><small>短信、Google 与 GitHub 凭据保存后均不回显、不写入审计日志；AccessKey Secret、Pepper 和两项 OAuth Client Secret 使用 AES-256-GCM 加密存储。</small></span></div>
        <button disabled={busy} type="submit">{busy ? "正在保存…" : "保存登录配置"}<Icon name="arrow"/></button>
      </section>
    </form>
  </div>;
}

function ProviderStatus({ label, title, enabled, configured, detail }: { label: string; title: string; enabled: boolean; configured: boolean; detail: string }) {
  const state = !enabled ? "disabled" : configured ? "ready" : "incomplete";
  return <article className={`auth-provider-status ${state}`}>
    <span>{label}</span>
    <div><i/><small>{!enabled ? "DISABLED" : configured ? "READY" : "INCOMPLETE"}</small></div>
    <h3>{title}</h3>
    <p>{detail}</p>
  </article>;
}

function ProviderForm({ title, eyebrow, icon, children }: { title: string; eyebrow: string; icon: "key" | "shield" | "terminal"; children: React.ReactNode }) {
  return <section className="auth-provider-form">
    <header><div><Icon name={icon}/><span>{eyebrow}</span></div><h2>{title}</h2></header>
    {children}
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="auth-field"><span>{label}</span>{children}</label>;
}

function ProtectedValueField({ label, name, configured, placeholder, minLength, pattern }: { label: string; name: string; configured: boolean; placeholder: string; minLength?: number; pattern?: string }) {
  return <label className="auth-field auth-env-field auth-protected-field">
    <span>{label}<i className={configured ? "configured" : "missing"}>{configured ? "已保存" : "未配置"}</i></span>
    <input name={name} type="password" defaultValue="" placeholder={configured ? "••••••••••••" : placeholder} minLength={minLength} maxLength={512} pattern={pattern} autoComplete="new-password"/>
    <small>{configured ? "真实值不会回显；留空将保留当前配置" : "保存后只显示掩码，不会再次返回真实值"}</small>
  </label>;
}
