ALTER TABLE "users" ADD COLUMN "merged_into_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "merged_at" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merged_into_user_id_users_id_fk" FOREIGN KEY ("merged_into_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_merged_into_idx" ON "users" USING btree ("merged_into_user_id");