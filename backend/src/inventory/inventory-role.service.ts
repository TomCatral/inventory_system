import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryRoleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryRoleDto, UpdateInventoryRoleDto } from './dto/role.dto';

export interface InventoryRoleWithEmployee {
  id: number;
  employeeNumber: string;
  roleType: InventoryRoleType;
  permissions: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  employeeName: string | null;
  departmentName: string | null;
}

interface RawInventoryRole extends Omit<InventoryRoleWithEmployee, 'permissions'> {
  permissions: string | null;
}

export interface EmployeeSearchItem {
  employeeNumber: string;
  employeeName: string;
  departmentName: string | null;
}

@Injectable()
export class InventoryRoleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<InventoryRoleWithEmployee[]> {
    try {
      const roles = await this.prisma.$queryRawUnsafe<RawInventoryRole[]>(`
        SELECT r.id, r.employeeNumber, r.roleType, r.permissions, r.createdAt, r.updatedAt,
               TRIM(CONCAT(
                 COALESCE(e.First_name, ''),
                 IF(COALESCE(e.Mid_name, '') != '', CONCAT(' ', SUBSTRING(e.Mid_name, 1, 1), '.'), ''),
                 IF(COALESCE(e.Last_name, '') != '', CONCAT(' ', e.Last_name), ''),
                 IF(COALESCE(e.Extend_Name, '') != '', CONCAT(' ', e.Extend_Name), '')
               )) as employeeName,
               d.DeptDesc as departmentName
        FROM InventoryRole r
        LEFT JOIN pgc_employee.Employee e ON (
          r.employeeNumber COLLATE utf8mb4_unicode_ci = e.emp_no COLLATE utf8mb4_unicode_ci
          OR TRIM(LEADING '0' FROM r.employeeNumber) COLLATE utf8mb4_unicode_ci = TRIM(LEADING '0' FROM e.emp_no) COLLATE utf8mb4_unicode_ci
          OR r.employeeNumber COLLATE utf8mb4_unicode_ci = e.id_number COLLATE utf8mb4_unicode_ci
        )
        LEFT JOIN pgc_employee.Department d ON e.Department COLLATE utf8mb4_unicode_ci = d.DeptCode COLLATE utf8mb4_unicode_ci
        WHERE r.roleType IN ('ADMIN', 'SUPERADMIN')
        ORDER BY r.employeeNumber ASC
      `);
      return roles.map((role) => ({
        ...role,
        permissions: this.parsePermissions(role.permissions),
      }));
    } catch {
      const basicRoles = await this.prisma.inventoryRole.findMany({
        where: { roleType: { in: [InventoryRoleType.ADMIN, InventoryRoleType.SUPERADMIN] } },
        orderBy: { employeeNumber: 'asc' },
      });
      return basicRoles.map((r) => ({
        ...r,
        permissions: this.parsePermissions(r.permissions),
        employeeName: null,
        departmentName: null,
      }));
    }
  }

  async searchEmployees(query: string): Promise<EmployeeSearchItem[]> {
    const q = query.trim();
    if (!q) {
      return [];
    }
    try {
      const pattern = `%${q}%`;
      return await this.prisma.$queryRawUnsafe<EmployeeSearchItem[]>(
        `
        SELECT e.emp_no as employeeNumber,
               TRIM(CONCAT(
                 COALESCE(e.First_name, ''),
                 IF(COALESCE(e.Mid_name, '') != '', CONCAT(' ', SUBSTRING(e.Mid_name, 1, 1), '.'), ''),
                 IF(COALESCE(e.Last_name, '') != '', CONCAT(' ', e.Last_name), ''),
                 IF(COALESCE(e.Extend_Name, '') != '', CONCAT(' ', e.Extend_Name), '')
               )) as employeeName,
               d.DeptDesc as departmentName
        FROM pgc_employee.Employee e
        LEFT JOIN pgc_employee.Department d ON e.Department COLLATE utf8mb4_unicode_ci = d.DeptCode COLLATE utf8mb4_unicode_ci
        WHERE e.emp_no LIKE ? OR e.First_name LIKE ? OR e.Last_name LIKE ? OR e.id_number LIKE ?
        ORDER BY e.Last_name ASC, e.First_name ASC
        LIMIT 20
        `,
        pattern,
        pattern,
        pattern,
        pattern,
      );
    } catch {
      return [];
    }
  }

  async create(dto: CreateInventoryRoleDto) {
    if (dto.roleType === InventoryRoleType.USER) {
      throw new BadRequestException(
        'All employees already have staff access through their PGC SSO account. Assign Admin or Superadmin instead.',
      );
    }
    const empNo = dto.employeeNumber.trim();
    const existing = await this.prisma.inventoryRole.findUnique({
      where: { employeeNumber: empNo },
    });
    if (existing) {
      throw new ConflictException(
        `Employee #${empNo} already has an assigned role (${existing.roleType}). Please update the existing role instead.`,
      );
    }
    return this.prisma.inventoryRole.create({
      data: {
        employeeNumber: empNo,
        roleType: dto.roleType,
        permissions:
          dto.roleType === InventoryRoleType.ADMIN
            ? this.serializePermissions(dto.permissions)
            : null,
      },
    });
  }

  async update(id: number, dto: UpdateInventoryRoleDto) {
    if (dto.roleType === InventoryRoleType.USER) {
      throw new BadRequestException(
        'All employees already have staff access through their PGC SSO account. Assign Admin or Superadmin instead.',
      );
    }
    const existing = await this.prisma.inventoryRole.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Inventory role assignment not found.');
    }
    await this.preventRemovingLastSuperadmin(existing.roleType, dto.roleType);

    const permissions =
      dto.roleType === InventoryRoleType.ADMIN
        ? dto.permissions !== undefined
          ? this.serializePermissions(dto.permissions)
          : undefined
        : null;

    return this.prisma.inventoryRole.update({
      where: { id },
      data: {
        roleType: dto.roleType,
        ...(permissions !== undefined ? { permissions } : {}),
      },
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

  private serializePermissions(
    permissions: string[] | null | undefined,
  ): string | null {
    if (permissions === undefined || permissions === null) {
      return null;
    }
    const unique = [...new Set(permissions.map((item) => item.trim()).filter(Boolean))];
    return JSON.stringify(unique);
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
