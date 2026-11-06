import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export enum InventoryRoleDtoType {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPERADMIN = 'SUPERADMIN',
}

export class CreateInventoryRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  employeeNumber!: string;

  @IsEnum(InventoryRoleDtoType)
  roleType!: InventoryRoleDtoType;
}

export class UpdateInventoryRoleDto {
  @IsEnum(InventoryRoleDtoType)
  roleType!: InventoryRoleDtoType;
}
