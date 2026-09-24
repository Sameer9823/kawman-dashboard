-- Add the per-organization email uniqueness constraint.
--
-- Run ONLY after prisma/scripts/backfill-contact-email-key.ts reports zero
-- duplicate email groups. Existing rows with NULL emailKey are unaffected
-- because Postgres treats NULLs as distinct in unique indexes.

CREATE UNIQUE INDEX "Contact_organizationId_emailKey_key" ON "Contact"("organizationId", "emailKey");
