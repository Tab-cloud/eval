import { createHash } from "node:crypto";

const PUBLIC_KEY_ENV = "EVAL_UPDATER_PUBLIC_KEY";

export type VerifiedUpdaterSignature = {
  keyId: string;
  verifiedAt: number;
};

export async function verifyUpdaterSignature(
  bytes: Uint8Array,
  signatureText: string,
): Promise<VerifiedUpdaterSignature> {
  const publicKeyText = configuredUpdaterPublicKey();
  const signatureValue = signatureText.trim();
  if (!signatureValue) throw new Error("Tauri .sig 签名文件为空。");
  const signatureSource = decodeWrappedSignature(signatureValue);

  const minisign = await import("@threema/wasm-minisign-verify");
  let publicKey: InstanceType<typeof minisign.PublicKey> | undefined;
  let signature: InstanceType<typeof minisign.Signature> | undefined;
  try {
    publicKey = minisign.PublicKey.decode(publicKeyText);
    signature = minisign.Signature.decode(signatureSource);
    if (!publicKey.verify(bytes, signature)) throw new Error("signature mismatch");
  } catch {
    throw new Error("Tauri .sig 与安装包或当前更新公钥不匹配。");
  } finally {
    safeFree(signature);
    safeFree(publicKey);
  }

  return {
    keyId: publicKeyFingerprint(publicKeyText),
    verifiedAt: Math.floor(Date.now() / 1000),
  };
}

export function updaterPublicKeyId() {
  return publicKeyFingerprint(configuredUpdaterPublicKey());
}

function safeFree(value: { free(): void } | undefined) {
  try {
    value?.free();
  } catch {
    // A failed WASM verification can leave its borrowed wrapper unavailable.
  }
}

function configuredUpdaterPublicKey() {
  const configured = process.env[PUBLIC_KEY_ENV]?.trim().replaceAll("\\n", "\n");
  if (!configured) {
    throw new Error(`服务器未配置 ${PUBLIC_KEY_ENV}，无法验证 Tauri 更新签名。`);
  }

  const decoded = decodeWrappedPublicKey(configured);
  if (decoded.includes("\n")) return decoded;
  if (/^RW[A-Za-z0-9+/=]+$/.test(decoded)) {
    return `untrusted comment: minisign public key\n${decoded}`;
  }
  throw new Error(`${PUBLIC_KEY_ENV} 不是有效的 Minisign 公钥。`);
}

function decodeWrappedPublicKey(value: string) {
  if (value.startsWith("untrusted comment:")) return value;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    if (decoded.startsWith("untrusted comment:")) return decoded;
  } catch {
    // The value may already be a raw Minisign public-key line.
  }
  return value;
}

function decodeWrappedSignature(value: string) {
  if (value.startsWith("untrusted comment:")) return value;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    if (decoded.startsWith("untrusted comment:")) return decoded;
  } catch {
    // The signature may already be an unwrapped Minisign document.
  }
  return value;
}

function publicKeyFingerprint(publicKeyText: string) {
  const keyLine = publicKeyText.split(/\r?\n/).map(line => line.trim()).find(line => /^RW[A-Za-z0-9+/=]+$/.test(line));
  return createHash("sha256").update(keyLine ?? publicKeyText).digest("hex").slice(0, 16);
}
