import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateStockInDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999999999.999)
  quantity?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999999999.999)
  expectedQuantity?: number;

  @IsOptional()
  @IsDateString()
  expirationDate?: string | null;
}
