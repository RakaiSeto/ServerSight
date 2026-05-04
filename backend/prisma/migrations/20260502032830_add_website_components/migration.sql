-- CreateTable
CREATE TABLE "WebsiteComponent" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteComponentCheck" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "status" "WebsiteStatus" NOT NULL,
    "statusCode" INTEGER,
    "responseMs" INTEGER,
    "errorText" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteComponentCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteComponent_websiteId_enabled_idx" ON "WebsiteComponent"("websiteId", "enabled");

-- CreateIndex
CREATE INDEX "WebsiteComponentCheck_componentId_checkedAt_idx" ON "WebsiteComponentCheck"("componentId", "checkedAt" DESC);

-- AddForeignKey
ALTER TABLE "WebsiteComponent" ADD CONSTRAINT "WebsiteComponent_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteComponentCheck" ADD CONSTRAINT "WebsiteComponentCheck_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "WebsiteComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
