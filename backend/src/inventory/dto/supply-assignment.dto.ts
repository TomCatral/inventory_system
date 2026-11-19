import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SupplyQuantityDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(999999999999)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class TransferSupplyDto extends SupplyQuantityDto {
  @IsString()
  @MaxLength(32)
  recipientEmpNo!: string;
}
