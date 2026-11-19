UPDATE `InventoryMovement`
SET `movementType` = CASE `movementType`
    WHEN 'ADJUSTMENT_IN' THEN 'STOCK_IN'
    WHEN 'COUNT_IN' THEN 'STOCK_IN'
    WHEN 'ADJUSTMENT_OUT' THEN 'STOCK_OUT'
    WHEN 'COUNT_OUT' THEN 'STOCK_OUT'
    ELSE `movementType`
END
WHERE `movementType` IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'COUNT_IN', 'COUNT_OUT');

ALTER TABLE `InventoryMovement`
    MODIFY `movementType` ENUM(
        'STOCK_IN',
        'STOCK_OUT',
        'RETURN_IN',
        'DAMAGE_OUT'
    ) NOT NULL;

DROP TABLE IF EXISTS `PhysicalInventoryCount`;
DROP TABLE IF EXISTS `PhysicalInventorySession`;
