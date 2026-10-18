ALTER TABLE "onboarding_pairing_tokens" ADD COLUMN "certificate_pem" text;--> statement-breakpoint
ALTER TABLE "onboarding_pairing_tokens" ADD COLUMN "private_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "onboarding_pairing_tokens" ADD COLUMN "thumbprint_sha256" text;