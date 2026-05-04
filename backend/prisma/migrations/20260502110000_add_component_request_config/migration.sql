-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- AlterTable
ALTER TABLE "WebsiteComponent"
ADD COLUMN "requestMethod" "HttpMethod" NOT NULL DEFAULT 'GET',
ADD COLUMN "requestPayload" TEXT;
