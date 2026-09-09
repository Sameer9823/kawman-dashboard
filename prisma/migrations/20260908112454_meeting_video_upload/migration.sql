-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MeetingStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "MeetingStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "Meeting" ALTER COLUMN "status" SET DEFAULT 'PROCESSING',
ALTER COLUMN "scheduledAt" DROP NOT NULL;
