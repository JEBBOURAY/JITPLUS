import { IsInt, Min, Max } from 'class-validator';

export class RecordWhatsappUsageDto {
  @IsInt()
  @Min(0)
  @Max(10_000)
  messagesSent: number;
}
