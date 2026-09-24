/*
 * Migration 2/2: Add the per-organization triple-match unique constraint.
 *
 * Run ONLY after prisma/scripts/backfill-contact-dedupe-key.ts reports zero
 * duplicate groups. Existing rows with NULL dedupeKey (no identifiers) are
 * unaffected because Postgres treats NULLs as distinct in unique indexes.
 */

CREATE UNIQUE INDEX "Contact_organizationId_dedupeKey_key" ON "Contact"("organizationId", "dedupeKey");
