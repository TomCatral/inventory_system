import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateStockMovementDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stockItemId?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(999999999999)
  quantity!: number;

  @IsOptional()
  @IsIn(['PURCHASE', 'BASE'])
  unit?: 'PURCHASE' | 'BASE';

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientOffice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recipientEmpNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;
}
