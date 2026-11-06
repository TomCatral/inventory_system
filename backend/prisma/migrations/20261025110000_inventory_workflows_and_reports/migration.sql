ALTER TABLE `InventoryMovement`
    MODIFY `movementType` ENUM(
        'STOCK_IN',
        'STOCK_OUT',
        'RETURN_IN',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'DAMAGE_OUT',
        'COUNT_IN',
        'COUNT_OUT'
    ) NOT NULL,
    ADD COLUMN `note` VARCHAR(500) NULL;

CREATE TABLE `PhysicalInventorySession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeNumber` VARCHAR(32) NOT NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `PhysicalInventorySession_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PhysicalInventoryCount` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `expected` DECIMAL(18, 6) NOT NULL,
    `counted` DECIMAL(18, 6) NOT NULL,
    `variance` DECIMAL(18, 6) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `PhysicalInventoryCount_sessionId_itemId_key`(`sessionId`, `itemId`),
    INDEX `PhysicalInventoryCount_itemId_createdAt_idx`(`itemId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `PhysicalInventoryCount_sessionId_fkey`
      FOREIGN KEY (`sessionId`) REFERENCES `PhysicalInventorySession`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `PhysicalInventoryCount_itemId_fkey`
      FOREIGN KEY (`itemId`) REFERENCES `InventoryItem`(`id`)
      ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
