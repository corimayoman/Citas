-- AlterTable: Add new fields to booking_requests
ALTER TABLE "booking_requests" ADD COLUMN "maxSearchAttempts" INTEGER;
ALTER TABLE "booking_requests" ADD COLUMN "searchJobId" TEXT;

-- AlterTable: Add new fields to connectors
ALTER TABLE "connectors" ADD COLUMN "lastHealthCheck" TIMESTAMP(3);
ALTER TABLE "connectors" ADD COLUMN "errorRate" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "connectors" ADD COLUMN "avgResponseTimeMs" INTEGER;
ALTER TABLE "connectors" ADD COLUMN "suspendedReason" TEXT;
ALTER TABLE "connectors" ADD COLUMN "suspendedAt" TIMESTAMP(3);

-- AlterTable: Add new fields to booking_attempts
ALTER TABLE "booking_attempts" ADD COLUMN "responseTimeMs" INTEGER;
ALTER TABLE "booking_attempts" ADD COLUMN "httpStatusCode" INTEGER;

-- CreateTable: intercepted_emails
CREATE TABLE "intercepted_emails" (
    "id" TEXT NOT NULL,
    "bookingRequestId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "rawBody" TEXT NOT NULL,
    "parsedData" JSONB,
    "portalOrigin" TEXT NOT NULL,
    "correlationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intercepted_emails_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "intercepted_emails" ADD CONSTRAINT "intercepted_emails_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "booking_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
