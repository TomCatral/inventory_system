import {
  Body,
  Controller,
  Get,
  Query,
  Req,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SsoAuthGuard } from '../auth/sso-auth.guard';
import { InventoryRoleGuard } from '../roles/inventory-role.guard';
import { InventoryRoles } from '../roles/inventory-role.decorator';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { CreateStockReturnDto } from './dto/create-stock-return.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { CreatePhysicalCountDto } from './dto/create-physical-count.dto';
import { InventoryService } from './inventory.service';
import { StockInService } from './stock-in.service';

@Controller('inventory')
@UseGuards(SsoAuthGuard, InventoryRoleGuard)
export class InventoryController {
  constructor(
    private readonly stockIn: StockInService,
    private readonly inventory: InventoryService,
  ) {}

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Post('stock-in')
  createStockIn(
    @Body() body: CreateStockReceiptDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.receive(body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Get('stock')
  listStock() {
    return this.stockIn.findRecent();
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Post('receipts')
  receive(
    @Body() body: CreateStockReceiptDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.receive(body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Post('stock-out')
  issue(
    @Body() body: CreateStockMovementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.issue(body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Get('balances')
  balances() {
    return this.inventory.listBalances();
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Post('returns')
  returnStock(
    @Body() body: CreateStockReturnDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.returnStock(body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Post('adjustments')
  adjustStock(
    @Body() body: CreateStockAdjustmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.adjustStock(body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Post('physical-count')
  countInventory(
    @Body() body: CreatePhysicalCountDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.countInventory(body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Get('movements')
  movements(
    @Query('type') type?: string,
    @Query('itemId') itemId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventory.listMovements({ type, itemId, from, to });
  }

}
