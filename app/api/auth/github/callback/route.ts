import {
  clearGitHubStateCookie,
  finishGitHubAuthorization,
  GitHubAuthenticationError,
  githubSessionCookie,
} from "../../../../auth/github";

export async function GET(request: Request) {
  try {
    const result = await finishGitHubAuthorization(request);
    const headers = new Headers({
      Location: new URL(result.returnPath, request.url).toString(),
      "Cache-Control": "no-store",
    });
    headers.append("Set-Cookie", githubSessionCookie(result.session, request));
    headers.append("Set-Cookie", clearGitHubStateCookie(request));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const reason = error instanceof GitHubAuthenticationError ? error.reason : "github_failed";
    const locale = error instanceof GitHubAuthenticationError ? error.locale : "en";
    const returnPath = error instanceof GitHubAuthenticationError ? error.returnPath : "/console";
    const location = new URL("/login", request.url);
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
