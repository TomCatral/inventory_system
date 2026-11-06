import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryRoleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryRoleDto, UpdateInventoryRoleDto } from './dto/role.dto';

@Injectable()
export class InventoryRoleService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.inventoryRole.findMany({
      orderBy: { employeeNumber: 'asc' },
    });
  }

  create(dto: CreateInventoryRoleDto) {
    return this.prisma.inventoryRole.create({
      data: {
        employeeNumber: dto.employeeNumber.trim(),
        roleType: dto.roleType,
      },
    });
  }

  async update(id: number, dto: UpdateInventoryRoleDto) {
    const existing = await this.prisma.inventoryRole.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Inventory role assignment not found.');
    }
    await this.preventRemovingLastSuperadmin(existing.roleType, dto.roleType);
    return this.prisma.inventoryRole.update({
      where: { id },
      data: { roleType: dto.roleType },
    });
  }

  async delete(id: number) {
    const existing = await this.prisma.inventoryRole.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Inventory role assignment not found.');
    }
    await this.preventRemovingLastSuperadmin(existing.roleType, null);
    return this.prisma.inventoryRole.delete({ where: { id } });
  }

  private async preventRemovingLastSuperadmin(
    oldRole: InventoryRoleType,
    newRole: InventoryRoleType | null,
  ): Promise<void> {
    if (oldRole !== InventoryRoleType.SUPERADMIN || newRole === oldRole) {
      return;
    }
    const count = await this.prisma.inventoryRole.count({
      where: { roleType: InventoryRoleType.SUPERADMIN },
    });
    if (count <= 1) {
      throw new ConflictException('The last superadmin role cannot be removed.');
    }
  }
}
