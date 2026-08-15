import {
  clearGoogleStateCookie,
  finishGoogleAuthorization,
  GoogleAuthenticationError,
  googleSessionCookie,
} from "../../../../auth/google";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const providerError = requestUrl.searchParams.get("error");
  if (providerError) {
    return redirectToLogin(request, providerError === "access_denied" ? "google_cancelled" : "google_failed");
  }
  try {
    const result = await finishGoogleAuthorization(request);
    const headers = new Headers({
      Location: new URL(result.returnPath, request.url).toString(),
      "Cache-Control": "no-store",
    });
    headers.append("Set-Cookie", googleSessionCookie(result.session, request));
    headers.append("Set-Cookie", clearGoogleStateCookie(request));
    return new Response(null, {
      status: 302,
      headers,
    });
  } catch (error) {
    const reason = error instanceof GoogleAuthenticationError ? error.reason : "google_failed";
    return redirectToLogin(request, reason);
  }
}

function redirectToLogin(request: Request, reason: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(`/login?lang=en&error=${encodeURIComponent(reason)}`, request.url).toString(),
      "Set-Cookie": clearGoogleStateCookie(request),
      "Cache-Control": "no-store",
    },
  });
}
