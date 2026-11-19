DROP INDEX `StockItem_itemName_idx` ON `StockItem`;

ALTER TABLE `InventoryMovement`
  MODIFY COLUMN `note` TEXT NULL;

ALTER TABLE `StockItem`
  MODIFY COLUMN `quantity` DECIMAL(12, 3) NOT NULL DEFAULT 0;
