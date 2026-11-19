-- Remove inventory columns that are no longer read or written by the application.
ALTER TABLE `InventoryMovement`
  DROP COLUMN `conversionFactor`;

ALTER TABLE `StockItem`
  DROP COLUMN `barcode`,
  DROP COLUMN `reorderLevel`,
  DROP COLUMN `category`,
  DROP COLUMN `brand`;

ALTER TABLE `SupplyAssignment`
  DROP COLUMN `recipientDepartment`;
