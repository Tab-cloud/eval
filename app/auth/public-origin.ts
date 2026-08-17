const PRODUCTION_ORIGIN = "https://eval.zailink.space";

export function publicApplicationOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN?.trim();
  const fallback = process.env.NODE_ENV === "production"
    ? PRODUCTION_ORIGIN
    : new URL(request.url).origin;
  let parsed: URL;
  try {
    parsed = new URL(configured || fallback);
  } catch {
    throw new Error("APP_ORIGIN 必须是有效的绝对地址。");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("生产环境 APP_ORIGIN 必须使用 HTTPS。");
  }
  if (parsed.username || parsed.password) {
    throw new Error("APP_ORIGIN 不能包含内嵌凭据。");
  }
  return parsed.origin;
}

export function publicApplicationUrl(path: string, request: Request) {
  try {
    return new URL(path, publicApplicationOrigin(request));
  } catch {
    const fallback = process.env.NODE_ENV === "production"
      ? PRODUCTION_ORIGIN
      : new URL(request.url).origin;
    return new URL(path, fallback);
  }
}
