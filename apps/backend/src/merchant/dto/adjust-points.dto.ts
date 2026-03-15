import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min, Max, NotEquals } from 'class-validator';

export class AdjustPointsDto {
  @IsUUID()
  clientId: string;

  @IsInt({ message: 'Le nombre de points doit être un entier' })
  @IsNotEmpty({ message: 'Le nombre de points est requis' })
  @NotEquals(0, { message: 'Le nombre de points ne peut pas être zéro' })
  @Min(-10000, { message: 'Le nombre de points ne peut pas être inférieur à -10000' })
  @Max(100000, { message: 'Le nombre de points ne peut pas dépasser 100000' })
  points: number;

  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'La note ne peut pas dépasser 255 caractères' })
  note?: string;
}
