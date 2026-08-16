import Dysmsapi20170525, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import { aliyunPhoneNumber } from "./phone";
import { environmentValue, tenantProviderSettings } from "./provider-settings";

type SmsClient = InstanceType<typeof Dysmsapi20170525>;

declare global {
  var __evalAliyunSmsClient: { fingerprint: string; client: SmsClient } | undefined;
}

export class SmsConfigurationError extends Error {}

export class SmsDeliveryError extends Error {
  readonly providerCode: string;

  constructor(providerCode: string) {
    super("阿里云短信发送失败。");
    this.providerCode = providerCode;
  }
}

function smsClient(accessKeyId: string, accessKeySecret: string) {
  const fingerprint = `${accessKeyId}:${accessKeySecret}`;
  if (globalThis.__evalAliyunSmsClient?.fingerprint === fingerprint) {
    return globalThis.__evalAliyunSmsClient.client;
  }
  const config = new $OpenApiUtil.Config({
    accessKeyId,
    accessKeySecret,
    endpoint: "dysmsapi.aliyuncs.com",
    connectTimeout: 5_000,
    readTimeout: 10_000,
  });
  const client = new Dysmsapi20170525(config);
  globalThis.__evalAliyunSmsClient = { fingerprint, client };
  return client;
}

export async function sendLoginVerificationCode(tenantId: string, phoneE164: string, code: string, outId: string) {
  const settings = await tenantProviderSettings(tenantId);
  if (!settings.smsEnabled) throw new SmsConfigurationError("阿里云短信登录已停用。");
  const signName = settings.aliyunSignName;
  const templateCode = settings.aliyunTemplateCode;
  const parameterName = settings.aliyunTemplateCodeKey;
  if (!signName || !templateCode) throw new SmsConfigurationError("阿里云短信签名或模板尚未配置。");
  if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(parameterName)) {
    throw new SmsConfigurationError("短信模板变量名格式无效。");
  }

  let accessKeyId: string;
  let accessKeySecret: string;
  try {
    accessKeyId = settings.aliyunAccessKeyId;
    if (!accessKeyId) throw new Error("管理员平台尚未保存阿里云 AccessKey ID。");
    accessKeySecret = environmentValue(settings.aliyunAccessKeySecretRef);
  } catch (error) {
    throw new SmsConfigurationError(error instanceof Error ? error.message : "阿里云短信凭据尚未配置。");
  }

  const response = await smsClient(accessKeyId, accessKeySecret).sendSms(new SendSmsRequest({
    phoneNumbers: aliyunPhoneNumber(phoneE164),
    signName,
    templateCode,
    templateParam: JSON.stringify({ [parameterName]: code }),
    outId,
  }));
  const body = response.body;
  if (body?.code !== "OK") throw new SmsDeliveryError(body?.code || "UNKNOWN");
  return { bizId: body.bizId ?? null, requestId: body.requestId ?? null };
}
