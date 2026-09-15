-- CreateTable
CREATE TABLE "UserLiveLocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "accuracy" DECIMAL(10,2),
    "heading" DECIMAL(10,2),
    "speed" DECIMAL(10,2),
    "isTracking" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLiveLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLiveLocation_userId_key" ON "UserLiveLocation"("userId");

-- CreateIndex
CREATE INDEX "UserLiveLocation_organizationId_idx" ON "UserLiveLocation"("organizationId");

-- CreateIndex
CREATE INDEX "UserLiveLocation_updatedAt_idx" ON "UserLiveLocation"("updatedAt");

-- CreateIndex
CREATE INDEX "UserLiveLocation_isTracking_idx" ON "UserLiveLocation"("isTracking");

-- AddForeignKey
ALTER TABLE "UserLiveLocation" ADD CONSTRAINT "UserLiveLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLiveLocation" ADD CONSTRAINT "UserLiveLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
