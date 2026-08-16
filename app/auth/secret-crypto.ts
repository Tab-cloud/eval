import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

export function sealSecret(value: string, context: string) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openSecret(payload: string | null, context: string) {
  if (!payload) return "";
  const [version, ivValue, tagValue, encryptedValue, ...extra] = payload.split(".");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue || extra.length) {
    throw new Error("加密的登录配置格式无效，请重新填写并保存。");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("登录配置无法解密，请检查主加密密钥或重新填写配置。");
  }
}

function encryptionKey() {
  const material = process.env.AUTH_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!material || material.length < 32) {
    throw new Error("部署环境尚未配置至少 32 位的 AUTH_SETTINGS_ENCRYPTION_KEY。");
  }
  return createHash("sha256").update(material, "utf8").digest();
}
