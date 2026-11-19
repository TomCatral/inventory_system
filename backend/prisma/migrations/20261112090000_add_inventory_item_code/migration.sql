ALTER TABLE `InventoryItem`
  ADD COLUMN `itemCode` VARCHAR(32) NULL;

UPDATE `InventoryItem`
SET `itemCode` = CONCAT('ITM-', LPAD(`id`, 6, '0'))
WHERE `itemCode` IS NULL;

CREATE UNIQUE INDEX `InventoryItem_itemCode_key`
  ON `InventoryItem`(`itemCode`);
