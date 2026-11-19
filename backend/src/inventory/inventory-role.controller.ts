import {
  Body,
  Controller,
  Delete,
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
import { CreateInventoryRoleDto, UpdateInventoryRoleDto } from './dto/role.dto';
import { InventoryRoleService } from './inventory-role.service';

@Controller('inventory/roles')
@UseGuards(SsoAuthGuard, InventoryRoleGuard)
@InventoryRoles('SUPERADMIN')
export class InventoryRoleController {
  constructor(private readonly roles: InventoryRoleService) {}

  @Get()
  list() {
    return this.roles.list();
  }

  @Get('search-employees')
  searchEmployees(@Query('q') query?: string) {
    return this.roles.searchEmployees(query ?? '');
  }

  @Post()
  create(@Body() body: CreateInventoryRoleDto) {
    return this.roles.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateInventoryRoleDto,
  ) {
    return this.roles.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.roles.delete(id);
  }
}
