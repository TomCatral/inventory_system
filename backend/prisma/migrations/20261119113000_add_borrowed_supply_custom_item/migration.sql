ALTER TABLE `BorrowedSupply` DROP FOREIGN KEY `BorrowedSupply_itemId_fkey`;

ALTER TABLE `BorrowedSupply`
  MODIFY COLUMN `itemId` INTEGER NULL,
  ADD COLUMN `customItemName` VARCHAR(255) NULL;

ALTER TABLE `BorrowedSupply`
  ADD CONSTRAINT `BorrowedSupply_itemId_fkey`
  FOREIGN KEY (`itemId`) REFERENCES `InventoryItem`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
