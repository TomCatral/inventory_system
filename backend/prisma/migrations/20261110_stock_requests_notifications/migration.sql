-- CreateTable StockRequest
CREATE TABLE IF NOT EXISTS `StockRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemId` INTEGER NOT NULL,
    `quantity` DECIMAL(18, 6) NOT NULL,
    `note` TEXT NULL,
    `requestedByEmpNo` VARCHAR(32) NOT NULL,
    `requestedByName` VARCHAR(255) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `resolvedByEmpNo` VARCHAR(32) NULL,
    `resolvedByName` VARCHAR(255) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `StockRequest_itemId_idx`(`itemId`),
    INDEX `StockRequest_status_idx`(`status`),
    INDEX `StockRequest_requestedByEmpNo_idx`(`requestedByEmpNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable Notification
CREATE TABLE IF NOT EXISTS `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recipientEmpNo` VARCHAR(32) NOT NULL,
    `message` TEXT NOT NULL,
    `refType` VARCHAR(64) NULL,
    `refId` INTEGER NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_recipientEmpNo_idx`(`recipientEmpNo`),
    INDEX `Notification_isRead_idx`(`isRead`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

