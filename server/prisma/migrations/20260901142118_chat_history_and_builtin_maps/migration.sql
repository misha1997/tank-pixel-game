-- AlterTable
ALTER TABLE `Map` ADD COLUMN `isBuiltin` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `ownerId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `authorName` VARCHAR(191) NULL,
    `text` VARCHAR(191) NOT NULL,
    `system` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMessage_roomId_createdAt_idx`(`roomId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
