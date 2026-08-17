-- CreateTable
CREATE TABLE "Map" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Map_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Map_mode_visibility_idx" ON "Map"("mode", "visibility");

-- AddForeignKey
ALTER TABLE "Map" ADD CONSTRAINT "Map_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
