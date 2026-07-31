CREATE TABLE "auth_provider_settings" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"aliyun_sign_name" text,
	"aliyun_template_code" text,
	"aliyun_template_code_key" text DEFAULT 'code' NOT NULL,
	"aliyun_access_key_id_ref" text DEFAULT 'ALIBABA_CLOUD_ACCESS_KEY_ID' NOT NULL,
	"aliyun_access_key_secret_ref" text DEFAULT 'ALIBABA_CLOUD_ACCESS_KEY_SECRET' NOT NULL,
	"sms_code_pepper_ref" text DEFAULT 'AUTH_SMS_CODE_PEPPER' NOT NULL,
	"google_enabled" boolean DEFAULT false NOT NULL,
	"google_client_id_ref" text DEFAULT 'GOOGLE_OAUTH_CLIENT_ID' NOT NULL,
	"google_client_secret_ref" text DEFAULT 'GOOGLE_OAUTH_CLIENT_SECRET' NOT NULL,
	"google_allowed_hosted_domain" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD CONSTRAINT "auth_provider_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;