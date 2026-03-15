import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendNotificationDto {
  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire' })
  @MaxLength(100)
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Le contenu est obligatoire' })
  @MaxLength(500)
  body: string;
}
