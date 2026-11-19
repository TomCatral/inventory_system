import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ItemCategory, InventoryItemStatus } from '@prisma/client';

export class ItemSetupDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  itemCode?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  itemName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsEnum(ItemCategory)
  category!: ItemCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  purchaseUom!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  distributionUom!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999999999)
  conversionFactor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999999999)
  reorderLevel?: number;

  @IsOptional()
  @IsEnum(InventoryItemStatus)
  status?: InventoryItemStatus;
}
