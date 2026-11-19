import {
  Body,
  Controller,
  Get,
  Query,
  Req,
  Post,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SsoAuthGuard } from '../auth/sso-auth.guard';
import { InventoryRoleGuard } from '../roles/inventory-role.guard';
import { InventoryRoles } from '../roles/inventory-role.decorator';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { CreateStockReturnDto } from './dto/create-stock-return.dto';
import { UpdateStockInDto } from './dto/update-stock-in.dto';
import { InventoryService } from './inventory.service';
import { StockInService } from './stock-in.service';
import { SupplyQuantityDto, TransferSupplyDto } from './dto/supply-assignment.dto';
import { CreateBorrowedSupplyDto } from './dto/create-borrowed-supply.dto';
import { ReturnBorrowedSupplyDto } from './dto/return-borrowed-supply.dto';

@Controller('inventory')
@UseGuards(SsoAuthGuard, InventoryRoleGuard)
export class InventoryController {
  constructor(
    private readonly stockIn: StockInService,
    private readonly inventory: InventoryService,
  ) {}

  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Post('stock-in')
  createStockIn(
    @Body() body: CreateStockReceiptDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.receive(body, request.user.emp_no);
  }

  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Post('goods-receipts')
  createGoodsReceipt(
    @Body() body: CreateGoodsReceiptDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.createGoodsReceipt(body, request.user.emp_no);
  }

  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Get('goods-receipts')
  listGoodsReceipts() {
    return this.inventory.listGoodsReceipts();
  }

  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Patch('stock-in/:id')
  updateStockIn(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateStockInDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.updateStockInLine(id, body, request.user.emp_no);
  }

  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Delete('stock-in/:id')
  deleteStockIn(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.deleteStockInLine(id, request.user.emp_no);
  }


  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Get('items/:id/batches')
  listItemBatches(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.listItemBatches(id);
  }

  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Get('stock')
  listStock() {
    return this.stockIn.findRecent();
  }

  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Post('receipts')
  receive(
    @Body() body: CreateStockReceiptDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.receive(body, request.user.emp_no);
  }

  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Post('stock-out')
  issue(
    @Body() body: CreateStockMovementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.issue(body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Get('issuance-recipients')
  issuanceRecipients(
    @Query('q') query?: string,
    @Query('scope') scope?: string,
  ) {
    return this.inventory.listIssuanceRecipients(
      query ?? '',
      scope === 'all',
    );
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Get('supplies/my')
  mySupplies(@Req() request: AuthenticatedRequest) {
    return this.inventory.listMySupplies(request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Get('supplies/my/:itemId/batches')
  myItemBatches(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.listMyItemBatches(itemId, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Post('supplies/:id/return')
  returnAssignedSupply(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SupplyQuantityDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.returnAssignedSupply(id, body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Post('supplies/:id/transfer')
  transferAssignedSupply(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TransferSupplyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.transferAssignedSupply(id, body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Get('borrowed-supplies')
  listBorrowedSupplies(@Query('status') status?: string) {
    return this.inventory.listBorrowedSupplies(status);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Get('borrowed-supplies/:id/photo')
  getBorrowedSupplyPhoto(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.getBorrowedSupplyPhoto(id);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Post('borrowed-supplies')
  createBorrowedSupply(
    @Body() body: CreateBorrowedSupplyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.createBorrowedSupply(body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Patch('borrowed-supplies/:id/return')
  returnBorrowedSupply(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReturnBorrowedSupplyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.returnBorrowedSupply(id, body, request.user.emp_no);
  }

  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Get('balances')
  balances() {
    return this.inventory.listBalances();
  }

  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Post('returns')
  returnStock(
    @Body() body: CreateStockReturnDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.returnStock(body, request.user.emp_no);
  }

  @InventoryRoles('ADMIN', 'SUPERADMIN')
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
