import {
  beginGitHubAuthorization,
  GitHubAuthenticationError,
  GitHubConfigurationError,
} from "../../../../auth/github";
import { safeReturnPath } from "../../../../auth/return-path";

export async function GET(request: Request) {
  try {
    const result = await beginGitHubAuthorization(request);
    return new Response(null, {
      status: 302,
      headers: {
        Location: result.authorizationUrl,
        "Set-Cookie": result.stateCookie,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const url = new URL(request.url);
    const reason = error instanceof GitHubAuthenticationError ? error.reason : error instanceof GitHubConfigurationError ? "github_not_configured" : "github_unavailable";
    const returnPath = safeReturnPath(url.searchParams.get("returnTo"));
    const locale = url.searchParams.get("lang") === "zh" ? "zh" : "en";
    if (url.searchParams.get("intent") === "link") {
      const location = new URL(returnPath.startsWith("/console") ? returnPath : "/console?view=profile", request.url);
      location.searchParams.set("error", reason);
      return Response.redirect(location);
    }
    return Response.redirect(new URL(`/login?lang=${locale}&error=${reason}&returnTo=${encodeURIComponent(returnPath)}`, request.url));
  }
}
