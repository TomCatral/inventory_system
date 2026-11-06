import { SetMetadata } from '@nestjs/common';

export const INVENTORY_ROLES = 'inventory-roles';
export type InventoryRoleType = 'USER' | 'ADMIN' | 'SUPERADMIN';

export const InventoryRoles = (...roles: InventoryRoleType[]) =>
  SetMetadata(INVENTORY_ROLES, roles);
