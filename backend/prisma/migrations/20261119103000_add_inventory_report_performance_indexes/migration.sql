CREATE INDEX `StockItem_itemId_remainingQuantity_idx` ON `StockItem`(`itemId`, `remainingQuantity`);
CREATE INDEX `StockItem_batch_order_idx` ON `StockItem`(`itemId`, `stockClassification`, `deliveryDate`, `createdAt`);
CREATE INDEX `InventoryMovement_createdAt_idx` ON `InventoryMovement`(`createdAt`);
CREATE INDEX `InventoryMovement_movementType_createdAt_idx` ON `InventoryMovement`(`movementType`, `createdAt`);
CREATE INDEX `Notification_recipientEmpNo_isRead_createdAt_idx` ON `Notification`(`recipientEmpNo`, `isRead`, `createdAt`);
