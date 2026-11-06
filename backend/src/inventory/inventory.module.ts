import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SsoAuthGuard } from '../auth/sso-auth.guard';
import { InventoryController } from './inventory.controller';
import { StockInService } from './stock-in.service';
import { RolesModule } from '../roles/roles.module';
import { InventoryService } from './inventory.service';
import { ItemSetupController } from './item-setup.controller';
import { InventoryRoleController } from './inventory-role.controller';
import { InventoryRoleService } from './inventory-role.service';
import { InventoryReportsController } from './inventory-reports.controller';

@Module({
  imports: [AuthModule, RolesModule],
  controllers: [
    InventoryController,
    ItemSetupController,
    InventoryRoleController,
    InventoryReportsController,
  ],
  providers: [
    SsoAuthGuard,
    StockInService,
    InventoryService,
    InventoryRoleService,
  ],
})
export class InventoryModule {}
