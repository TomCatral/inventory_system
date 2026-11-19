import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBorrowedSupplyDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  itemId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customItemName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  customUnit?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  borrowerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  borrowerEmpNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactNumber?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(999999999999)
  quantity!: number;

  @IsOptional()
  @IsIn(['PURCHASE', 'BASE'])
  unit?: 'PURCHASE' | 'BASE';

  @IsOptional()
  @IsIn(['GOOD', 'FAIR', 'POOR'])
  conditionAtBorrow?: 'GOOD' | 'FAIR' | 'POOR';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  purpose?: string;

  @IsOptional()
  @IsDateString()
  expectedReturnAt?: string;

  @IsOptional()
  @IsDateString()
  borrowedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000000)
  photoData?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  referenceNumber?: string;
}
