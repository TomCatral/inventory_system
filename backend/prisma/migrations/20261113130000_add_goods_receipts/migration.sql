CREATE TABLE `GoodsReceipt` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `receiptNumber` VARCHAR(40) NOT NULL,
  `supplier` VARCHAR(255) NOT NULL,
  `deliveredBy` VARCHAR(255) NOT NULL,
  `deliveryReference` VARCHAR(120) NULL,
  `deliveryDate` DATE NOT NULL,
  `remarks` TEXT NULL,
  `receivedByEmpNo` VARCHAR(32) NOT NULL,
  `receivedByName` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GoodsReceipt_receiptNumber_key`(`receiptNumber`),
  INDEX `GoodsReceipt_deliveryDate_idx`(`deliveryDate`),
  INDEX `GoodsReceipt_receivedByEmpNo_createdAt_idx`(`receivedByEmpNo`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GoodsReceiptSequence` (
  `year` INTEGER NOT NULL,
  `sequence` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StockItem` ADD COLUMN `goodsReceiptId` INTEGER NULL;
CREATE INDEX `StockItem_goodsReceiptId_idx` ON `StockItem`(`goodsReceiptId`);
ALTER TABLE `StockItem` ADD CONSTRAINT `StockItem_goodsReceiptId_fkey`
  FOREIGN KEY (`goodsReceiptId`) REFERENCES `GoodsReceipt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
