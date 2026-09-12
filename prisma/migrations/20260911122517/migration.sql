/*
  Warnings:

  - A unique constraint covering the columns `[dailyReportId]` on the table `AIReport` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DailyReportStatus" AS ENUM ('SUBMITTED', 'MISSED', 'DRAFT');

-- AlterTable
ALTER TABLE "AIReport" ADD COLUMN     "dailyReportId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "workDescription" TEXT,
    "completedWork" TEXT,
    "pendingWork" TEXT,
    "blockers" TEXT,
    "tomorrowPlan" TEXT,
    "tasksCompletedCount" INTEGER NOT NULL DEFAULT 0,
    "crmRecordsUpdatedCount" INTEGER NOT NULL DEFAULT 0,
    "leadsWorkedOnCount" INTEGER NOT NULL DEFAULT 0,
    "filesUploadedCount" INTEGER NOT NULL DEFAULT 0,
    "activeWorkingTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "DailyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyReport_organizationId_idx" ON "DailyReport"("organizationId");

-- CreateIndex
CREATE INDEX "DailyReport_userId_idx" ON "DailyReport"("userId");

-- CreateIndex
CREATE INDEX "DailyReport_date_idx" ON "DailyReport"("date");

-- CreateIndex
CREATE INDEX "DailyReport_status_idx" ON "DailyReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_userId_date_key" ON "DailyReport"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AIReport_dailyReportId_key" ON "AIReport"("dailyReportId");

-- CreateIndex
CREATE INDEX "AIReport_dailyReportId_idx" ON "AIReport"("dailyReportId");

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIReport" ADD CONSTRAINT "AIReport_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
