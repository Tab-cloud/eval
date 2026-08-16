ALTER TABLE "auth_provider_settings" ADD COLUMN "aliyun_access_key_id" text;--> statement-breakpoint
ALTER TABLE "auth_provider_settings" DROP COLUMN "aliyun_access_key_id_ref";
