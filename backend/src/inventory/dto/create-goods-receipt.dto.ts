import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class GoodsReceiptLineDto {
  @Type(() => Number) @IsInt() @Min(1)
  itemId!: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(999999999999)
  quantity!: number;

  @Type(() => Number) @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(999999999999)
  expectedQuantity?: number;

  @IsOptional() @IsDateString()
  expirationDate?: string;
}

export class CreateGoodsReceiptDto {
  @IsString() @MaxLength(255)
  supplier!: string;

  @IsString() @MaxLength(255)
  deliveredBy!: string;

  @IsOptional() @IsString() @MaxLength(64)
  delivererCode?: string;

  @IsOptional() @IsString() @MaxLength(120)
  deliveryReference?: string;

  @IsDateString()
  deliveryDate!: string;

  @IsIn(['OLD', 'NEW'])
  stockClassification!: 'OLD' | 'NEW';

  @IsOptional() @IsString() @MaxLength(1000)
  remarks?: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => GoodsReceiptLineDto)
  items!: GoodsReceiptLineDto[];
}
