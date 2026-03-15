import { IsString, IsNotEmpty, IsInt, Min, Max, MaxLength } from 'class-validator';

export class RecordWhatsappBlastDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  recipientCount: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sentCount: number;
}
