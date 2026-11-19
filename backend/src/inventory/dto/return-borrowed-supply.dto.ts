import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReturnBorrowedSupplyDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  returnNotes?: string;
}
