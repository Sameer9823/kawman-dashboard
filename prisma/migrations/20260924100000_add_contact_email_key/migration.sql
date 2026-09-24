-- Replace the dedupeKey approach with emailKey (email-only uniqueness).
--
-- The dedupeKey migrations (20260924095000 / 20260924095100) were recorded as
-- applied in _prisma_migrations but the column may not have actually been
-- created on the database. IF EXISTS guards handle both states.

-- 1. Drop the dedupeKey unique index (from 20260924095100_add_contact_dedupe_unique)
DROP INDEX IF EXISTS "Contact_organizationId_dedupeKey_key";

-- 2. Drop the dedupeKey column (from 20260924095000_add_contact_dedupe_key)
ALTER TABLE "Contact" DROP COLUMN IF EXISTS "dedupeKey";

-- 3. Drop any old per-field global unique indexes that may still exist from
--    20260924053608_add_unique_contact_fields (the dedupeKey migration was
--    supposed to drop these, but use IF EXISTS to be safe).
DROP INDEX IF EXISTS "Contact_email_key";
DROP INDEX IF EXISTS "Contact_phone_key";
DROP INDEX IF EXISTS "Contact_mobile_key";

-- 4. Add the new emailKey column. The unique constraint is intentionally
--    deferred to migration 2 so the backfill script can detect/resolve
--    duplicate emails first.
ALTER TABLE "Contact" ADD COLUMN "emailKey" TEXT;
