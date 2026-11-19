ALTER TABLE `GoodsReceipt`
  ADD COLUMN `stockClassification` VARCHAR(8) NOT NULL DEFAULT 'NEW';

ALTER TABLE `StockItem`
  ADD COLUMN `stockClassification` VARCHAR(8) NOT NULL DEFAULT 'NEW';
