/*
 * Migration 1/2: Add dedupeKey column (no unique constraint yet).
 *
 * Replaces the old per-field global unique constraints (@unique on email,
 * phone, mobile individually) with the new triple-match approach.
 *
 * The unique index on (organizationId, dedupeKey) is intentionally deferred to
 * migration 2 so an existing-data backfill can detect/resolve duplicates first.
 */

-- Drop the old per-field unique indexes (added by 20260924053608_add_unique_contact_fields).
-- These global constraints are incompatible with the triple-match rule: the new
-- rule allows contacts to share a single field (e.g. same phone, different email).
DROP INDEX IF EXISTS "Contact_email_key";
DROP INDEX IF EXISTS "Contact_phone_key";
DROP INDEX IF EXISTS "Contact_mobile_key";

-- Add the normalised key column. NULL for contacts with no identifiers.
ALTER TABLE "Contact" ADD COLUMN "dedupeKey" TEXT;
