import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SsoAuthGuard } from '../auth/sso-auth.guard';
import { InventoryRoleGuard } from '../roles/inventory-role.guard';
import { InventoryRoles } from '../roles/inventory-role.decorator';
import { InventoryService } from './inventory.service';

@Controller('inventory/reports')
@UseGuards(SsoAuthGuard, InventoryRoleGuard)
@InventoryRoles('ADMIN', 'SUPERADMIN')
export class InventoryReportsController {
  constructor(private readonly inventory: InventoryService) {}

  @Get(':report')
  getReport(
    @Param('report') report: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventory.getReport(report, { from, to });
  }
}
