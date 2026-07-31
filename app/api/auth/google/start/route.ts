import { beginGoogleAuthorization, GoogleConfigurationError } from "../../../../auth/google";

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
    return Response.redirect(new URL(`/login?lang=en&error=${reason}`, request.url));
  }
}
