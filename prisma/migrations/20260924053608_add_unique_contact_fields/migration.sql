/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[phone]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mobile]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Contact_email_idx";

-- CreateTable
CREATE TABLE "ResourceGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL DEFAULT 'record',
    "resourceId" TEXT,
    "permission" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ResourceGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceGrant_organizationId_idx" ON "ResourceGrant"("organizationId");

-- CreateIndex
CREATE INDEX "ResourceGrant_roleId_idx" ON "ResourceGrant"("roleId");

-- CreateIndex
CREATE INDEX "ResourceGrant_resourceType_resourceId_idx" ON "ResourceGrant"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "ResourceGrant_expiresAt_idx" ON "ResourceGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_email_key" ON "Contact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_phone_key" ON "Contact"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_mobile_key" ON "Contact"("mobile");

-- CreateIndex
CREATE INDEX "DailyReport_userId_date_status_idx" ON "DailyReport"("userId", "date", "status");

-- CreateIndex
CREATE INDEX "DailyReport_organizationId_date_status_idx" ON "DailyReport"("organizationId", "date", "status");

-- CreateIndex
CREATE INDEX "FieldVisit_assigneeId_status_idx" ON "FieldVisit"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "FieldVisit_organizationId_scheduledAt_idx" ON "FieldVisit"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Session_userId_lastSeenAt_idx" ON "Session"("userId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "ResourceGrant" ADD CONSTRAINT "ResourceGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceGrant" ADD CONSTRAINT "ResourceGrant_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceGrant" ADD CONSTRAINT "ResourceGrant_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
