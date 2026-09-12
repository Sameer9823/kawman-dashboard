-- AlterEnum: add DAILY_REPORT_SUBMITTED to NotificationType
-- Applied directly via DIRECT_URL (ALTER TYPE ... ADD VALUE cannot run inside a transaction)
-- This SQL is idempotent — safe to re-run if the value already exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    BEGIN
      ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DAILY_REPORT_SUBMITTED';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
