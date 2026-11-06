import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum StockAdjustmentType {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
  DAMAGE = 'DAMAGE',
}

export class CreateStockAdjustmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemId!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(999999999999)
  quantity!: number;

  @IsEnum(StockAdjustmentType)
  adjustmentType!: StockAdjustmentType;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
