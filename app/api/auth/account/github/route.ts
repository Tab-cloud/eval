import {
  cookieToken,
  ExternalIdentityUnlinkError,
  getSessionUser,
  unlinkGitHubIdentity,
} from "../../../../auth/core";
import { rejectCrossSiteWrite } from "../../../../security/request";

export async function DELETE(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "未登录。" }, { status: 401 });

  try {
    await unlinkGitHubIdentity(user);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof ExternalIdentityUnlinkError)) throw error;
    if (error.reason === "github_not_linked") {
      return Response.json(
        { error: user.accountLocale === "zh" ? "当前账号尚未绑定 GitHub。" : "GitHub is not linked to this account." },
        { status: 404 },
      );
    }
    return Response.json(
      {
        error: user.accountLocale === "zh"
          ? "请先完整绑定用户名、手机号和密码，再解绑 GitHub。"
          : "Link Google before unlinking GitHub so you can still sign in.",
      },
      { status: 409 },
    );
  }
}
