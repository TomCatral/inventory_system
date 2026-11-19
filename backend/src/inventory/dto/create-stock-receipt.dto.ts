import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class CreateStockReceiptDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemId!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999999999999)
  quantity!: number;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  supplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deliveredBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  delivererCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deliveryReference?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}
