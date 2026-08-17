export const NEW_USERNAME_REQUIREMENTS = "账号需为 3–32 位英文字母或数字。";

export function isValidNewUsername(value: string) {
  return /^[A-Za-z0-9]{3,32}$/.test(value);
}
