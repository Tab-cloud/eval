DROP TABLE "gateway_requests" CASCADE;--> statement-breakpoint
DROP TABLE "tenant_model_grants" CASCADE;--> statement-breakpoint
DROP TABLE "api_keys" CASCADE;--> statement-breakpoint
DROP TABLE "llm_configs" CASCADE;--> statement-breakpoint
DROP TABLE "models" CASCADE;--> statement-breakpoint
ALTER TABLE "billing_plans" DROP COLUMN "request_limit";
