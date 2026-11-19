CREATE TABLE `SupplyAssignment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `itemId` INTEGER NOT NULL,
  `recipientEmpNo` VARCHAR(32) NOT NULL,
  `recipientName` VARCHAR(255) NOT NULL,
  `recipientDepartment` VARCHAR(255) NULL,
  `issuedByEmpNo` VARCHAR(32) NOT NULL,
  `quantity` DECIMAL(18,6) NOT NULL,
  `remainingQuantity` DECIMAL(18,6) NOT NULL,
  `referenceNumber` VARCHAR(120) NULL,
  `status` ENUM('ACTIVE', 'RETURNED', 'TRANSFERRED') NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `SupplyAssignment_recipientEmpNo_status_idx`(`recipientEmpNo`, `status`),
  INDEX `SupplyAssignment_itemId_createdAt_idx`(`itemId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SupplyAssignment_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `InventoryItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupplyTransfer` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `assignmentId` INTEGER NOT NULL,
  `transferType` ENUM('RETURN_TO_ADMIN', 'TRANSFER_TO_STAFF') NOT NULL,
  `fromEmpNo` VARCHAR(32) NOT NULL,
  `toEmpNo` VARCHAR(32) NULL,
  `toName` VARCHAR(255) NULL,
  `quantity` DECIMAL(18,6) NOT NULL,
  `note` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `SupplyTransfer_assignmentId_createdAt_idx`(`assignmentId`, `createdAt`),
  INDEX `SupplyTransfer_fromEmpNo_createdAt_idx`(`fromEmpNo`, `createdAt`),
  INDEX `SupplyTransfer_toEmpNo_createdAt_idx`(`toEmpNo`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SupplyTransfer_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `SupplyAssignment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
