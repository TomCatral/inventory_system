-- CreateTable
CREATE TABLE `StockItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockNumber` VARCHAR(32) NOT NULL,
    `barcode` CHAR(10) NOT NULL,
    `itemName` VARCHAR(255) NOT NULL,
    `category` ENUM('CONSUMABLE', 'NON_CONSUMABLE') NOT NULL,
    `unitOfMeasurement` VARCHAR(80) NOT NULL,
    `brand` VARCHAR(120) NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `expirationDate` DATE NULL,
    `reorderLevel` DECIMAL(12, 3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StockItem_stockNumber_key`(`stockNumber`),
    UNIQUE INDEX `StockItem_barcode_key`(`barcode`),
    INDEX `StockItem_itemName_idx`(`itemName`),
    INDEX `StockItem_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockInSequence` (
    `year` INTEGER NOT NULL,
    `sequence` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
