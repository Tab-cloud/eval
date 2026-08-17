import {
  clearGitHubStateCookie,
  finishGitHubAuthorization,
  GitHubAuthenticationError,
  githubSessionCookie,
} from "../../../../auth/github";
import { publicApplicationUrl } from "../../../../auth/public-origin";

export async function GET(request: Request) {
  try {
    const result = await finishGitHubAuthorization(request);
    const destination = publicApplicationUrl(result.returnPath, request);
    if (result.linked) destination.searchParams.set("linked", result.linked);
    const headers = new Headers({
      Location: destination.toString(),
      "Cache-Control": "no-store",
    });
    if (result.session) headers.append("Set-Cookie", githubSessionCookie(result.session, request));
    headers.append("Set-Cookie", clearGitHubStateCookie(request));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const reason = error instanceof GitHubAuthenticationError ? error.reason : "github_failed";
    const locale = error instanceof GitHubAuthenticationError ? error.locale : "en";
    const returnPath = error instanceof GitHubAuthenticationError ? error.returnPath : "/console";
    if (returnPath.includes("view=profile")) {
      const location = publicApplicationUrl(returnPath, request);
      location.searchParams.set("error", reason);
      return new Response(null, { status: 302, headers: { Location: location.toString(), "Set-Cookie": clearGitHubStateCookie(request), "Cache-Control": "no-store" } });
    }
    const location = publicApplicationUrl("/login", request);
    location.searchParams.set("lang", locale);
    location.searchParams.set("error", reason);
    if (returnPath !== "/console") location.searchParams.set("returnTo", returnPath);
    return new Response(null, {
      status: 302,
      headers: {
        Location: location.toString(),
        "Set-Cookie": clearGitHubStateCookie(request),
        "Cache-Control": "no-store",
      },
    });
  }
}
