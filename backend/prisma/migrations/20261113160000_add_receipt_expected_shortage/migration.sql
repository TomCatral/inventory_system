ALTER TABLE `StockItem`
  ADD COLUMN `expectedQuantity` DECIMAL(12, 3) NULL,
  ADD COLUMN `shortageQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0;
