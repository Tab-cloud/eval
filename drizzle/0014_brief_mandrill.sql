ALTER TABLE "auth_provider_settings" ADD COLUMN "aliyun_access_key_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD COLUMN "sms_code_pepper_encrypted" text;--> statement-breakpoint
ALTER TABLE "auth_provider_settings" DROP COLUMN "aliyun_access_key_secret_ref";--> statement-breakpoint
ALTER TABLE "auth_provider_settings" DROP COLUMN "sms_code_pepper_ref";