const MAINLAND_MOBILE = /^1[3-9]\d{9}$/;

export function normalizeChinesePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let phone = value.trim().replaceAll(" ", "").replaceAll("-", "");
  if (phone.startsWith("+86")) phone = phone.slice(3);
  else if (phone.startsWith("0086")) phone = phone.slice(4);
  else if (phone.startsWith("86") && phone.length === 13) phone = phone.slice(2);
  return MAINLAND_MOBILE.test(phone) ? `+86${phone}` : null;
}

export function aliyunPhoneNumber(phoneE164: string) {
  return phoneE164.startsWith("+86") ? phoneE164.slice(3) : phoneE164;
}

export function maskPhone(phoneE164: string | null | undefined) {
  if (!phoneE164) return "";
  const digits = phoneE164.replace(/^\+86/, "");
  return digits.length === 11 ? `${digits.slice(0, 3)} **** ${digits.slice(-4)}` : phoneE164;
}
