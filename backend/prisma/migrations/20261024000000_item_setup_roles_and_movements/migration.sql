CREATE TABLE `InventoryRole` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeNumber` VARCHAR(32) NOT NULL,
    `roleType` ENUM('USER', 'ADMIN', 'SUPERADMIN') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InventoryRole_employeeNumber_key`(`employeeNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InventoryItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemName` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `category` ENUM('CONSUMABLE', 'NON_CONSUMABLE') NOT NULL,
    `purchaseUom` VARCHAR(80) NOT NULL,
    `distributionUom` VARCHAR(80) NOT NULL,
    `conversionFactor` DECIMAL(12, 3) NOT NULL,
    `reorderLevel` DECIMAL(18, 6) NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InventoryItem_itemName_idx`(`itemName`),
    INDEX `InventoryItem_category_status_idx`(`category`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InventoryBalance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemId` INTEGER NOT NULL,
    `quantity` DECIMAL(18, 6) NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InventoryBalance_itemId_key`(`itemId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `InventoryBalance_itemId_fkey`
      FOREIGN KEY (`itemId`) REFERENCES `InventoryItem`(`id`)
      ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InventoryMovement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemId` INTEGER NOT NULL,
    `employeeNumber` VARCHAR(32) NOT NULL,
    `movementType` ENUM('STOCK_IN', 'STOCK_OUT') NOT NULL,
    `quantityEntered` DECIMAL(18, 6) NOT NULL,
    `enteredUom` VARCHAR(80) NOT NULL,
    `conversionFactor` DECIMAL(12, 3) NOT NULL,
    `quantityBase` DECIMAL(18, 6) NOT NULL,
    `balanceAfter` DECIMAL(18, 6) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InventoryMovement_itemId_createdAt_idx`(`itemId`, `createdAt`),
    INDEX `InventoryMovement_employeeNumber_createdAt_idx`(`employeeNumber`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `InventoryMovement_itemId_fkey`
      FOREIGN KEY (`itemId`) REFERENCES `InventoryItem`(`id`)
      ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StockItem`
    ADD COLUMN `itemId` INTEGER NULL,
    ADD INDEX `StockItem_itemId_idx`(`itemId`),
    ADD CONSTRAINT `StockItem_itemId_fkey`
      FOREIGN KEY (`itemId`) REFERENCES `InventoryItem`(`id`)
      ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `InventoryRole` (`employeeNumber`, `roleType`, `updatedAt`)
VALUES ('0000004457', 'SUPERADMIN', CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `roleType` = 'SUPERADMIN',
  `updatedAt` = CURRENT_TIMESTAMP(3);
