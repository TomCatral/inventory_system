import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SsoAuthGuard } from '../auth/sso-auth.guard';
import { InventoryRoleGuard } from '../roles/inventory-role.guard';
import { InventoryRoles } from '../roles/inventory-role.decorator';
import { ItemSetupDto } from './dto/item-setup.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory/items')
@UseGuards(SsoAuthGuard, InventoryRoleGuard)
export class ItemSetupController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  list(
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.inventory.listItems({ category, status, search });
  }

  @Get(':id')
  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.getItem(id);
  }

  @Post()
  @InventoryRoles('ADMIN', 'SUPERADMIN')
  create(@Body() body: ItemSetupDto) {
    return this.inventory.createItem(body);
  }

  @Patch(':id')
  @InventoryRoles('ADMIN', 'SUPERADMIN')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ItemSetupDto) {
    return this.inventory.updateItem(id, body);
  }
}
