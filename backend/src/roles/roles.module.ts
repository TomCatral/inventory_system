import { Module } from '@nestjs/common';
import { InventoryRoleGuard } from './inventory-role.guard';

@Module({
  providers: [InventoryRoleGuard],
  exports: [InventoryRoleGuard],
})
export class RolesModule {}
