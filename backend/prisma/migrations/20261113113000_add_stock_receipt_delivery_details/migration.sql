ALTER TABLE `StockItem`
  ADD COLUMN `supplier` VARCHAR(255) NULL,
  ADD COLUMN `deliveredBy` VARCHAR(255) NULL,
  ADD COLUMN `deliveryReference` VARCHAR(120) NULL,
  ADD COLUMN `deliveryDate` DATE NULL,
  ADD COLUMN `remarks` TEXT NULL;
