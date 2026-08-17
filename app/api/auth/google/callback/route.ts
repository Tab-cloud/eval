import {
  clearGoogleStateCookie,
  finishGoogleAuthorization,
  GoogleAuthenticationError,
  googleSessionCookie,
} from "../../../../auth/google";
import { publicApplicationUrl } from "../../../../auth/public-origin";

export async function GET(request: Request) {
  try {
    const result = await finishGoogleAuthorization(request);
    const destination = publicApplicationUrl(result.returnPath, request);
    if (result.linked) destination.searchParams.set("linked", result.linked);
    const headers = new Headers({
      Location: destination.toString(),
      "Cache-Control": "no-store",
    });
    if (result.session) headers.append("Set-Cookie", googleSessionCookie(result.session, request));
    headers.append("Set-Cookie", clearGoogleStateCookie(request));
    return new Response(null, {
      status: 302,
      headers,
    });
  } catch (error) {
    const reason = error instanceof GoogleAuthenticationError ? error.reason : "google_failed";
    if (error instanceof GoogleAuthenticationError && error.returnPath.includes("view=profile")) {
      const location = publicApplicationUrl(error.returnPath, request);
      location.searchParams.set("error", reason);
      return new Response(null, { status: 302, headers: { Location: location.toString(), "Set-Cookie": clearGoogleStateCookie(request), "Cache-Control": "no-store" } });
    }
    return redirectToLogin(request, reason, error instanceof GoogleAuthenticationError ? error.locale : "en");
  }
}

function redirectToLogin(request: Request, reason: string, locale: "zh" | "en" = "en") {
  return new Response(null, {
    status: 302,
    headers: {
      Location: publicApplicationUrl(`/login?lang=${locale}&error=${encodeURIComponent(reason)}`, request).toString(),
      "Set-Cookie": clearGoogleStateCookie(request),
      "Cache-Control": "no-store",
    },
  });
}
