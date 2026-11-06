import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/auth.types';
import {
  INVENTORY_ROLES,
  type InventoryRoleType,
} from './inventory-role.decorator';

@Injectable()
export class InventoryRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowedRoles =
      this.reflector.getAllAndOverride<InventoryRoleType[]>(
        INVENTORY_ROLES,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const employeeNumber = request.user?.emp_no;

    if (!employeeNumber) {
      throw new ForbiddenException('Inventory access is not assigned.');
    }

    const role = await this.prisma.inventoryRole.findUnique({
      where: { employeeNumber },
      select: { roleType: true },
    });

    if (!role || (allowedRoles.length && !allowedRoles.includes(role.roleType))) {
      throw new ForbiddenException('You do not have permission to access this feature.');
    }

    request.inventoryRole = role.roleType;
    return true;
  }
}
