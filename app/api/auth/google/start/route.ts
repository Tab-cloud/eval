import { beginGoogleAuthorization, GoogleConfigurationError } from "../../../../auth/google";
import { safeReturnPath } from "../../../../auth/return-path";

export async function GET(request: Request) {
  try {
    const result = await beginGoogleAuthorization(request);
    return new Response(null, {
      status: 302,
      headers: {
        Location: result.authorizationUrl,
        "Set-Cookie": result.stateCookie,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const reason = error instanceof GoogleConfigurationError ? "google_not_configured" : "google_unavailable";
    const url = new URL(request.url);
    const returnPath = safeReturnPath(url.searchParams.get("returnTo"));
    const locale = url.searchParams.get("lang") === "zh" ? "zh" : "en";
    return Response.redirect(new URL(`/login?lang=${locale}&error=${reason}&returnTo=${encodeURIComponent(returnPath)}`, request.url));
  }
}
