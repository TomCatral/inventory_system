import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SsoAuthGuard } from '../auth/sso-auth.guard';
import { InventoryRoleGuard } from '../roles/inventory-role.guard';
import { InventoryRoles } from '../roles/inventory-role.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { StockRequestService } from './stock-request.service';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

class CreateStockRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemId!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999999999)
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

class RejectStockRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('inventory/requests')
@UseGuards(SsoAuthGuard, InventoryRoleGuard)
export class StockRequestController {
  constructor(private readonly svc: StockRequestService) {}

  /** Staff: submit a supply request */
  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Post()
  create(@Body() body: CreateStockRequestDto, @Req() req: AuthenticatedRequest) {
    return this.svc.create({
      itemId: body.itemId,
      quantity: body.quantity,
      note: body.note,
      empNo: req.user.emp_no,
    });
  }

  /** Staff: view own requests */
  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  @Get('my')
  listMine(@Req() req: AuthenticatedRequest) {
    return this.svc.listMine(req.user.emp_no);
  }

  /** Admin+: view all requests */
  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Get()
  listAll(@Query('status') status?: string) {
    return this.svc.listAll({ status });
  }

  /** Admin+: approve → auto deduct stock */
  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.svc.approve(id, req.user.emp_no);
  }

  /** Admin+: reject */
  @InventoryRoles('ADMIN', 'SUPERADMIN')
  @Patch(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectStockRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.reject(id, req.user.emp_no, body.reason);
  }
}

