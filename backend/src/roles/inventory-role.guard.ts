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

    const rows = typeof this.prisma.$queryRawUnsafe === 'function'
      ? await this.prisma.$queryRawUnsafe<Array<{
      roleType: InventoryRoleType;
      permissions: string | null;
    }>>(
      `SELECT r.roleType, r.permissions
       FROM InventoryRole r
       LEFT JOIN pgc_employee.Employee e ON (
         r.employeeNumber COLLATE utf8mb4_unicode_ci = e.emp_no COLLATE utf8mb4_unicode_ci
         OR TRIM(LEADING '0' FROM r.employeeNumber) COLLATE utf8mb4_unicode_ci = TRIM(LEADING '0' FROM e.emp_no) COLLATE utf8mb4_unicode_ci
         OR r.employeeNumber COLLATE utf8mb4_unicode_ci = e.id_number COLLATE utf8mb4_unicode_ci
       )
       WHERE r.employeeNumber COLLATE utf8mb4_unicode_ci = ?
          OR TRIM(LEADING '0' FROM r.employeeNumber) COLLATE utf8mb4_unicode_ci = TRIM(LEADING '0' FROM ?)
          OR e.emp_no COLLATE utf8mb4_unicode_ci = ?
          OR TRIM(LEADING '0' FROM e.emp_no) COLLATE utf8mb4_unicode_ci = TRIM(LEADING '0' FROM ?)
          OR e.id_number COLLATE utf8mb4_unicode_ci = ?
       LIMIT 1`,
      employeeNumber,
      employeeNumber,
      employeeNumber,
      employeeNumber,
      employeeNumber,
    )
      : await this.prisma.inventoryRole.findUnique({
          where: { employeeNumber },
          select: { roleType: true, permissions: true },
        }).then((role) => role ? [role] : []);
    const role = rows[0] ?? null;

    // Any authenticated PGC SSO employee can use the system. Employees without
    // an explicit inventory role assignment default to staff (USER); only
    // explicitly assigned ADMIN/SUPERADMIN accounts get elevated access.
    const roleType = role?.roleType ?? 'USER';

    if (allowedRoles.length && !allowedRoles.includes(roleType)) {
      throw new ForbiddenException('You do not have permission to access this feature.');
    }

    request.inventoryRole = roleType;
    request.inventoryPermissions = role ? this.parsePermissions(role.permissions) : null;
    return true;
  }

  private parsePermissions(value: string | null): string[] | null {
    if (!value) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        return null;
      }
      return parsed.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      );
    } catch {
      return null;
    }
  }
}
