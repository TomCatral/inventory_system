-- Extend supply assignments with the exact unit selected when the stock was issued.
-- Existing rows are left null so reports can fall back to catalog-based conversion.
ALTER TABLE `SupplyAssignment`
  ADD COLUMN `enteredUom` VARCHAR(32) NULL,
  ADD COLUMN `enteredQuantity` DECIMAL(18, 6) NULL,
  ADD COLUMN `conversionFactor` DECIMAL(18, 6) NULL;
